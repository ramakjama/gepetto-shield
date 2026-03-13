import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis.service';

interface LlmProvider {
  name: string;
  endpoint: string;
  apiKey: string;
  model: string;
  failures: number;
  lastFailure: number;
}

interface LlmResponse {
  content: string;
  tokensIn: number;
  tokensOut: number;
  provider: string;
  latencyMs: number;
}

/**
 * Multi-provider LLM service with circuit breaker and fallback chain.
 * Providers: Azure OpenAI → Groq → Gemini
 * 3 consecutive failures → circuit open for 5 minutes.
 */
@Injectable()
export class LlmService {
  private providers: LlmProvider[];
  private readonly CIRCUIT_THRESHOLD = 3;
  private readonly CIRCUIT_RESET_MS = 5 * 60 * 1000;

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.providers = [
      {
        name: 'azure-openai',
        endpoint: this.config.get('AZURE_OPENAI_ENDPOINT', ''),
        apiKey: this.config.get('AZURE_OPENAI_KEY', ''),
        model: this.config.get('AZURE_OPENAI_DEPLOYMENT', 'gpt-4o'),
        failures: 0,
        lastFailure: 0,
      },
      {
        name: 'groq',
        endpoint: 'https://api.groq.com/openai/v1/chat/completions',
        apiKey: this.config.get('GROQ_API_KEY', ''),
        model: 'llama-3.3-70b-versatile',
        failures: 0,
        lastFailure: 0,
      },
      {
        name: 'gemini',
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
        apiKey: this.config.get('GEMINI_API_KEY', ''),
        model: 'gemini-2.0-flash',
        failures: 0,
        lastFailure: 0,
      },
    ];
  }

  /**
   * Execute LLM call with circuit breaker and fallback chain.
   */
  async chat(
    systemPrompt: string,
    userMessage: string,
    context?: string,
  ): Promise<LlmResponse> {
    for (const provider of this.providers) {
      if (this.isCircuitOpen(provider)) continue;
      if (!provider.apiKey) continue;

      try {
        const start = Date.now();
        const result = await this.callProvider(provider, systemPrompt, userMessage, context);
        provider.failures = 0;
        return { ...result, provider: provider.name, latencyMs: Date.now() - start };
      } catch (err) {
        provider.failures++;
        provider.lastFailure = Date.now();
        console.error(`[LLM] ${provider.name} failed (${provider.failures}/${this.CIRCUIT_THRESHOLD}):`, err);
      }
    }

    throw new Error('All LLM providers failed — circuit breaker open');
  }

  private isCircuitOpen(provider: LlmProvider): boolean {
    if (provider.failures < this.CIRCUIT_THRESHOLD) return false;
    if (Date.now() - provider.lastFailure > this.CIRCUIT_RESET_MS) {
      provider.failures = 0; // Half-open: allow retry
      return false;
    }
    return true;
  }

  private async callProvider(
    provider: LlmProvider,
    systemPrompt: string,
    userMessage: string,
    context?: string,
  ): Promise<Omit<LlmResponse, 'provider' | 'latencyMs'>> {
    const messages: any[] = [
      { role: 'system', content: systemPrompt },
    ];

    if (context) {
      messages.push({
        role: 'system',
        content: `Contexto recuperado (datos verificados del asegurado):\n${context}`,
      });
    }

    messages.push({ role: 'user', content: userMessage });

    if (provider.name === 'gemini') {
      return this.callGemini(provider, messages);
    }

    // OpenAI-compatible API (Azure OpenAI, Groq)
    const endpoint = provider.name === 'azure-openai'
      ? `${provider.endpoint}/openai/deployments/${provider.model}/chat/completions?api-version=2024-06-01`
      : provider.endpoint;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (provider.name === 'azure-openai') {
      headers['api-key'] = provider.apiKey;
    } else {
      headers['Authorization'] = `Bearer ${provider.apiKey}`;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: provider.model,
        messages,
        temperature: 0.3,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      throw new Error(`${provider.name} HTTP ${response.status}`);
    }

    const data = await response.json();
    return {
      content: data.choices[0].message.content,
      tokensIn: data.usage?.prompt_tokens || 0,
      tokensOut: data.usage?.completion_tokens || 0,
    };
  }

  private async callGemini(
    provider: LlmProvider,
    messages: any[],
  ): Promise<Omit<LlmResponse, 'provider' | 'latencyMs'>> {
    const response = await fetch(
      `${provider.endpoint}/${provider.model}:generateContent?key=${provider.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: messages.map((m) => ({
            role: m.role === 'system' ? 'user' : m.role,
            parts: [{ text: m.content }],
          })),
          generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Gemini HTTP ${response.status}`);
    }

    const data = await response.json();
    return {
      content: data.candidates[0].content.parts[0].text,
      tokensIn: data.usageMetadata?.promptTokenCount || 0,
      tokensOut: data.usageMetadata?.candidatesTokenCount || 0,
    };
  }
}
