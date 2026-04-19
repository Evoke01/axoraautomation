import { z } from "zod";
import type { AIProvider, Message } from "../ai/providers/base.js";
import { BaseAgent, type AgentContext, type AgentDecision } from "./base.js";

export interface ScheduleSlot {
  dayOfWeek: number;
  hour: number;
  minute: number;
  confidence: number;
  expectedViews: "low" | "medium" | "high";
  competitionLevel: "low" | "medium" | "high";
}

export interface SchedulerResult {
  recommendedSlot: ScheduleSlot;
  alternativeSlots: ScheduleSlot[];
  rationale: string;
  timezone: string;
  dayOffset: number;
  analysis: {
    bestDays: string[];
    bestHours: string[];
    avoidSlots: string[];
  };
}

export class SchedulerAgent extends BaseAgent {
  readonly id = "scheduler";
  readonly purpose = "Decide optimal posting time using Cohere Command-R - analyzes audience analytics";
  readonly capabilities = ["text-generation", "structured-output"];

  constructor(provider: AIProvider) {
    super(provider, []);
  }

  canHandle(context: AgentContext): boolean {
    return !!context.input.analytics && !!context.input.timezone;
  }

  protected buildPrompt(context: AgentContext): string | Message[] {
    const {
      analytics,
      timezone,
      creatorName,
      creatorNiche,
      contentType,
      targetAudience,
      visionResult
    } = context.input;
    const vision = asInputRecord(visionResult);

    return [
      {
        role: "system",
        content: `You are Axora Scheduler Agent using Cohere Command-R. Analyze audience analytics and recommend the best publishing time.

Input Data:
- Recent post performance with timestamps
- Creator timezone
- Content niche and type
- Target audience demographics

Considerations:
1. When is the audience MOST ACTIVE? (historical view patterns)
2. What day/hour has BEST ENGAGEMENT RATE?
3. When is COMPETITION lowest? (less noise = more visibility)
4. Content timing alignment (e.g., tutorials perform better on weekdays, entertainment on weekends)
5. Audience timezone distribution

Output:
- **Primary recommendation** with confidence score
- **2-3 alternative slots** if primary isn't feasible
- **Expected performance** (low/medium/high views)
- **Competition level** at that time
- **Rationale** explaining the recommendation
- **Days/hours to avoid**

Format in creator's local timezone: ${timezone}`
      },
      {
        role: "user",
        content: JSON.stringify({
          analytics,
          timezone,
          creatorName,
          creatorNiche,
          contentType,
          targetAudience,
          contentVibe: readString(vision, "vibe"),
          contentEnergy: readString(vision, "energy")
        }, null, 2)
      }
    ];
  }

  protected getOutputSchema(): z.ZodSchema {
    return z.object({
      recommendedSlot: z.object({
        dayOfWeek: z.number().min(0).max(6),
        hour: z.number().min(0).max(23),
        minute: z.number().min(0).max(59),
        confidence: z.number().min(0).max(1),
        expectedViews: z.enum(["low", "medium", "high"]),
        competitionLevel: z.enum(["low", "medium", "high"])
      }),
      alternativeSlots: z.array(z.object({
        dayOfWeek: z.number().min(0).max(6),
        hour: z.number().min(0).max(23),
        minute: z.number().min(0).max(59),
        confidence: z.number().min(0).max(1),
        expectedViews: z.enum(["low", "medium", "high"]),
        competitionLevel: z.enum(["low", "medium", "high"])
      })).max(3),
      rationale: z.string().min(50),
      dayOffset: z.number().min(0).max(14),
      analysis: z.object({
        bestDays: z.array(z.string()).min(1),
        bestHours: z.array(z.string()).min(1),
        avoidSlots: z.array(z.string()).min(1)
      }),
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
        return { type: "retry", reason: decision.reason || "Scheduling needs retry" };
      case "escalate":
        return { type: "escalate", to: decision.nextAgent || "human", reason: decision.reason || "Insufficient data" };
      case "halt":
        return { type: "halt", reason: decision.reason || "Cannot determine schedule" };
      default:
        return {
          type: "complete",
          nextAgent: "trend"
        };
    }
  }
}

function asInputRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readString(record: Record<string, unknown> | null, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" ? value : undefined;
}
