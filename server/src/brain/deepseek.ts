import type { LLMProvider } from './provider.js';

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

interface DeepSeekProviderOptions {
  baseUrl?: string;
}

export class DeepSeekProvider implements LLMProvider {
  private readonly baseUrl: string;

  constructor(
    private readonly apiKey: string,
    options: DeepSeekProviderOptions = {},
  ) {
    this.baseUrl = (options.baseUrl ?? 'https://api.deepseek.com').replace(/\/$/, '');
  }

  async complete(opts: { system: string; user: string; model: string }): Promise<string> {
    const body: Record<string, unknown> = {
      model: opts.model,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.4,
      max_tokens: 4096,
    };

    if (opts.model.startsWith('deepseek-v4')) {
      body.thinking = { type: 'disabled' };
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error(`DeepSeek request failed: ${res.status} ${await res.text()}`);
      }

      const data = (await res.json()) as ChatCompletionResponse;
      const content = data.choices?.[0]?.message?.content;
      if (content) return content;
    }

    throw new Error('DeepSeek response did not include message content');
  }
}
