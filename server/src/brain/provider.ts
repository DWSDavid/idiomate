export interface LLMProvider {
  complete(opts: { system: string; user: string; model: string }): Promise<string>;
}
