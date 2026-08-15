import type { Env } from '../types';
import type { ChatMessage } from './prompt';
import { AppError } from './http';

// Single seam for Phase 2 (AI Gateway universal endpoint: Workers AI primary
// -> Gemini fallback + caching). When that lands, only this function's body
// changes — callers keep calling generateDraft() and never see the
// provider swap. Never call env.AI.run() from anywhere else in the app.
export async function generateDraft(env: Env, messages: ChatMessage[]): Promise<string> {
  let result: unknown;
  try {
    result = await env.AI.run(env.AI_MODEL as keyof AiModels, { messages });
  } catch (err) {
    throw mapAiError(err);
  }

  const text = extractText(result);
  if (!text) {
    throw new AppError(
      'The AI model returned an empty response. Try again.',
      502,
      'AI_EMPTY_RESPONSE'
    );
  }
  return text;
}

interface OpenAiCompatibleResult {
  choices?: { message?: { content?: unknown } }[];
}

// Workers AI text-generation models reply in one of two shapes depending on
// the model: older ones return the simple `{response: string}` object this
// binding's own docs show, but current reasoning models (e.g. glm-4.7-flash,
// confirmed against a live local `wrangler dev` call) return a full
// OpenAI-compatible chat.completion object with the actual text nested at
// choices[0].message.content and the model's chain-of-thought in a sibling
// `reasoning`/`reasoning_content` field, which must NOT be surfaced as the
// draft. Handle both shapes so swapping AI_MODEL never silently breaks this.
function extractText(result: unknown): string | null {
  if (!result || typeof result !== 'object') {
    return null;
  }

  if ('response' in result) {
    const response = (result as { response?: unknown }).response;
    if (typeof response === 'string' && response.trim().length > 0) {
      return response.trim();
    }
  }

  const content = (result as OpenAiCompatibleResult).choices?.[0]?.message?.content;
  if (typeof content === 'string' && content.trim().length > 0) {
    return content.trim();
  }

  return null;
}

// Workers AI error codes are documented at
// developers.cloudflare.com/workers-ai/platform/errors/ — 3036 is the free
// daily neuron cap, 3040 is transient out-of-capacity. Both are worth
// telling the user about specifically rather than a generic "AI failed,"
// since the fix (wait for UTC midnight vs. just retry) is different.
function mapAiError(err: unknown): AppError {
  const message = err instanceof Error ? err.message : String(err);

  if (message.includes('3036')) {
    return new AppError(
      "Today's free Workers AI limit (10,000 neurons) is used up. Resets at 00:00 UTC.",
      429,
      'AI_QUOTA_EXCEEDED'
    );
  }
  if (message.includes('3040')) {
    return new AppError(
      'Workers AI is temporarily out of capacity for this model. Try again shortly.',
      503,
      'AI_OUT_OF_CAPACITY'
    );
  }
  return new AppError(`AI draft generation failed: ${message}`, 502, 'AI_REQUEST_FAILED');
}
