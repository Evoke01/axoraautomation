import OpenAI from "openai";
import { z } from "zod";
import { env } from "../../config/env.js";
import type { AIProvider, Capability, CompletionOptions, CompletionResult, CompletionChunk, HealthStatus, Message } from "./base.js";

export class GroqProvider implements AIProvider {
  readonly name = "groq";
  readonly capabilities: Capability[] = ["text-generation", "structured-output"];
  
  private client: OpenAI | null = null;
  private model: string;
  
  constructor() {
    this.model = env.GROQ_MODEL ?? "llama-3.1-8b-instant";
    
    if (env.GROQ_API_KEY) {
      this.client = new OpenAI({
        apiKey: env.GROQ_API_KEY,
        baseURL: env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1"
      });
    }
  }
  
  get isAvailable(): boolean {
    return this.client !== null;
  }
  
  async complete<T>(options: CompletionOptions<T>): Promise<CompletionResult<T>> {
    if (!this.client) {
      throw new Error("Groq client not initialized");
    }
    
    const startTime = Date.now();
    
    const messages = this.buildMessages(options.prompt, options.schema);
    
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: messages as OpenAI.ChatCompletionMessageParam[],
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
      response_format: options.schema ? { type: "json_object" } : undefined
    });
    
    const raw = response.choices[0]?.message?.content ?? "";
    
    // Parse and validate
    let parsed: T;
    try {
      const cleaned = this.cleanJson(raw);
      parsed = options.schema.parse(JSON.parse(cleaned));
    } catch (error) {
      const extracted = this.extractJson(raw);
      if (extracted) {
        parsed = options.schema.parse(JSON.parse(extracted));
      } else {
        throw new Error(`Failed to parse Groq output: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    return {
      content: parsed,
      raw,
      usage: {
        prompt: response.usage?.prompt_tokens ?? 0,
        completion: response.usage?.completion_tokens ?? 0,
        total: response.usage?.total_tokens ?? 0
      },
      latencyMs: Date.now() - startTime,
      provider: this.name,
      model: this.model,
      cached: false
    };
  }
  
  async *stream<T>(options: CompletionOptions<T>): AsyncIterable<CompletionChunk<T>> {
    if (!this.client) {
      throw new Error("Groq client not initialized");
    }
    
    const messages = this.buildMessages(options.prompt, options.schema);
    
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: messages as OpenAI.ChatCompletionMessageParam[],
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
      stream: true
    });
    
    let buffer = "";
    
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      buffer += delta;
      
      yield {
        delta,
        finishReason: chunk.choices[0]?.finish_reason ?? undefined
      };
    }
  }
  
  async health(): Promise<HealthStatus> {
    const start = Date.now();
    
    if (!this.client) {
      return {
        healthy: false,
        latencyMs: 0,
        error: "Client not initialized"
      };
    }
    
    try {
      // Quick test with minimal request
      await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 1
      });
      
      return {
        healthy: true,
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
      messages = prompt;
    }
    
    // Add JSON instruction for structured output
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
