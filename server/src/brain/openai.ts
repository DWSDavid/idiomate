import type { LLMProvider } from './provider.js';

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

export class OpenAIProvider implements LLMProvider {
  constructor(private readonly apiKey: string) {}

  async complete(opts: { system: string; user: string; model: string }): Promise<string> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: opts.model,
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.user },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4,
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI request failed: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as ChatCompletionResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI response did not include message content');
    }
    return content;
  }
}
