import { z } from "zod";

export interface AIProvider {
  readonly name: string;
  readonly capabilities: readonly Capability[];
  readonly isAvailable: boolean;
  
  complete<T>(options: CompletionOptions<T>): Promise<CompletionResult<T>>;
  stream?<T>(options: CompletionOptions<T>): AsyncIterable<CompletionChunk<T>>;
  health(): Promise<HealthStatus>;
}

export type Capability = 
  | "text-generation" 
  | "image-analysis" 
  | "video-analysis" 
  | "embedding" 
  | "classification"
  | "structured-output";

export interface CompletionOptions<T> {
  prompt: string | Message[];
  schema: z.ZodSchema<T>;
  tools?: Tool[];
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface CompletionResult<T> {
  content: T;
  raw: string;
  usage: TokenUsage;
  latencyMs: number;
  provider: string;
  model: string;
  cached: boolean;
}

export interface CompletionChunk<T> {
  delta: string;
  content?: T;
  finishReason?: string;
}

export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

export interface HealthStatus {
  healthy: boolean;
  latencyMs: number;
  error?: string;
}

export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

export interface Tool {
  name: string;
  description: string;
  parameters: z.ZodSchema;
  execute: (params: unknown, context: ToolContext) => Promise<unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  parameters: unknown;
}

export interface ToolResult {
  toolCallId: string;
  result: unknown;
  error?: string;
}

export interface ToolContext {
  workspaceId: string;
  assetId?: string;
  prisma: unknown;
  services: unknown;
}

export class ProviderChain implements AIProvider {
  readonly name = "chain";
  readonly capabilities: Capability[] = [];
  
  constructor(private providers: AIProvider[]) {}
  
  get isAvailable(): boolean {
    return this.providers.some(p => p.isAvailable);
  }
  
  async complete<T>(options: CompletionOptions<T>): Promise<CompletionResult<T>> {
    const errors: string[] = [];
    
    for (const provider of this.providers) {
      if (!provider.isAvailable) continue;
      
      try {
        const result = await provider.complete(options);
        return result;
      } catch (error) {
        errors.push(`${provider.name}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
    }
    
    throw new Error(`All providers failed: ${errors.join("; ")}`);
  }
  
  async health(): Promise<HealthStatus> {
    const results = await Promise.all(
      this.providers.map(p => p.health().catch(() => ({ healthy: false, latencyMs: 0 })))
    );
    
    const healthy = results.some(r => r.healthy);
    const avgLatency = results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length;
    
    return { healthy, latencyMs: avgLatency };
  }
}
