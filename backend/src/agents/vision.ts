import { z } from "zod";
import type { AIProvider, Message } from "../ai/providers/base.js";
import { BaseAgent, type AgentContext, type AgentDecision } from "./base.js";

export interface VisionResult {
  hook: string;
  mainPoint: string;
  vibe: string;
  keywords: string[];
  summary: string;
  topics: string[];
  energy: "low" | "medium" | "high";
  visualStyle: string;
  audioMood: string;
}

export class VisionAgent extends BaseAgent {
  readonly id = "vision";
  readonly purpose = "Analyze video content - extract hook, vibe, topics, visual style (uses any available video-capable provider)";
  readonly capabilities = ["video-analysis", "image-analysis", "structured-output"];

  constructor(provider: AIProvider) {
    super(provider, []);
  }

  canHandle(context: AgentContext): boolean {
    return !!context.input.videoUrl || !!context.input.videoPath || !!context.input.assetId;
  }

  protected buildPrompt(context: AgentContext): string | Message[] {
    const { videoUrl, title, creatorName, creatorNiche, durationSeconds } = context.input;

    return [
      {
        role: "system",
        content: `You are Axora Vision Agent. Analyze this video and extract:

1. **hook** - The first 3-5 seconds attention grabber (what makes viewers stop scrolling)
2. **mainPoint** - The central promise/value proposition of the content
3. **vibe** - Dominant emotional energy (e.g., "high-energy tutorial", "chill storytelling", "provocative hot take")
4. **keywords** - 5-8 specific topics/terms that appear visually or in audio
5. **summary** - 2-3 sentence overview of the entire video
6. **topics** - 3-5 specific subject areas covered
7. **energy** - overall pace/energy level: "low", "medium", or "high"
8. **visualStyle** - How it's shot (e.g., "talking head", "screen recording", "B-roll montage", "cinematic")
9. **audioMood** - Sound characteristics (e.g., "upbeat music", "calm voiceover", "noisy environment")

Be specific and actionable. Creators will use this to write better metadata.`
      },
      {
        role: "user",
        content: JSON.stringify({
          title,
          creatorName,
          creatorNiche,
          durationSeconds,
          videoUrl: videoUrl ?? "Video file attached"
        })
      }
    ];
  }

  protected getOutputSchema(): z.ZodSchema {
    return z.object({
      hook: z.string().min(10).max(200),
      mainPoint: z.string().min(20).max(300),
      vibe: z.string().min(5).max(100),
      keywords: z.array(z.string()).min(5).max(8),
      summary: z.string().min(50).max(500),
      topics: z.array(z.string()).min(3).max(5),
      energy: z.enum(["low", "medium", "high"]),
      visualStyle: z.string().min(5).max(100),
      audioMood: z.string().min(5).max(100),
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
        return { type: "retry", reason: decision.reason || "Vision analysis needs retry" };
      case "escalate":
        return { type: "escalate", to: decision.nextAgent || "human", reason: decision.reason || "Video unclear" };
      case "halt":
        return { type: "halt", reason: decision.reason || "Cannot analyze video" };
      default:
        return {
          type: "complete",
          nextAgent: "writer"
        };
    }
  }
}
