import { z } from "zod";
import type { AIProvider, Message } from "../ai/providers/base.js";
import { BaseAgent, type AgentContext, type AgentDecision } from "./base.js";

export interface MetadataVariant {
  variantKey: string;
  title: string;
  hook: string;
  caption: string;
  cta: string;
  thumbnailBrief: string;
  hashtags: string[];
  keywords: string[];
  tone: string;
  targetAudience: string;
}

export interface WriterResult {
  variants: MetadataVariant[];
  recommendedVariant: string;
  reasoning: string;
}

export class WriterAgent extends BaseAgent {
  readonly id = "writer";
  readonly purpose = "Generate titles, captions, hashtags using Groq Llama 3.3 70B - optimized for speed";
  readonly capabilities = ["text-generation", "structured-output"];

  constructor(provider: AIProvider) {
    super(provider, []);
  }

  canHandle(context: AgentContext): boolean {
    return !!context.input.visionResult || !!context.input.intelligence;
  }

  protected buildPrompt(context: AgentContext): string | Message[] {
    const {
      visionResult,
      creatorName,
      creatorNiche,
      creatorBrandVoice,
      platform = "youtube",
      variantCount = 3
    } = context.input;

    return [
      {
        role: "system",
        content: `You are Axora Writer Agent using Groq Llama 3.3 70B. Generate ${variantCount} distinct metadata variants for this video.

Each variant needs:
- **variantKey**: unique identifier (e.g., "curiosity_gap", "direct_value", "story_hook")
- **title**: Under 70 chars, YouTube-optimized, include keywords naturally
- **hook**: Opening line for description (max 140 chars)
- **caption**: Full description body (200-400 chars), include timestamps if relevant
- **cta**: Call-to-action (max 80 chars)
- **thumbnailBrief**: Visual direction for thumbnail (max 180 chars)
- **hashtags**: 3-5 platform-appropriate tags (no # in output)
- **keywords**: 4-8 searchable terms for SEO
- **tone**: Emotional approach (e.g., "excited", "mysterious", "authoritative")
- **targetAudience**: Who this variant speaks to

Make each variant DIFFERENT:
- Variant 1: Curiosity gap / intrigue
- Variant 2: Direct value proposition
- Variant 3: Story/personal angle

Creator Context:
- Name: ${creatorName || "Unknown"}
- Niche: ${creatorNiche || "General"}
- Brand Voice: ${creatorBrandVoice || "Direct and energetic"}
- Platform: ${platform}`
      },
      {
        role: "user",
        content: JSON.stringify({
          videoAnalysis: visionResult,
          creatorName,
          creatorNiche,
          creatorBrandVoice
        }, null, 2)
      }
    ];
  }

  protected getOutputSchema(): z.ZodSchema {
    return z.object({
      variants: z.array(z.object({
        variantKey: z.string(),
        title: z.string().max(70),
        hook: z.string().max(140),
        caption: z.string().max(400),
        cta: z.string().max(80),
        thumbnailBrief: z.string().max(180),
        hashtags: z.array(z.string()).min(3).max(5),
        keywords: z.array(z.string()).min(4).max(8),
        tone: z.string(),
        targetAudience: z.string()
      })).min(3).max(5),
      recommendedVariant: z.string(),
      reasoning: z.string().min(20),
      decision: z.object({
        type: z.enum(["complete", "retry", "escalate", "halt", "delegate"]),
        reason: z.string().optional(),
        nextAgent: z.string().optional()
      })
    });
  }

  protected parseDecision(output: Record<string, unknown>): AgentDecision {
    const decision = output.decision as Record<string, string> | undefined;

    switch (decision?.type) {
      case "retry":
        return { type: "retry", reason: decision.reason || "Writer needs retry" };
      case "escalate":
        return { type: "escalate", to: decision.nextAgent || "human", reason: decision.reason || "Complex content" };
      case "delegate":
        return { type: "delegate", to: decision.nextAgent || "optimizer", input: { variants: output.variants } };
      case "halt":
        return { type: "halt", reason: decision.reason || "Cannot generate variants" };
      default:
        return {
          type: "complete",
          nextAgent: "optimizer"
        };
    }
  }
}
