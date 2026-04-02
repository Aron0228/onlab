import {BindingScope, injectable} from '@loopback/core';

type OllamaChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type OllamaChatOptions = {
  model?: string;
  messages: OllamaChatMessage[];
  format?: 'json' | Record<string, unknown>;
  options?: Record<string, unknown>;
};

type OllamaChatResponse = {
  message?: {
    content?: string;
  };
};

type OllamaFetchResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

type OllamaFetch = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<OllamaFetchResponse>;

@injectable({scope: BindingScope.SINGLETON})
export class OllamaService {
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly requestTimeoutMs: number;
  private readonly retryCount: number;
  private readonly retryDelayMs: number;
  private readonly jsonRepairRetryCount: number;

  constructor() {
    this.baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
    this.defaultModel = process.env.OLLAMA_MODEL ?? 'mistral';
    this.requestTimeoutMs = readEnvNumber(
      'OLLAMA_REQUEST_TIMEOUT_MS',
      120_000,
      1_000,
    );
    this.retryCount = readEnvNumber('OLLAMA_RETRY_COUNT', 1, 0);
    this.retryDelayMs = readEnvNumber('OLLAMA_RETRY_DELAY_MS', 1_000, 0);
    this.jsonRepairRetryCount = readEnvNumber(
      'OLLAMA_JSON_REPAIR_RETRY_COUNT',
      1,
      0,
    );
  }

  public async chat({
    model,
    messages,
    format,
    options,
  }: OllamaChatOptions): Promise<string> {
    const fetchFn = (globalThis as {fetch?: OllamaFetch}).fetch;

    if (!fetchFn) {
      throw new Error('Global fetch is not available for Ollama requests');
    }

    const url = new URL('/api/chat', this.baseUrl).toString();
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.retryCount; attempt += 1) {
      try {
        const response = await fetchFn(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: model ?? this.defaultModel,
            messages,
            format,
            options,
            stream: false,
          }),
          signal: AbortSignal.timeout(this.requestTimeoutMs),
        });

        if (!response.ok) {
          throw new Error(
            `Ollama chat request failed with status ${response.status}`,
          );
        }

        const data = (await response.json()) as OllamaChatResponse;

        if (!data.message?.content) {
          throw new Error('Ollama chat response did not contain a message');
        }

        return data.message.content;
      } catch (error) {
        lastError = error;

        if (!isRetryableOllamaError(error) || attempt >= this.retryCount) {
          break;
        }

        await sleep(this.retryDelayMs * (attempt + 1));
      }
    }

    if (isTimeoutLikeOllamaError(lastError)) {
      throw new Error(
        `Ollama chat request timed out after ${this.requestTimeoutMs}ms (${this.retryCount + 1} attempt(s)).`,
      );
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Ollama chat request failed');
  }

  public async chatJson<T>(options: OllamaChatOptions): Promise<T> {
    const format = options.format ?? 'json';
    let messages = [...options.messages];
    let lastError: unknown;

    for (
      let attempt = 0;
      attempt <= this.jsonRepairRetryCount;
      attempt += 1
    ) {
      const content = await this.chat({
        ...options,
        format,
        messages,
      });

      try {
        return JSON.parse(this.normalizeJsonContent(content)) as T;
      } catch (error) {
        lastError = error;

        if (!(error instanceof SyntaxError) || attempt >= this.jsonRepairRetryCount) {
          break;
        }

        messages = [
          ...messages,
          {
            role: 'assistant',
            content,
          },
          {
            role: 'user',
            content: [
              'Your previous response was not valid JSON.',
              'Return the same answer again as strictly valid JSON only.',
              'Do not include markdown fences, commentary, or trailing text.',
            ].join(' '),
          },
        ];
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Ollama JSON response parsing failed');
  }

  private normalizeJsonContent(content: string): string {
    return content.trim().replace(/^```json\s*|\s*```$/g, '');
  }
}

function readEnvNumber(
  name: string,
  fallback: number,
  min: number,
): number {
  const value = Number(process.env[name]);

  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.floor(value));
}

function isRetryableOllamaError(error: unknown): boolean {
  return isTimeoutLikeOllamaError(error);
}

function isTimeoutLikeOllamaError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const cause = 'cause' in error ? error.cause : undefined;
  const causeCode =
    cause && typeof cause === 'object' && 'code' in cause
      ? cause.code
      : undefined;

  return (
    error.name === 'TimeoutError' ||
    error.name === 'AbortError' ||
    causeCode === 'UND_ERR_HEADERS_TIMEOUT'
  );
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}
