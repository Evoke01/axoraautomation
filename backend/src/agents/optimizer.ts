import { z } from "zod";
import type { AIProvider, Message } from "../ai/providers/base.js";
import { BaseAgent, type AgentContext, type AgentDecision } from "./base.js";

export interface VariantScore {
  variantKey: string;
  ctrScore: number;
  retentionScore: number;
  seoScore: number;
  overallScore: number;
  rationale: string;
  strengths: string[];
  weaknesses: string[];
}

export interface OptimizerResult {
  scores: VariantScore[];
  winner: string;
  runnerUp: string;
  improvementSuggestions: string[];
  abTestRecommendation: boolean;
}

export class OptimizerAgent extends BaseAgent {
  readonly id = "optimizer";
  readonly purpose = "Score and rank metadata variants using Mistral Small - pick the best performer";
  readonly capabilities = ["text-generation", "structured-output", "classification"];

  constructor(provider: AIProvider) {
    super(provider, []);
  }

  canHandle(context: AgentContext): boolean {
    return !!context.input.variants && Array.isArray(context.input.variants);
  }

  protected buildPrompt(context: AgentContext): string | Message[] {
    const {
      variants,
      visionResult,
      creatorNiche,
      platform = "youtube",
      historicalPerformance
    } = context.input;

    return [
      {
        role: "system",
        content: `You are Axora Optimizer Agent using Mistral Small. Score each metadata variant for predicted performance.

Scoring Criteria (0-100 each):
- **ctrScore**: Click-through rate potential (title + thumbnail combination appeal)
- **retentionScore**: Will viewers stay? (hook quality, promise delivery)
- **seoScore**: Searchability (keyword placement, discoverability)
- **overallScore**: Weighted average considering platform algorithm

For each variant, provide:
- Specific rationale for scores
- 2-3 strengths
- 2-3 weaknesses
- How it could be improved

After scoring:
1. Pick a WINNER (best overall)
2. Pick a RUNNER-UP (good alternative for A/B testing)
3. Suggest if A/B testing is recommended
4. Provide 3-5 improvement suggestions that could boost the winner even more

Historical Context: ${historicalPerformance ? "Prior performance data available" : "No historical data"}
Platform: ${platform}
Niche: ${creatorNiche || "General"}`
      },
      {
        role: "user",
        content: JSON.stringify({
          variants,
          videoAnalysis: visionResult,
          creatorNiche
        }, null, 2)
      }
    ];
  }

  protected getOutputSchema(): z.ZodSchema {
    return z.object({
      scores: z.array(z.object({
        variantKey: z.string(),
        ctrScore: z.number().min(0).max(100),
        retentionScore: z.number().min(0).max(100),
        seoScore: z.number().min(0).max(100),
        overallScore: z.number().min(0).max(100),
        rationale: z.string().min(20),
        strengths: z.array(z.string()).min(1).max(3),
        weaknesses: z.array(z.string()).min(1).max(3)
      })).min(2),
      winner: z.string(),
      runnerUp: z.string(),
      improvementSuggestions: z.array(z.string()).min(3).max(5),
      abTestRecommendation: z.boolean(),
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
        return { type: "retry", reason: decision.reason || "Optimization needs retry" };
      case "escalate":
        return { type: "escalate", to: decision.nextAgent || "human", reason: decision.reason || "Unclear winner" };
      case "halt":
        return { type: "halt", reason: decision.reason || "Cannot score variants" };
      default:
        return {
          type: "complete",
          nextAgent: "scheduler"
        };
    }
  }
}
