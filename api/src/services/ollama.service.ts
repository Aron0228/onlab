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
  },
) => Promise<OllamaFetchResponse>;

@injectable({scope: BindingScope.SINGLETON})
export class OllamaService {
  private readonly baseUrl: string;
  private readonly defaultModel: string;

  constructor() {
    this.baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
    this.defaultModel = process.env.OLLAMA_MODEL ?? 'mistral';
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

    const response = await fetchFn(
      new URL('/api/chat', this.baseUrl).toString(),
      {
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
      },
    );

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
  }

  public async chatJson<T>(options: OllamaChatOptions): Promise<T> {
    const content = await this.chat({
      ...options,
      format: options.format ?? 'json',
    });

    return JSON.parse(this.normalizeJsonContent(content)) as T;
  }

  private normalizeJsonContent(content: string): string {
    return content.trim().replace(/^```json\s*|\s*```$/g, '');
  }
}
