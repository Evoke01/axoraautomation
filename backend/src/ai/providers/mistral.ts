import { z } from "zod";
import { env } from "../../config/env.js";
import type { AIProvider, Capability, CompletionOptions, CompletionResult, HealthStatus, Message } from "./base.js";

export class MistralProvider implements AIProvider {
  readonly name = "mistral";
  readonly capabilities: readonly Capability[] = ["text-generation", "structured-output"];

  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor() {
    this.apiKey = env.MISTRAL_API_KEY ?? "";
    this.baseUrl = env.MISTRAL_API_URL;
    this.model = env.MISTRAL_MODEL;
  }

  get isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  async complete<T>(options: CompletionOptions<T>): Promise<CompletionResult<T>> {
    const startTime = Date.now();

    const messages = this.buildMessages(options.prompt, options.schema);

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2048,
        response_format: options.schema ? { type: "json_object" } : undefined
      })
    });

    if (!response.ok) {
      throw new Error(`Mistral error: ${response.status} ${await response.text()}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };

    const raw = payload.choices?.[0]?.message?.content ?? "";

    let parsed: T;
    try {
      const cleaned = this.cleanJson(raw);
      parsed = options.schema.parse(JSON.parse(cleaned));
    } catch (error) {
      const extracted = this.extractJson(raw);
      if (extracted) {
        parsed = options.schema.parse(JSON.parse(extracted));
      } else {
        throw new Error(`Failed to parse Mistral output: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return {
      content: parsed,
      raw,
      usage: {
        prompt: payload.usage?.prompt_tokens ?? 0,
        completion: payload.usage?.completion_tokens ?? 0,
        total: payload.usage?.total_tokens ?? 0
      },
      latencyMs: Date.now() - startTime,
      provider: this.name,
      model: this.model,
      cached: false
    };
  }

  async health(): Promise<HealthStatus> {
    const start = Date.now();

    if (!this.apiKey) {
      return {
        healthy: false,
        latencyMs: 0,
        error: "API key not configured"
      };
    }

    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: "user", content: "Hi" }],
          max_tokens: 1
        })
      });

      return {
        healthy: response.ok,
        latencyMs: Date.now() - start
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private buildMessages(prompt: string | Message[], schema?: z.ZodSchema): Array<{ role: string; content: string }> {
    let messages: Message[];

    if (typeof prompt === "string") {
      messages = [{ role: "user", content: prompt }];
    } else {
      messages = [...prompt];
    }

    if (schema) {
      const systemMsg = messages.find(m => m.role === "system");
      const jsonInstruction = "You must respond with valid JSON only. No markdown, no explanations outside the JSON.";

      if (systemMsg) {
        systemMsg.content += `\n\n${jsonInstruction}`;
      } else {
        messages.unshift({
          role: "system",
          content: jsonInstruction
        });
      }
    }

    return messages.map(m => ({
      role: m.role,
      content: m.content
    }));
  }

  private cleanJson(raw: string): string {
    return raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }

  private extractJson(raw: string): string | null {
    const match = raw.match(/\{[\s\S]*\}/);
    return match ? match[0] : null;
  }
}
