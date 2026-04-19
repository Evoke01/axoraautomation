import { z } from "zod";
import type { AIProvider, Message } from "../ai/providers/base.js";
import { BaseAgent, type AgentContext, type AgentDecision } from "./base.js";

export interface ClassificationResult {
  niche: {
    label: string;
    confidence: number;
    alternatives: string[];
  };
  engagement: {
    label: string;
    confidence: number;
    potential: "low" | "medium" | "high";
  };
  trendAngles: string[];
  reasoning: string;
}

export class ClassifierAgent extends BaseAgent {
  readonly id = "classifier";
  readonly purpose = "Classify content niche, engagement potential, and trend angles";
  readonly capabilities = ["classification", "zero-shot", "analysis"];
  
  constructor(provider: AIProvider) {
    super(provider, []); // No tools needed for classification
  }
  
  canHandle(context: AgentContext): boolean {
    return !!context.input.title && !!context.input.creatorName;
  }
  
  protected buildPrompt(context: AgentContext): string | Message[] {
    const { title, rawNotes, creatorName, creatorNiche, intelligence } = context.input;
    
    return [
      {
        role: "system",
        content: `You are a content classification expert. Analyze the provided video metadata and classify:
1. Content niche (education, productivity, technology, business, marketing, lifestyle, finance, self-improvement, storytelling, entertainment)
2. Engagement potential (high viral, steady evergreen, niche expert, low immediate)
3. Top 3 trending angles for this content

Respond with structured JSON only.`
      },
      {
        role: "user",
        content: JSON.stringify({
          title,
          rawNotes,
          creatorName,
          creatorNiche,
          existingIntelligence: intelligence
        }, null, 2)
      }
    ];
  }
  
  protected getOutputSchema(): z.ZodSchema {
    return z.object({
      niche: z.object({
        label: z.enum([
          "education", "productivity", "technology", "business", "marketing",
          "lifestyle", "finance", "self-improvement", "storytelling", "entertainment"
        ]),
        confidence: z.number().min(0).max(1),
        alternatives: z.array(z.string()).max(2)
      }),
      engagement: z.object({
        label: z.enum([
          "high viral potential",
          "steady evergreen interest",
          "niche expert interest",
          "low immediate pull"
        ]),
        confidence: z.number().min(0).max(1),
        potential: z.enum(["low", "medium", "high"])
      }),
      trendAngles: z.array(z.string()).min(1).max(3),
      reasoning: z.string().min(10),
      decision: z.object({
        type: z.enum(["complete", "retry", "escalate", "halt"]),
        reason: z.string().optional(),
        nextAgent: z.string().optional()
      })
    });
  }
  
  protected parseDecision(output: Record<string, unknown>): AgentDecision {
    const decision = output.decision as Record<string, string> | undefined;
    
    switch (decision?.type) {
      case "retry":
        return { type: "retry", reason: decision.reason || "Retry requested" };
      case "escalate":
        return { type: "escalate", to: decision.nextAgent || "human", reason: decision.reason || "Escalation requested" };
      case "halt":
        return { type: "halt", reason: decision.reason || "Halt requested" };
      default:
        return { 
          type: "complete", 
          nextAgent: "writer" // Default next agent
        };
    }
  }
  
  async classifyWithHF(context: AgentContext, hfProvider: { classify: (text: string, labels: string[]) => Promise<Array<{ label: string; score: number }>> }): Promise<Partial<ClassificationResult>> {
    const { title, rawNotes, creatorNiche } = context.input;
    const text = [title, rawNotes, creatorNiche].filter(Boolean).join(" ");
    
    const nicheLabels = [
      "education", "productivity", "technology", "business", "marketing",
      "lifestyle", "finance", "self-improvement", "storytelling", "entertainment"
    ];
    
    const engagementLabels = [
      "high viral potential",
      "steady evergreen interest", 
      "niche expert interest",
      "low immediate pull"
    ];
    
    try {
      const [nicheScores, engagementScores] = await Promise.all([
        hfProvider.classify(text, nicheLabels),
        hfProvider.classify(text, engagementLabels)
      ]);
      
      const nicheTop = nicheScores[0];
      const engagementTop = engagementScores[0];
      
      return {
        niche: {
          label: nicheTop?.label || "general",
          confidence: nicheTop?.score || 0.5,
          alternatives: nicheScores.slice(1, 3).map(s => s.label)
        },
        engagement: {
          label: engagementTop?.label || "niche expert interest",
          confidence: engagementTop?.score || 0.5,
          potential: this.mapToPotential(engagementTop?.label)
        },
        trendAngles: nicheScores.slice(0, 3).map(s => s.label),
        reasoning: `Classified using HuggingFace zero-shot classification. Niche confidence: ${nicheTop?.score}, Engagement confidence: ${engagementTop?.score}`
      };
    } catch (error) {
      // Fall back to primary provider
      return {};
    }
  }
  
  private mapToPotential(label?: string): "low" | "medium" | "high" {
    if (!label) return "medium";
    if (label.includes("high viral")) return "high";
    if (label.includes("low")) return "low";
    return "medium";
  }
}
