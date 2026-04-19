import { z } from "zod";
import type { AIProvider, Message } from "../ai/providers/base.js";
import { BaseAgent, type AgentContext, type AgentDecision } from "./base.js";

export interface TrendPrediction {
  nicheLabel: string;
  nicheConfidence: number;
  nicheAlternatives: string[];
  engagementLabel: string;
  engagementConfidence: number;
  engagementPotential: "low" | "medium" | "high";
  trendingAngles: string[];
  viralProbability: number;
  seasonalRelevance: string;
  trendingKeywords: string[];
  competitorGap: string;
}

export interface TrendResult {
  classification: TrendPrediction;
  contentRecommendations: string[];
  timingInsights: string;
  riskFactors: string[];
}

export class TrendAgent extends BaseAgent {
  readonly id = "trend";
  readonly purpose = "Classify content niche and predict engagement using Hugging Face Inference";
  readonly capabilities = ["classification", "embedding"];

  constructor(provider: AIProvider) {
    super(provider, []);
  }

  canHandle(context: AgentContext): boolean {
    return !!context.input.visionResult || !!context.input.contentText;
  }

  protected buildPrompt(context: AgentContext): string | Message[] {
    const {
      visionResult,
      contentText,
      creatorNiche,
      recentTrends,
      competitorContent
    } = context.input;
    const vision = asInputRecord(visionResult);
    const normalizedContentText = typeof contentText === "string" ? contentText : undefined;

    const textToAnalyze = normalizedContentText || [
      readString(vision, "title"),
      readString(vision, "hook"),
      readString(vision, "summary"),
      readStringArray(vision, "keywords").join(" ")
    ].filter(Boolean).join(" ");

    return [
      {
        role: "system",
        content: `You are Axora Trend Agent using Hugging Face zero-shot classification. Analyze content and predict performance.

Classification Categories:
Niche: education, productivity, technology, business, marketing, lifestyle, finance, self-improvement, storytelling, entertainment, gaming, health, travel
Engagement: high viral potential, steady evergreen interest, niche expert interest, low immediate pull

Analysis Output:
1. **nicheLabel**: Primary content category with confidence
2. **engagementLabel**: Predicted performance category
3. **trendingAngles**: 3-5 angles that could make this trend right now
4. **viralProbability**: 0-100 score based on current trends
5. **seasonalRelevance**: How this fits current season/events
6. **trendingKeywords**: 5-7 keywords trending in this niche
7. **competitorGap**: What similar creators are missing that this could fill

Also provide:
- Content improvement recommendations
- Timing insights (when this type typically performs best)
- Risk factors that might limit reach`
      },
      {
        role: "user",
        content: JSON.stringify({
          contentText: textToAnalyze,
          creatorNiche,
          recentTrends: recentTrends || "No recent trend data",
          competitorContent: competitorContent || "No competitor analysis"
        }, null, 2)
      }
    ];
  }

  protected getOutputSchema(): z.ZodSchema {
    return z.object({
      classification: z.object({
        nicheLabel: z.enum([
          "education", "productivity", "technology", "business", "marketing",
          "lifestyle", "finance", "self-improvement", "storytelling", "entertainment",
          "gaming", "health", "travel"
        ]),
        nicheConfidence: z.number().min(0).max(1),
        nicheAlternatives: z.array(z.string()).max(2),
        engagementLabel: z.enum([
          "high viral potential",
          "steady evergreen interest",
          "niche expert interest",
          "low immediate pull"
        ]),
        engagementConfidence: z.number().min(0).max(1),
        engagementPotential: z.enum(["low", "medium", "high"]),
        trendingAngles: z.array(z.string()).min(2).max(5),
        viralProbability: z.number().min(0).max(100),
        seasonalRelevance: z.string(),
        trendingKeywords: z.array(z.string()).min(3).max(7),
        competitorGap: z.string()
      }),
      contentRecommendations: z.array(z.string()).min(2).max(5),
      timingInsights: z.string(),
      riskFactors: z.array(z.string()).max(3),
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
        return { type: "retry", reason: decision.reason || "Trend analysis needs retry" };
      case "escalate":
        return { type: "escalate", to: decision.nextAgent || "human", reason: decision.reason || "Unclear classification" };
      case "halt":
        return { type: "halt", reason: decision.reason || "Cannot classify content" };
      default:
        return {
          type: "complete"
        };
    }
  }

  async classifyWithHF(
    context: AgentContext,
    hfClassifier: (text: string, labels: string[]) => Promise<Array<{ label: string; score: number }>>
  ): Promise<Partial<TrendPrediction>> {
    const { visionResult, contentText } = context.input;
    const vision = asInputRecord(visionResult);
    const normalizedContentText = typeof contentText === "string" ? contentText : undefined;

    const text = normalizedContentText || [
      readString(vision, "title"),
      readString(vision, "hook"),
      readString(vision, "summary"),
      readStringArray(vision, "keywords").join(" ")
    ].filter(Boolean).join(" ");

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
        hfClassifier(text, nicheLabels),
        hfClassifier(text, engagementLabels)
      ]);

      const nicheTop = nicheScores[0];
      const engagementTop = engagementScores[0];

      return {
        nicheLabel: nicheTop?.label || "general",
        nicheConfidence: nicheTop?.score || 0.5,
        nicheAlternatives: nicheScores.slice(1, 3).map(s => s.label),
        engagementLabel: engagementTop?.label || "niche expert interest",
        engagementConfidence: engagementTop?.score || 0.5,
        engagementPotential: this.mapToPotential(engagementTop?.label),
        trendingAngles: nicheScores.slice(0, 3).map(s => s.label),
        trendingKeywords: nicheScores.slice(0, 5).map(s => s.label)
      };
    } catch {
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

function asInputRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readString(record: Record<string, unknown> | null, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" ? value : undefined;
}

function readStringArray(record: Record<string, unknown> | null, key: string): string[] {
  const value = record?.[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}
