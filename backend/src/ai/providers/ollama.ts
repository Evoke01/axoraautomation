import { z } from "zod";
import { env } from "../../config/env.js";
import type { AIProvider, CompletionOptions, CompletionResult, HealthStatus, Message, Tool } from "./base.js";

export class OllamaProvider implements AIProvider {
  readonly name = "ollama";
  readonly capabilities = ["text-generation", "structured-output"] as const;
  
  private baseUrl: string;
  private model: string;
  private embeddingModel: string;
  
  constructor() {
    this.baseUrl = env.OLLAMA_BASE_URL ?? "http://localhost:11434";
    this.model = env.OLLAMA_MODEL ?? "llama3.2:latest";
    this.embeddingModel = env.OLLAMA_EMBEDDING_MODEL ?? "nomic-embed-text:latest";
  }
  
  get isAvailable(): boolean {
    return Boolean(env.OLLAMA_BASE_URL || process.env.OLLAMA_ENABLED);
  }
  
  async complete<T>(options: CompletionOptions<T>): Promise<CompletionResult<T>> {
    const startTime = Date.now();
    
    const messages = this.buildMessages(options.prompt, options.tools);
    
    // Use structured output mode if schema is provided
    const format = this.zodToJsonSchema(options.schema);
    
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages,
        format: options.schema ? format : undefined,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: options.maxTokens ?? 2048,
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status} ${await response.text()}`);
    }
    
    const data = await response.json() as {
      message: { content: string; role: string };
      prompt_eval_count: number;
      eval_count: number;
    };
    
    const raw = data.message.content;
    
    // Parse and validate
    let parsed: T;
    try {
      const cleaned = this.cleanJson(raw);
      parsed = options.schema.parse(JSON.parse(cleaned));
    } catch (error) {
      // If structured output fails, try to extract JSON
      const extracted = this.extractJson(raw);
      if (extracted) {
        parsed = options.schema.parse(JSON.parse(extracted));
      } else {
        throw new Error(`Failed to parse Ollama output: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    return {
      content: parsed,
      raw,
      usage: {
        prompt: data.prompt_eval_count ?? 0,
        completion: data.eval_count ?? 0,
        total: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0)
      },
      latencyMs: Date.now() - startTime,
      provider: this.name,
      model: this.model,
      cached: false
    };
  }
  
  async *stream<T>(options: CompletionOptions<T>): AsyncIterable<{
    delta: string;
    content?: T;
    finishReason?: string;
  }> {
    const messages = this.buildMessages(options.prompt, options.tools);
    
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: true,
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: options.maxTokens ?? 2048,
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`Ollama streaming error: ${response.status}`);
    }
    
    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");
    
    let buffer = "";
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += new TextDecoder().decode(value);
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        try {
          const chunk = JSON.parse(line) as { message?: { content: string }; done?: boolean };
          
          if (chunk.message?.content) {
            yield {
              delta: chunk.message.content,
              finishReason: chunk.done ? "stop" : undefined
            };
          }
        } catch {
          // Skip invalid JSON lines
        }
      }
    }
  }
  
  async health(): Promise<HealthStatus> {
    const start = Date.now();
    
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: "GET",
        signal: AbortSignal.timeout(5000)
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
  
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];
    
    for (const text of texts) {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.embeddingModel,
          prompt: text
        })
      });
      
      if (!response.ok) {
        throw new Error(`Embedding error: ${response.status}`);
      }
      
      const data = await response.json() as { embedding: number[] };
      embeddings.push(data.embedding);
    }
    
    return embeddings;
  }
  
  private buildMessages(prompt: string | Message[], tools?: Tool[]): Array<{ role: string; content: string }> {
    let messages: Message[];
    
    if (typeof prompt === "string") {
      messages = [{ role: "user", content: prompt }];
    } else {
      messages = prompt;
    }
    
    // Add tool descriptions to system message
    if (tools && tools.length > 0) {
      const toolDesc = tools.map(t => 
        `- ${t.name}: ${t.description}\n  Parameters: ${JSON.stringify(this.zodToJsonSchema(t.parameters))}`
      ).join("\n");
      
      const systemMsg = messages.find(m => m.role === "system");
      if (systemMsg) {
        systemMsg.content += `\n\nAvailable tools:\n${toolDesc}\n\nTo use a tool, respond with JSON: {\"tool_calls\": [{\"name\": \"...\", \"parameters\": {...}}]}`;
      } else {
        messages.unshift({
          role: "system",
          content: `You have access to these tools:\n${toolDesc}\n\nTo use a tool, respond with JSON: {\"tool_calls\": [...]}`
        });
      }
    }
    
    return messages.map(m => ({
      role: m.role,
      content: m.content
    }));
  }
  
  private zodToJsonSchema(schema: z.ZodSchema): unknown {
    return this.zodTypeToJsonSchema(schema as z.ZodTypeAny);
  }
  
  private zodTypeToJsonSchema(zodType: z.ZodTypeAny): unknown {
    if (zodType instanceof z.ZodString) return { type: "string" };
    if (zodType instanceof z.ZodNumber) return { type: "number" };
    if (zodType instanceof z.ZodBoolean) return { type: "boolean" };
    if (zodType instanceof z.ZodEnum) return { type: "string", enum: zodType.options };
    if (zodType instanceof z.ZodArray) {
      return { type: "array", items: this.zodTypeToJsonSchema((zodType as any).element as z.ZodTypeAny) };
    }
    if (zodType instanceof z.ZodOptional) {
      return this.zodTypeToJsonSchema((zodType as any).unwrap() as z.ZodTypeAny);
    }
    if (zodType instanceof z.ZodObject) {
      const shape = zodType.shape;
      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        properties[key] = this.zodTypeToJsonSchema(value as z.ZodTypeAny);
        if (!(value instanceof z.ZodOptional)) {
          required.push(key);
        }
      }

      return {
        type: "object",
        properties,
        required
      };
    }

    return { type: "string" };
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
