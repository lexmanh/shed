import { OpenAICompatibleProvider } from './openai-compatible.js';

export class OllamaProvider extends OpenAICompatibleProvider {
  constructor(model = 'llama3.2', endpoint = 'http://localhost:11434') {
    super({
      apiKey: 'ollama', // Ollama doesn't require a real key
      model,
      baseURL: `${endpoint}/v1`,
      providerName: 'ollama',
      isLocal: true,
    });
  }
}
