import { z } from "zod";
import type { AIProvider, Message, Tool, ToolContext } from "../ai/providers/base.js";
export type { AIProvider, Message, Tool, ToolContext } from "../ai/providers/base.js";

export interface Agent {
  readonly id: string;
  readonly purpose: string;
  readonly capabilities: string[];
  
  canHandle(context: AgentContext): boolean;
  execute(context: AgentContext): Promise<AgentResult>;
}

export interface AgentContext {
  workspaceId: string;
  assetId?: string;
  creatorId?: string;
  userId?: string;
  input: Record<string, unknown>;
  memory: AgentMemory;
  tools: ToolRegistry;
  prisma: unknown;
  services: unknown;
  iteration: number;
  maxIterations: number;
}

export interface AgentMemory {
  // Short-term: current execution context
  shortTerm: Map<string, unknown>;
  
  // Long-term: persistent across executions
  longTerm: {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
    search(query: string): Promise<Array<{ key: string; value: unknown; score: number }>>;
  };
  
  // Conversation history for this session
  conversation: Array<{ role: "system" | "user" | "assistant" | "tool"; content: string; metadata?: Record<string, unknown> }>;
  
  addToConversation(message: { role: "user" | "assistant" | "tool"; content: string; metadata?: Record<string, unknown> }): void;
}

export interface ToolRegistry {
  get(name: string): Tool | undefined;
  list(): Tool[];
  execute(name: string, params: unknown, context: ToolContext): Promise<unknown>;
}

export interface AgentResult {
  success: boolean;
  output: Record<string, unknown>;
  decision: AgentDecision;
  reasoning: string;
  toolCalls: ToolExecution[];
  latencyMs: number;
  tokenUsage: { prompt: number; completion: number; total: number };
}

export type AgentDecision = 
  | { type: "complete"; nextAgent?: string }
  | { type: "retry"; reason: string; maxRetries?: number }
  | { type: "escalate"; to: string; reason: string }
  | { type: "delegate"; to: string; input: Record<string, unknown> }
  | { type: "halt"; reason: string };

export interface ToolExecution {
  tool: string;
  params: unknown;
  result: unknown;
  error?: string;
  latencyMs: number;
}

export abstract class BaseAgent implements Agent {
  abstract readonly id: string;
  abstract readonly purpose: string;
  abstract readonly capabilities: string[];
  
  protected provider: AIProvider;
  protected tools: Tool[];
  
  constructor(provider: AIProvider, tools: Tool[] = []) {
    this.provider = provider;
    this.tools = tools;
  }
  
  abstract canHandle(context: AgentContext): boolean;
  
  async execute(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now();
    const toolCalls: ToolExecution[] = [];
    
    try {
      // Build prompt with memory and tools
      const prompt = this.buildPrompt(context);
      
      // Call AI with structured output
      const schema = this.getOutputSchema();
      
      const result = await this.provider.complete({
        prompt,
        schema,
        tools: this.tools,
        temperature: 0.7,
        maxTokens: 2048
      });
      
      // Parse decision
      const decision = this.parseDecision(result.content as Record<string, unknown>);
      
      // Execute tools if needed
      if (decision.type === "delegate" || (result.content as Record<string, unknown>).toolCalls) {
        const calls = (result.content as Record<string, unknown>).toolCalls as Array<{ name: string; parameters: unknown }>;
        
        for (const call of calls ?? []) {
          const toolStart = Date.now();
          
          try {
            const toolResult = await context.tools.execute(
              call.name,
              call.parameters,
              {
                workspaceId: context.workspaceId,
                assetId: context.assetId,
                prisma: context.prisma,
                services: context.services
              }
            );
            
            toolCalls.push({
              tool: call.name,
              params: call.parameters,
              result: toolResult,
              latencyMs: Date.now() - toolStart
            });
            
            // Add tool result to memory
            context.memory.addToConversation({
              role: "tool",
              content: JSON.stringify(toolResult),
              metadata: { tool: call.name }
            });
          } catch (error) {
            toolCalls.push({
              tool: call.name,
              params: call.parameters,
              result: null,
              error: error instanceof Error ? error.message : String(error),
              latencyMs: Date.now() - toolStart
            });
          }
        }
      }
      
      return {
        success: true,
        output: result.content as Record<string, unknown>,
        decision,
        reasoning: (result.content as Record<string, unknown>).reasoning as string || "No reasoning provided",
        toolCalls,
        latencyMs: Date.now() - startTime,
        tokenUsage: result.usage
      };
    } catch (error) {
      return {
        success: false,
        output: {},
        decision: { type: "halt", reason: error instanceof Error ? error.message : String(error) },
        reasoning: `Agent failed: ${error instanceof Error ? error.message : String(error)}`,
        toolCalls,
        latencyMs: Date.now() - startTime,
        tokenUsage: { prompt: 0, completion: 0, total: 0 }
      };
    }
  }
  
  protected abstract buildPrompt(context: AgentContext): string | Message[];
  protected abstract getOutputSchema(): z.ZodSchema;
  protected abstract parseDecision(output: Record<string, unknown>): AgentDecision;
}

export class SimpleMemory implements AgentMemory {
  shortTerm = new Map<string, unknown>();
  conversation: AgentMemory["conversation"] = [];
  
  constructor(private db?: unknown) {}
  
  longTerm = {
    get: async (key: string): Promise<unknown> => {
      // Implement with Redis or DB
      return null;
    },
    set: async (_key: string, _value: unknown): Promise<void> => {
      // Implement with Redis or DB
    },
    search: async (_query: string): Promise<Array<{ key: string; value: unknown; score: number }>> => {
      // Implement with vector DB
      return [];
    }
  };
  
  addToConversation(message: { role: "user" | "assistant" | "tool"; content: string; metadata?: Record<string, unknown> }): void {
    this.conversation.push(message);
  }
}

export class ToolRegistryImpl implements ToolRegistry {
  private tools = new Map<string, Tool>();
  
  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }
  
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }
  
  list(): Tool[] {
    return Array.from(this.tools.values());
  }
  
  async execute(name: string, params: unknown, context: ToolContext): Promise<unknown> {
    const tool = this.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    return tool.execute(params, context);
  }
}
