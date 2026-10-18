// The tutor's model calls. Azure AI Foundry's OpenAI v1 Responses API
// (POST <endpoint>/responses, the deployment name as `model`, the key as a
// bearer token, no api-version) through plain fetch; and a stand-in model
// for tests and local end-to-end runs.

import type { ModelRole, TutorConfig } from './config';

export type ModelMessage = { role: 'user' | 'assistant'; content: string };

export type ModelRequest = {
  role: ModelRole;
  instructions: string;
  messages: ModelMessage[];
  maxTokens: number;
  /** Ask for JSON matching this schema (structured output). */
  schema?: { name: string; schema: Record<string, unknown> };
};

export type ModelReply = { text: string; inputTokens: number; outputTokens: number };

export interface TutorModel {
  complete(request: ModelRequest): Promise<ModelReply>;
}

/** A model call that failed: the service turns it into a polite 502. */
export class ModelError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 45_000;

type ResponsesBody = {
  output?: { type: string; content?: { type: string; text?: string }[] }[];
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string } | null;
};

export function azureModel(config: TutorConfig, fetchImpl: typeof fetch = fetch): TutorModel {
  return {
    async complete(request) {
      let res: Response;
      try {
        res = await fetchImpl(`${config.endpoint}/responses`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
          body: JSON.stringify({
            model: config.models[request.role],
            instructions: request.instructions,
            input: request.messages.map((m) => ({ role: m.role, content: m.content })),
            max_output_tokens: request.maxTokens,
            store: false,
            ...(request.schema && { text: { format: { type: 'json_schema', name: request.schema.name, schema: request.schema.schema, strict: true } } }),
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (e) {
        throw new ModelError(`The model request failed: ${(e as Error).message}`);
      }
      const body = (await res.json().catch(() => ({}))) as ResponsesBody;
      if (!res.ok) throw new ModelError(`The model answered ${res.status}: ${body.error?.message ?? 'no message'}`, res.status);
      const text = (body.output ?? [])
        .filter((item) => item.type === 'message')
        .flatMap((item) => item.content ?? [])
        .filter((c) => c.type === 'output_text')
        .map((c) => c.text ?? '')
        .join('');
      return { text, inputTokens: body.usage?.input_tokens ?? 0, outputTokens: body.usage?.output_tokens ?? 0 };
    },
  };
}

/**
 * A stand-in that answers without a network: a canned hint per level that
 * says which level and model it answered at, pointing at line 1 from level
 * 2 up, and a leak check that flags a reply containing "LEAK".
 */
export function fakeModel(): TutorModel {
  return {
    async complete(request) {
      if (request.schema?.name === 'leak_check') {
        const leaks = request.messages.some((m) => m.content.includes('LEAK'));
        return { text: JSON.stringify({ leaks, reason: leaks ? 'It contains the solution.' : '' }), inputTokens: 200, outputTokens: 10 };
      }
      const level = Number(/HINT LEVEL (\d)/.exec(request.instructions)?.[1] ?? 1);
      const message = `(${request.role} model, level ${level}) Think about what each step of your loop is responsible for, and check it against the failing test.`;
      return { text: JSON.stringify({ message, line: level >= 2 ? 1 : null }), inputTokens: 800, outputTokens: 60 };
    },
  };
}
