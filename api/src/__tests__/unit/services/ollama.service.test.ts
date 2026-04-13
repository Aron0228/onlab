import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {OllamaService} from '../../../services';

type MockFetch = ReturnType<typeof vi.fn>;
type TestFetch = (...args: unknown[]) => Promise<unknown>;

describe('OllamaService (unit)', () => {
  const originalFetch = getGlobalFetch();
  const originalEnv = {
    LLM_MODEL: process.env.LLM_MODEL,
    OLLAMA_API_KEY: process.env.OLLAMA_API_KEY,
    OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
    OLLAMA_MODEL: process.env.OLLAMA_MODEL,
    OLLAMA_REQUEST_TIMEOUT_MS: process.env.OLLAMA_REQUEST_TIMEOUT_MS,
    OLLAMA_RETRY_COUNT: process.env.OLLAMA_RETRY_COUNT,
    OLLAMA_RETRY_DELAY_MS: process.env.OLLAMA_RETRY_DELAY_MS,
    OLLAMA_JSON_REPAIR_RETRY_COUNT: process.env.OLLAMA_JSON_REPAIR_RETRY_COUNT,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.LLM_MODEL;
    delete process.env.OLLAMA_API_KEY;
    delete process.env.OLLAMA_BASE_URL;
    delete process.env.OLLAMA_MODEL;
    delete process.env.OLLAMA_REQUEST_TIMEOUT_MS;
    delete process.env.OLLAMA_RETRY_COUNT;
    delete process.env.OLLAMA_RETRY_DELAY_MS;
    delete process.env.OLLAMA_JSON_REPAIR_RETRY_COUNT;
  });

  afterEach(() => {
    setGlobalFetch(originalFetch);
    restoreEnv();
  });

  it('posts chat requests to Ollama and returns the response content', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        message: {
          content: 'hello from ollama',
        },
      }),
    });
    setGlobalFetch(fetchMock);

    const service = new OllamaService();

    await expect(
      service.chat({
        messages: [{role: 'user', content: 'Ping'}],
      }),
    ).resolves.toBe('hello from ollama');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:11434/api/chat',
      expect.objectContaining({
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('prefers LLM_MODEL when selecting the default model', async () => {
    process.env.LLM_MODEL = 'qwen3-coder:30b';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        message: {
          content: 'hello from ollama',
        },
      }),
    });
    setGlobalFetch(fetchMock);

    const service = new OllamaService();

    await service.chat({
      messages: [{role: 'user', content: 'Ping'}],
    });

    const [, requestInit] = fetchMock.mock.calls[0] as [
      string,
      {body?: string},
    ];

    expect(requestInit.body).toContain('"model":"qwen3-coder:30b"');
  });

  it('adds direct authentication when OLLAMA_API_KEY is configured', async () => {
    process.env.OLLAMA_BASE_URL = 'https://ollama.com/api';
    process.env.OLLAMA_API_KEY = 'secret-token';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        message: {
          content: 'hello from ollama cloud',
        },
      }),
    });
    setGlobalFetch(fetchMock);

    const service = new OllamaService();

    await service.chat({
      messages: [{role: 'user', content: 'Ping'}],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://ollama.com/api/chat',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'secret-token',
        },
      }),
    );
  });

  it('retries header timeouts before succeeding', async () => {
    process.env.OLLAMA_RETRY_COUNT = '1';
    process.env.OLLAMA_RETRY_DELAY_MS = '0';

    const timeoutError = new TypeError('fetch failed');
    Object.assign(timeoutError, {
      cause: {code: 'UND_ERR_HEADERS_TIMEOUT'},
    });

    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(timeoutError)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          message: {
            content: '{"priority":"Low"}',
          },
        }),
      });
    setGlobalFetch(fetchMock);

    const service = new OllamaService();

    await expect(
      service.chatJson<{priority: string}>({
        messages: [{role: 'user', content: 'Classify this'}],
      }),
    ).resolves.toEqual({priority: 'Low'});
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('surfaces a useful timeout error when retries are exhausted', async () => {
    process.env.OLLAMA_REQUEST_TIMEOUT_MS = '1500';
    process.env.OLLAMA_RETRY_COUNT = '0';

    const timeoutError = new TypeError('fetch failed');
    Object.assign(timeoutError, {
      cause: {code: 'UND_ERR_HEADERS_TIMEOUT'},
    });

    setGlobalFetch(vi.fn().mockRejectedValue(timeoutError));

    const service = new OllamaService();

    await expect(
      service.chat({
        messages: [{role: 'user', content: 'Still there?'}],
      }),
    ).rejects.toThrow(
      'Ollama chat request timed out after 1500ms (1 attempt(s)).',
    );
  });

  it('retries once when the model returns malformed JSON', async () => {
    process.env.OLLAMA_JSON_REPAIR_RETRY_COUNT = '1';

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          message: {
            content:
              '{"type":"final","findings":[{"path":"src/app.ts""line":10}]}',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          message: {
            content:
              '{"type":"final","findings":[{"path":"src/app.ts","line":10}]}',
          },
        }),
      });
    setGlobalFetch(fetchMock);

    const service = new OllamaService();

    await expect(
      service.chatJson<{
        type: string;
        findings: Array<{path: string; line: number}>;
      }>({
        messages: [{role: 'user', content: 'Review this pull request'}],
      }),
    ).resolves.toEqual({
      type: 'final',
      findings: [{path: 'src/app.ts', line: 10}],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondCall = fetchMock.mock.calls[1]?.[1] as {body?: string};
    expect(secondCall.body).toContain(
      'Your previous response was not valid JSON.',
    );
  });

  function restoreEnv() {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
        continue;
      }

      process.env[key] = value;
    }
  }

  function getGlobalFetch(): TestFetch | undefined {
    return (globalThis as typeof globalThis & {fetch?: TestFetch}).fetch;
  }

  function setGlobalFetch(fetchMock: MockFetch | TestFetch | undefined) {
    (globalThis as typeof globalThis & {fetch?: TestFetch}).fetch =
      fetchMock as TestFetch | undefined;
  }
});
