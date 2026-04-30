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
  headers?: {
    get(name: string): string | null;
  };
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
  private readonly apiKey: string | undefined;
  private readonly defaultModel: string;
  private readonly requestTimeoutMs: number;
  private readonly retryCount: number;
  private readonly retryDelayMs: number;
  private readonly jsonRepairRetryCount: number;
  private readonly maxConcurrentRequests: number;
  private activeRequests = 0;
  private readonly requestQueue: Array<() => void> = [];

  constructor() {
    this.baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
    this.apiKey = process.env.OLLAMA_API_KEY?.trim() || undefined;
    this.defaultModel =
      process.env.LLM_MODEL ?? process.env.OLLAMA_MODEL ?? 'mistral';
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
    this.maxConcurrentRequests = readEnvNumber(
      'OLLAMA_MAX_CONCURRENT_REQUESTS',
      1,
      1,
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
        const response = await this.withRequestSlot(() =>
          fetchFn(url, {
            method: 'POST',
            headers: this.buildHeaders(),
            body: JSON.stringify({
              model: model ?? this.defaultModel,
              messages,
              format,
              options,
              stream: false,
            }),
            signal: AbortSignal.timeout(this.requestTimeoutMs),
          }),
        );

        if (!response.ok) {
          throw new OllamaHttpError(
            response.status,
            response.headers?.get('retry-after') ?? null,
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

        await sleep(getRetryDelayMs(error, this.retryDelayMs, attempt));
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

    for (let attempt = 0; attempt <= this.jsonRepairRetryCount; attempt += 1) {
      const content = await this.chat({
        ...options,
        format,
        messages,
      });

      try {
        return JSON.parse(this.normalizeJsonContent(content)) as T;
      } catch (error) {
        lastError = error;

        if (
          !(error instanceof SyntaxError) ||
          attempt >= this.jsonRepairRetryCount
        ) {
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

  private buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...(this.apiKey
        ? {
            Authorization: this.apiKey,
          }
        : {}),
    };
  }

  private async withRequestSlot<T>(operation: () => Promise<T>): Promise<T> {
    await this.acquireRequestSlot();

    try {
      return await operation();
    } finally {
      this.releaseRequestSlot();
    }
  }

  private async acquireRequestSlot(): Promise<void> {
    if (this.activeRequests < this.maxConcurrentRequests) {
      this.activeRequests += 1;
      return;
    }

    await new Promise<void>(resolve => {
      this.requestQueue.push(resolve);
    });
    this.activeRequests += 1;
  }

  private releaseRequestSlot(): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
    const next = this.requestQueue.shift();

    if (next) {
      next();
    }
  }
}

class OllamaHttpError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfter: string | null,
  ) {
    super(`Ollama chat request failed with status ${status}`);
  }
}

function readEnvNumber(name: string, fallback: number, min: number): number {
  const value = Number(process.env[name]);

  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.floor(value));
}

function isRetryableOllamaError(error: unknown): boolean {
  if (error instanceof OllamaHttpError) {
    return error.status === 429 || error.status >= 500;
  }

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

function getRetryDelayMs(
  error: unknown,
  retryDelayMs: number,
  attempt: number,
): number {
  if (error instanceof OllamaHttpError && error.retryAfter) {
    const retryAfterSeconds = Number(error.retryAfter);

    if (Number.isFinite(retryAfterSeconds)) {
      return Math.max(0, retryAfterSeconds * 1000);
    }
  }

  return retryDelayMs * (attempt + 1);
}
