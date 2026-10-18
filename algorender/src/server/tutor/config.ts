// The AI tutor's settings, all from the environment, so models, prices and
// limits change without a code change. The tutor is off unless an Azure AI
// Foundry endpoint and key are set (and TUTOR_ENABLED isn't 'off', the kill
// switch).
//
//   AZURE_AI_ENDPOINT        the resource's OpenAI v1 base URL, e.g.
//                            https://<resource>.openai.azure.com/openai/v1
//   AZURE_AI_API_KEY         its key (sent as a bearer token)
//   TUTOR_MODEL_FAST         deployment for hints and the leak check (gpt-6.1-luna)
//   TUTOR_MODEL_STRONG       deployment for code review (gpt-6.1-sol)
//   TUTOR_PRICE_FAST         "<input>,<output>" US dollars per million tokens
//   TUTOR_PRICE_STRONG       likewise, for the strong model
//   TUTOR_TURNS_PER_DAY      turns each learner may take a day (30)
//   TUTOR_DAILY_USD          spend across everyone after which the tutor rests until tomorrow (5)
//   TUTOR_ENABLED            'off' switches the tutor off
//   TUTOR_PROVIDER           'fake' answers from a stand-in model (tests and local e2e only; refused on Vercel)

export type ModelRole = 'fast' | 'strong';

export type TutorConfig = {
  provider: 'azure' | 'fake';
  endpoint: string;
  apiKey: string;
  models: Record<ModelRole, string>;
  /** Dollars per million tokens, input then output. */
  prices: Record<ModelRole, { input: number; output: number }>;
  turnsPerDay: number;
  dailyUsd: number;
};

const number = (value: string | undefined, fallback: number) => (value && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : fallback);

/**
 * Price defaults are deliberately on the high side, so an unpriced model
 * trips the daily cap early rather than late: set the real prices.
 */
function price(value: string | undefined, fallback: { input: number; output: number }) {
  const [input, output] = (value ?? '').split(',').map((v) => Number(v.trim()));
  return Number.isFinite(input) && Number.isFinite(output) && input >= 0 && output >= 0 ? { input, output } : fallback;
}

/** The tutor's settings, or null when it is switched off or not set up. */
export function tutorConfig(env: Record<string, string | undefined> = process.env): TutorConfig | null {
  if ((env.TUTOR_ENABLED ?? '').toLowerCase() === 'off') return null;
  const fake = env.TUTOR_PROVIDER === 'fake' && !env.VERCEL;
  const endpoint = (env.AZURE_AI_ENDPOINT ?? '').replace(/\/+$/, '');
  const apiKey = env.AZURE_AI_API_KEY ?? '';
  if (!fake && (!endpoint || !apiKey)) return null;
  return {
    provider: fake ? 'fake' : 'azure',
    endpoint,
    apiKey,
    models: { fast: env.TUTOR_MODEL_FAST || 'gpt-6.1-luna', strong: env.TUTOR_MODEL_STRONG || 'gpt-6.1-sol' },
    prices: { fast: price(env.TUTOR_PRICE_FAST, { input: 1, output: 4 }), strong: price(env.TUTOR_PRICE_STRONG, { input: 5, output: 20 }) },
    turnsPerDay: number(env.TUTOR_TURNS_PER_DAY, 30),
    dailyUsd: number(env.TUTOR_DAILY_USD, 5),
  };
}

export const costOf = (config: TutorConfig, role: ModelRole, inputTokens: number, outputTokens: number) =>
  (inputTokens * config.prices[role].input + outputTokens * config.prices[role].output) / 1_000_000;
