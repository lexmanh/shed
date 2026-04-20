import { OpenAICompatibleProvider } from './openai-compatible.js';

export class GroqProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, model = 'llama-3.3-70b-versatile') {
    super({
      apiKey,
      model,
      baseURL: 'https://api.groq.com/openai/v1',
      providerName: 'groq',
    });
  }
}
