// Provider-agnostic LLM client for Supabase Edge Functions
// Supports Gemini and Groq via OpenAI-compatible API format

interface LLMProvider {
  name: string;
  baseUrl: string;
  apiKeyEnvVar: string;
  model: string;
}

const PROVIDERS: Record<string, LLMProvider> = {
  gemini: {
    name: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKeyEnvVar: 'GEMINI_API_KEY',
    model: 'gemini-2.0-flash',
  },
  groq: {
    name: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKeyEnvVar: 'GROQ_API_KEY',
    model: 'llama-3.3-70b-versatile',
  },
};

interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

async function chatCompletion(
  provider: LLMProvider,
  systemPrompt: string,
  userPrompt: string,
  temperature: number = 0.7,
  timeoutMs: number = 15000
): Promise<string> {
  const apiKey = Deno.env.get(provider.apiKeyEnvVar);
  if (!apiKey) {
    throw new Error(`Missing API key: ${provider.apiKeyEnvVar}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature,
        max_tokens: 1024,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${provider.name} API error ${response.status}: ${errorText}`);
    }

    const data: ChatCompletionResponse = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error(`${provider.name} returned empty response`);
    }

    return content.trim();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Generate text with automatic fallback from primary to secondary provider.
 */
export async function generateWithFallback(
  systemPrompt: string,
  userPrompt: string,
  temperature: number = 0.7
): Promise<{ text: string; provider: string }> {
  const primaryName = Deno.env.get('LLM_PRIMARY_PROVIDER') || 'gemini';
  const fallbackName = primaryName === 'gemini' ? 'groq' : 'gemini';

  const primary = PROVIDERS[primaryName];
  const fallback = PROVIDERS[fallbackName];

  // Try primary provider
  if (primary && Deno.env.get(primary.apiKeyEnvVar)) {
    try {
      const text = await chatCompletion(primary, systemPrompt, userPrompt, temperature);
      return { text, provider: primary.name };
    } catch (error) {
      console.error(`Primary provider (${primary.name}) failed:`, error.message);
    }
  }

  // Try fallback provider
  if (fallback && Deno.env.get(fallback.apiKeyEnvVar)) {
    try {
      const text = await chatCompletion(fallback, systemPrompt, userPrompt, temperature);
      return { text, provider: fallback.name };
    } catch (error) {
      console.error(`Fallback provider (${fallback.name}) failed:`, error.message);
    }
  }

  throw new Error('All LLM providers failed or no API keys configured');
}
