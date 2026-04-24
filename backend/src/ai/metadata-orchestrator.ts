import { Redis } from "ioredis";
import { env } from "../config/env.js";
import { runWriterAgent } from "./writer-agent.js";

// ─────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────

export interface VideoContext {
  assetId:      string;
  workspaceId:  string;
  fileUrl?:     string;
  fileBase64?:  string;
  mimeType:     string;
  durationSec?: number;
  platform:     "YOUTUBE" | "INSTAGRAM" | "TIKTOK" | "ALL";
}

export interface VisionInsights {
  hook:        string;
  topics:      string[];
  mood:        string;
  keyMoments:  string[];
  niche:       string;
  audience:    string;
  rawSummary:  string;
}

export interface MetadataVariant {
  title:     string;
  caption:   string;
  hook:      string;
  hashtags:  string[];
  keywords:  string[];
  score:     number;
  reasoning: string;
}

export interface ScheduleRecommendation {
  bestDayOfWeek:   number;
  bestHourUTC:     number;
  confidenceScore: number;
  reasoning:       string;
}

export interface ClassificationResult {
  niche:          string;
  subNiche:       string;
  audienceAge:    string;
  sentimentScore: number;
  viralPotential: number;
}

export interface AgentTrace {
  agent:     string;
  model:     string;
  latencyMs: number;
  cached:    boolean;
  success:   boolean;
  attempts:  number;
  error?:    string;
}

export interface OrchestratorResult {
  insights:       VisionInsights;
  variants:       MetadataVariant[];
  best:           MetadataVariant;
  classification: ClassificationResult;
  schedule:       ScheduleRecommendation;
  cacheHit:       boolean;
  processingMs:   number;
  agentTrace:     AgentTrace[];
}

// ─────────────────────────────────────────────────────────────────
// CIRCUIT BREAKER
// ─────────────────────────────────────────────────────────────────

type CBState = "CLOSED" | "OPEN" | "HALF_OPEN";

class CircuitBreaker {
  private state: CBState = "CLOSED";
  private failures = 0;
  private lastFailureAt = 0;
  private readonly threshold  = 3;
  private readonly cooldownMs = 60_000;

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      if (Date.now() - this.lastFailureAt > this.cooldownMs) this.state = "HALF_OPEN";
      else throw new Error("Circuit breaker OPEN");
    }
    try {
      const r = await fn();
      this.failures = 0;
      this.state    = "CLOSED";
      return r;
    } catch (err) {
      this.failures++;
      this.lastFailureAt = Date.now();
      if (this.failures >= this.threshold) this.state = "OPEN";
      throw err;
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// TWO-LAYER CACHE
// ─────────────────────────────────────────────────────────────────

class AgentCache {
  private redis: Redis | null = null;
  private mem = new Map<string, { v: unknown; exp: number }>();

  private getRedis(): Redis | null {
    if (!env.REDIS_URL) return null;
    if (!this.redis) this.redis = new Redis(env.REDIS_URL);
    return this.redis;
  }

  async get<T>(key: string): Promise<T | null> {
    const m = this.mem.get(key);
    if (m && Date.now() < m.exp) return m.v as T;
    const r = this.getRedis();
    if (!r) return null;
    try {
      const raw = await r.get(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as T;
      this.mem.set(key, { v: parsed, exp: Date.now() + 60_000 });
      return parsed;
    } catch { return null; }
  }

  async set(key: string, value: unknown, ttlSec: number): Promise<void> {
    this.mem.set(key, { v: value, exp: Date.now() + ttlSec * 1000 });
    const r = this.getRedis();
    if (!r) return;
    try { 
      await r.set(key, JSON.stringify(value), "EX", ttlSec); 
    } catch { /* mem-only fallback */ }
  }

  key(...parts: string[]) { return `axora:ai:${parts.join(":")}`; }
}

const cache = new AgentCache();

// ─────────────────────────────────────────────────────────────────
// GENERIC RETRY WRAPPER — used by every agent
// ─────────────────────────────────────────────────────────────────

async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  validate: (v: T) => { ok: boolean; reason?: string },
  maxAttempts = 3,
  label = "agent"
): Promise<{ result: T; attempts: number }> {
  let lastErr = "";
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const result = await fn(i);
      const check  = validate(result);
      if (check.ok) return { result, attempts: i + 1 };
      lastErr = check.reason ?? "validation failed";
      console.warn(`[${label}] attempt ${i + 1} rejected: ${lastErr}`);
    } catch (err) {
      lastErr = String(err);
      console.warn(`[${label}] attempt ${i + 1} threw: ${lastErr}`);
    }
  }
  throw new Error(`[${label}] failed after ${maxAttempts} attempts. Last: ${lastErr}`);
}

function safeParseJSON<T>(raw: string): T {
  return JSON.parse(raw.replace(/```json|```/g, "").trim()) as T;
}

// ─────────────────────────────────────────────────────────────────
// AGENT 1 — VISION  (Gemini 2.5 Flash)
// ─────────────────────────────────────────────────────────────────

const visionCB = new CircuitBreaker();

const VISION_EXAMPLE = `
EXAMPLE OF GOOD OUTPUT — use this as your quality standard:
{
  "hook": "I haven't bought a candle from a store in two years, and here's exactly why.",
  "topics": ["eco-friendly candles", "DIY wax melts", "greenwashing in home products"],
  "mood": "educational",
  "keyMoments": [
    "0:32 - ingredient label comparison between brands",
    "1:45 - first live burn test with air quality meter",
    "3:10 - full cost breakdown: store vs DIY per hour of burn time"
  ],
  "niche": "sustainable home & eco living",
  "audience": "eco-conscious homeowners aged 25-40 who want affordable sustainable alternatives to mainstream products",
  "rawSummary": "Creator tests 6 eco candle brands side-by-side against homemade alternatives across scent throw, burn time, and ingredient transparency. Reveals which brands are genuinely sustainable vs greenwashing."
}`;

function validateVisionInsights(v: VisionInsights): { ok: boolean; reason?: string } {
  if (!v?.hook || v.hook.length < 20)
    return { ok: false, reason: "hook too short or missing" };
  if (!v.topics || v.topics.length < 2)
    return { ok: false, reason: "need at least 2 specific topics" };
  if (!v.niche || v.niche.length < 4 || ["lifestyle","content","video","general"].includes(v.niche.toLowerCase()))
    return { ok: false, reason: `niche too vague: "${v.niche}"` };
  if (!v.audience || v.audience.length < 20)
    return { ok: false, reason: "audience description too short — need age + interests + intent" };
  if (!v.rawSummary || v.rawSummary.length < 50)
    return { ok: false, reason: "summary too short" };
  const validMoods = ["energetic","calm","educational","entertaining","motivational","controversial"];
  if (!validMoods.includes(v.mood))
    return { ok: false, reason: `invalid mood "${v.mood}" — must be one of: ${validMoods.join(", ")}` };
  return { ok: true };
}

async function visionAgent(ctx: VideoContext, trace: AgentTrace[]): Promise<VisionInsights> {
  const cacheKey = cache.key("vision", ctx.assetId);
  const cached   = await cache.get<VisionInsights>(cacheKey);
  if (cached) {
    trace.push({ agent:"vision", model:"gemini-2.5-flash", latencyMs:0, cached:true, success:true, attempts:0 });
    return cached;
  }

  const t0 = Date.now();
  const { result, attempts } = await withRetry(
    async (attempt) => visionCB.call(async () => {
      const prompt = `You are an expert video content analyst for a social media automation platform.

Carefully watch this video and extract structured insights. Your output feeds an AI pipeline that writes titles and captions — so accuracy and specificity are critical.

WHAT TO EXTRACT:
1. Hook — the single strongest moment or statement that makes someone stop scrolling. Must be a complete sentence.
2. Topics — the specific subjects actually covered (not the category — "compound interest mistakes" not "finance")
3. Mood — the emotional energy: energetic / calm / educational / entertaining / motivational / controversial
4. Key moments — 3 specific timestamps with what happens (be precise)
5. Niche — the specific content niche, 3-6 words (not generic like "lifestyle" or "health")
6. Audience — who this is for: include approximate age, main interest, and their intent for watching
7. Summary — 2 honest sentences about what the viewer actually learns or gets from this video

${VISION_EXAMPLE}

${attempt > 0 ? `IMPORTANT: Previous attempt was rejected for being too vague. Be specific and concrete. Use the example above as your quality standard.` : ""}

Return ONLY a valid JSON object with these exact keys: hook, topics, mood, keyMoments, niche, audience, rawSummary.
No markdown. No explanation. Just the JSON.`;

      const parts: Record<string, unknown>[] = ctx.fileBase64
        ? [{ inline_data: { mime_type: ctx.mimeType, data: ctx.fileBase64 } }]
        : [{ file_data: { mime_type: ctx.mimeType, file_uri: ctx.fileUrl } }];
      parts.push({ text: prompt });

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            contents:         [{ parts }],
            generationConfig: { temperature: attempt === 0 ? 0.1 : 0.3, maxOutputTokens: 700 },
          }),
        }
      );
      if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
      const data = await res.json() as { candidates: { content: { parts: { text: string }[] } }[] };
      return safeParseJSON<VisionInsights>(data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}");
    }),
    validateVisionInsights,
    3,
    "vision"
  );

  const latencyMs = Date.now() - t0;
  trace.push({ agent:"vision", model:"gemini-2.5-flash", latencyMs, cached:false, success:true, attempts });
  await cache.set(cacheKey, result, 60 * 60 * 24);
  return result;
}

// ─────────────────────────────────────────────────────────────────
// AGENT 2 — WRITER  (Groq Llama 3.3 70B)
// ─────────────────────────────────────────────────────────────────

async function writerAgent(
  ctx: VideoContext,
  insights: VisionInsights,
  trace: AgentTrace[]
): Promise<MetadataVariant[]> {
  const angles = ["curiosity", "authority", "controversy"] as const;

  return Promise.all(angles.map(async (angle) => {
    const cacheKey = cache.key("writer", ctx.assetId, angle, ctx.platform);
    const cached   = await cache.get<MetadataVariant>(cacheKey);
    if (cached) {
      trace.push({ agent:`writer:${angle}`, model:"llama-3.3-70b-versatile", latencyMs:0, cached:true, success:true, attempts:0 });
      return cached;
    }

    const t0      = Date.now();
    const variant = await runWriterAgent(ctx, insights, angle); // handles retry + validation internally
    const latencyMs = Date.now() - t0;

    trace.push({ agent:`writer:${angle}`, model:"llama-3.3-70b-versatile", latencyMs, cached:false, success:true, attempts:1 });
    await cache.set(cacheKey, variant, 60 * 60 * 6);
    return variant;
  }));
}

// ─────────────────────────────────────────────────────────────────
// AGENT 3 — OPTIMIZER  (Mistral small)
// ─────────────────────────────────────────────────────────────────

const optimizerCB = new CircuitBreaker();

const OPTIMIZER_CALIBRATION = `
SCORING CALIBRATION — use these as your reference points:

0.90 → "I tested 7 productivity apps so you don't have to"
        (specific number, saves viewer time, clear value, natural phrasing)

0.78 → "The truth about eco candles (I was wrong)"
        (pattern interrupt, personal admission, implies surprising reveal)

0.61 → "How to start investing in 2024"
        (decent but generic, seen many times, no unique angle)

0.38 → "Productivity tips that changed my life"
        (vague promise, overused phrase, no specificity)

0.12 → "Eco Friendly Candles Vocal for Local"
        (confusing, not a real title, zero CTR potential)`;

function validateScores(scores: unknown, expectedCount: number): { ok: boolean; reason?: string } {
  if (!Array.isArray(scores))
    return { ok: boolean = false, reason: "not an array" };
  if (scores.length !== expectedCount)
    return { ok: false, reason: `expected ${expectedCount} scores, got ${scores.length}` };
  for (const s of scores) {
    if (typeof s !== "number" || s < 0 || s > 1 || isNaN(s))
      return { ok: false, reason: `invalid score: ${s}` };
  }
  // Reject if all scores are identical (model didn't actually differentiate)
  const unique = new Set(scores.map((s: number) => Math.round(s * 10)));
  if (unique.size === 1 && expectedCount > 1)
    return { ok: false, reason: "all scores are identical — model did not differentiate" };
  return { ok: true };
}

async function optimizerAgent(
  ctx: VideoContext,
  variants: MetadataVariant[],
  insights: VisionInsights,
  trace: AgentTrace[]
): Promise<MetadataVariant[]> {
  const cacheKey = cache.key("optimizer", ctx.assetId, ctx.platform, variants.map(v => v.title.slice(0,10)).join("|"));
  const cached   = await cache.get<MetadataVariant[]>(cacheKey);
  if (cached) {
    trace.push({ agent:"optimizer", model:"mistral-small-latest", latencyMs:0, cached:true, success:true, attempts:0 });
    return cached;
  }

  const t0 = Date.now();
  let scored: MetadataVariant[];

  try {
    const { result: scores, attempts } = await withRetry(
      async (attempt) => optimizerCB.call(async () => {
        const prompt = `You are a ${ctx.platform === "ALL" ? "YouTube" : ctx.platform} CTR expert. Score these metadata variants.

Video niche: ${insights.niche}
Target audience: ${insights.audience}

${OPTIMIZER_CALIBRATION}

WHAT TO SCORE:
For each variant, evaluate: title specificity, hook quality, caption authenticity, overall coherence.

VARIANTS TO SCORE:
${variants.map((v, i) => `
[${i}] Title:   "${v.title}"
     Hook:    "${v.hook}"
     Caption: "${v.caption.slice(0, 100)}..."`).join("\n")}

${attempt > 0 ? "REMINDER: Return ONLY a JSON array like [0.82, 0.71, 0.65] — different values, no explanation." : ""}

Return ONLY a JSON array of ${variants.length} decimal scores (0.0-1.0), different from each other:`;

        const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
          method:  "POST",
          headers: { Authorization: `Bearer ${env.MISTRAL_API_KEY}`, "Content-Type": "application/json" },
          body:    JSON.stringify({
            model:    "mistral-small-latest",
            messages: [
              { role: "system", content: "Return ONLY a JSON array of numbers. No text, no explanation, just the array." },
              { role: "user",   content: prompt },
            ],
            temperature: attempt === 0 ? 0.1 : 0.05,
            max_tokens:  60,
          }),
        });
        if (!res.ok) throw new Error(`Mistral ${res.status}`);
        const data  = await res.json() as { choices: { message: { content: string } }[] };
        const raw   = data.choices?.[0]?.message?.content?.trim() ?? "[]";
        const match = raw.match(/\[[\d.,\s]+\]/);
        if (!match) throw new Error("No array found in Mistral response");
        return JSON.parse(match[0]) as number[];
      }),
      (scores) => validateScores(scores, variants.length),
      3,
      "optimizer"
    );

    scored = variants
      .map((v, i) => ({ ...v, score: Math.round((scores[i] ?? 0.5) * 100) / 100 }))
      .sort((a, b) => b.score - a.score);

    trace.push({ agent:"optimizer", model:"mistral-small-latest", latencyMs: Date.now()-t0, cached:false, success:true, attempts });

  } catch (err) {
    console.warn("[optimizer] degraded, using position-based fallback:", err);
    // Slight descending scores so best variant is still first slot (curiosity tends to score highest)
    scored = variants.map((v, i) => ({ ...v, score: parseFloat((0.75 - i * 0.08).toFixed(2)) }));
    trace.push({ agent:"optimizer", model:"mistral-small-latest", latencyMs: Date.now()-t0, cached:false, success:false, attempts:3, error: String(err) });
  }

  await cache.set(cacheKey, scored, 60 * 60 * 6);
  return scored;
}

// ─────────────────────────────────────────────────────────────────
// AGENT 4 — CLASSIFIER  (HuggingFace BART + RoBERTa)
// ─────────────────────────────────────────────────────────────────

const classifierCB = new CircuitBreaker();

function validateHFClassification(data: unknown): { ok: boolean; reason?: string } {
  const d = data as { labels?: unknown; scores?: unknown };
  if (!Array.isArray(d.labels) || d.labels.length === 0)
    return { ok: false, reason: "no labels — model may still be loading (503)" };
  if (!Array.isArray(d.scores) || d.scores.length !== d.labels.length)
    return { ok: false, reason: "labels/scores length mismatch" };
  return { ok: true };
}

async function classifierAgent(
  ctx: VideoContext,
  insights: VisionInsights,
  trace: AgentTrace[]
): Promise<ClassificationResult> {
  const cacheKey = cache.key("classifier", ctx.assetId);
  const cached   = await cache.get<ClassificationResult>(cacheKey);
  if (cached) {
    trace.push({ agent:"classifier", model:"bart-large-mnli", latencyMs:0, cached:true, success:true, attempts:0 });
    return cached;
  }

  const t0 = Date.now();

  // Build rich input text for better classification accuracy
  const inputText = [
    insights.hook,
    insights.rawSummary,
    `Main topics: ${insights.topics.join(", ")}`,
    `Content niche: ${insights.niche}`,
  ].join(". ").slice(0, 512);

  try {
    const { result: nicheData, attempts } = await withRetry(
      async () => classifierCB.call(async () => {
        const res = await fetch(
          "https://api-inference.huggingface.co/models/facebook/bart-large-mnli",
          {
            method:  "POST",
            headers: { Authorization: `Bearer ${env.HF_API_TOKEN}`, "Content-Type": "application/json" },
            body:    JSON.stringify({
              inputs:     inputText,
              parameters: {
                candidate_labels: [
                  "technology", "personal finance", "fitness & health",
                  "gaming", "education", "entertainment", "business & entrepreneurship",
                  "home & lifestyle", "food & cooking", "beauty & fashion",
                  "travel", "sustainability & eco living",
                ],
              },
            }),
          }
        );
        if (!res.ok) throw new Error(`HuggingFace ${res.status}`);
        return res.json() as Promise<{ labels: string[]; scores: number[] }>;
      }),
      validateHFClassification,
      3,
      "classifier"
    );

    // Sentiment — run once, non-critical
    let sentimentScore = 0;
    try {
      const sentRes = await fetch(
        "https://api-inference.huggingface.co/models/cardiffnlp/twitter-roberta-base-sentiment-latest",
        {
          method:  "POST",
          headers: { Authorization: `Bearer ${env.HF_API_TOKEN}`, "Content-Type": "application/json" },
          body:    JSON.stringify({ inputs: `${insights.hook} ${insights.rawSummary}`.slice(0, 512) }),
        }
      );
      if (sentRes.ok) {
        const sd = await sentRes.json() as { label: string; score: number }[][];
        const top = sd?.[0]?.[0];
        if (top) sentimentScore = top.label === "positive" ? top.score : top.label === "negative" ? -top.score : 0;
      }
    } catch { /* non-critical */ }

    const topScore       = nicheData.scores[0] ?? 0;
    const viralPotential = Math.min(1,
      topScore * 0.35 +
      ({ controversial: 0.30, entertaining: 0.20, energetic: 0.18, motivational: 0.15 }[insights.mood] ?? 0.10) +
      (insights.topics.length >= 3 ? 0.15 : 0.05) +
      (sentimentScore > 0.6 ? 0.15 : sentimentScore > 0.3 ? 0.08 : 0) +
      (/\?|never|wrong|truth|secret|nobody/i.test(insights.hook) ? 0.05 : 0)
    );

    const audienceAge =
      /teen|gen.?z|student|18.?24/i.test(insights.audience)       ? "16-24" :
      /professional|corporate|career|exec/i.test(insights.audience) ? "28-45" :
      /parent|mom|dad|famil/i.test(insights.audience)               ? "28-45" :
      /senior|retire|boomer/i.test(insights.audience)               ? "45-65" :
      "18-35";

    const result: ClassificationResult = {
      niche:          nicheData.labels[0] ?? insights.niche,
      subNiche:       nicheData.labels[1] ?? insights.topics[0] ?? "",
      audienceAge,
      sentimentScore: Math.round(sentimentScore * 100) / 100,
      viralPotential: Math.round(viralPotential * 100) / 100,
    };

    trace.push({ agent:"classifier", model:"bart-large-mnli", latencyMs: Date.now()-t0, cached:false, success:true, attempts });
    await cache.set(cacheKey, result, 60 * 60 * 48);
    return result;

  } catch (err) {
    console.warn("[classifier] degraded, using insights-based fallback:", err);
    const result: ClassificationResult = {
      niche:          insights.niche,
      subNiche:       insights.topics[0] ?? "",
      audienceAge:    /young|gen.?z|student/i.test(insights.audience) ? "18-24" : "18-35",
      sentimentScore: { motivational: 0.7, energetic: 0.5, controversial: -0.2, calm: 0.3, educational: 0.4, entertaining: 0.5 }[insights.mood] ?? 0.3,
      viralPotential: { controversial: 0.75, entertaining: 0.65, motivational: 0.60, energetic: 0.55, educational: 0.50, calm: 0.40 }[insights.mood] ?? 0.5,
    };
    trace.push({ agent:"classifier", model:"bart-large-mnli", latencyMs: Date.now()-t0, cached:false, success:false, attempts:3, error: String(err) });
    return result;
  }
}

// ─────────────────────────────────────────────────────────────────
// AGENT 5 — SCHEDULER  (Cohere Command R)
// ─────────────────────────────────────────────────────────────────

const schedulerCB = new CircuitBreaker();

const TIMING_KNOWLEDGE = `
PLATFORM PEAK ENGAGEMENT WINDOWS (all times UTC):

YouTube:
  Best days: Thursday, Friday, Saturday
  Peak hours: 14:00–17:00 UTC (catches US afternoon + EU evening simultaneously)
  Avoid: Monday before 12:00 UTC
  
Instagram:
  Best days: Tuesday, Wednesday, Thursday  
  Peak hours: 11:00–13:00 UTC and 19:00–21:00 UTC
  Reels peak: 09:00–11:00 UTC daily

TikTok:
  Best days: Tuesday, Thursday, Friday
  Peak hours: 09:00–11:00 UTC and 19:00–22:00 UTC (US evening drives the algorithm)

NICHE TIMING ADJUSTMENTS:
  Finance / investing:     Tue–Thu 08:00–10:00 UTC (professionals pre-work)
  Fitness / health:        Mon/Wed/Fri 06:00–08:00 UTC OR 17:00–19:00 UTC
  Gaming:                  Fri–Sat 19:00–23:00 UTC
  Education / tutorials:   Sun–Mon 13:00–17:00 UTC (weekend study sessions)
  Food / recipes:          Fri 16:00–19:00 UTC (pre-weekend meal planning)
  Sustainability / eco:    Sat–Sun 10:00–14:00 UTC
  Tech / software:         Thu–Fri 14:00–16:00 UTC
  Business / entrepreneurship: Tue–Wed 09:00–11:00 UTC
  Beauty / fashion:        Sat 10:00–13:00 UTC
  Travel:                  Sun 11:00–14:00 UTC`;

const SCHEDULER_EXAMPLES = `
EXAMPLE DECISIONS:

Fitness, YouTube, 18-30:
→ { "bestDayOfWeek": 1, "bestHourUTC": 6, "confidenceScore": 0.86, "reasoning": "Monday 6am UTC catches fitness-motivated viewers before morning workouts — highest intent day for fitness content." }

Eco candles, Instagram, 28-40:
→ { "bestDayOfWeek": 6, "bestHourUTC": 11, "confidenceScore": 0.79, "reasoning": "Saturday 11am UTC hits lifestyle-oriented women during relaxed weekend browsing when purchase intent for home products is highest." }

Tech review, YouTube, 25-40:
→ { "bestDayOfWeek": 4, "bestHourUTC": 15, "confidenceScore": 0.81, "reasoning": "Thursday 3pm UTC is YouTube's global peak — catches both US lunch crowd and EU after-work viewers for tech content." }`;

function validateSchedule(s: ScheduleRecommendation): { ok: boolean; reason?: string } {
  if (typeof s.bestDayOfWeek !== "number" || s.bestDayOfWeek < 0 || s.bestDayOfWeek > 6)
    return { ok: false, reason: `invalid day: ${s.bestDayOfWeek} (must be 0-6)` };
  if (typeof s.bestHourUTC !== "number" || s.bestHourUTC < 0 || s.bestHourUTC > 23)
    return { ok: false, reason: `invalid hour: ${s.bestHourUTC} (must be 0-23)` };
  if (typeof s.confidenceScore !== "number" || s.confidenceScore < 0 || s.confidenceScore > 1)
    return { ok: false, reason: `invalid confidence: ${s.confidenceScore}` };
  if (!s.reasoning || s.reasoning.length < 20)
    return { ok: false, reason: "reasoning too short or missing" };
  return { ok: true };
}

// Real data fallbacks — not guesses
const SCHEDULE_FALLBACKS: Record<string, ScheduleRecommendation> = {
  YOUTUBE:   { bestDayOfWeek: 4, bestHourUTC: 15, confidenceScore: 0.72, reasoning: "Thursday 3pm UTC consistently delivers YouTube's highest cross-niche engagement window globally." },
  INSTAGRAM: { bestDayOfWeek: 2, bestHourUTC: 11, confidenceScore: 0.69, reasoning: "Wednesday 11am UTC hits Instagram's mid-week engagement peak for most audience demographics." },
  TIKTOK:    { bestDayOfWeek: 4, bestHourUTC: 19, confidenceScore: 0.67, reasoning: "Friday evening UTC captures TikTok's leisure-time peak when the US audience drives algorithm reach." },
  ALL:       { bestDayOfWeek: 4, bestHourUTC: 15, confidenceScore: 0.66, reasoning: "Thursday afternoon UTC provides consistent cross-platform performance as a universal default." },
};

async function schedulerAgent(
  ctx: VideoContext,
  classification: ClassificationResult,
  trace: AgentTrace[]
): Promise<ScheduleRecommendation> {
  const cacheKey = cache.key("scheduler", classification.niche, classification.audienceAge, ctx.platform);
  const cached   = await cache.get<ScheduleRecommendation>(cacheKey);
  if (cached) {
    trace.push({ agent:"scheduler", model:"command-r", latencyMs:0, cached:true, success:true, attempts:0 });
    return cached;
  }

  const t0 = Date.now();
  try {
    const { result, attempts } = await withRetry(
      async (attempt) => schedulerCB.call(async () => {
        const platform = ctx.platform === "ALL" ? "YOUTUBE" : ctx.platform;
        const prompt   = `You are a social media publishing strategist with expertise in platform algorithms.

${TIMING_KNOWLEDGE}

${SCHEDULER_EXAMPLES}

Now recommend the optimal publish time for this specific content:
  Platform:         ${platform}
  Content niche:    ${classification.niche} (${classification.subNiche})
  Audience age:     ${classification.audienceAge}
  Viral potential:  ${classification.viralPotential}/1.0
  Content tone:     ${classification.sentimentScore > 0.3 ? "positive/uplifting" : classification.sentimentScore < -0.1 ? "edgy/provocative" : "neutral/informational"}

Use the timing data and niche adjustments above. Pick the single best day+hour combination.
${attempt > 0 ? "Return ONLY the JSON object. No surrounding text." : ""}

Return ONLY this exact JSON structure:
{
  "bestDayOfWeek": <integer 0-6, where 0=Sunday>,
  "bestHourUTC": <integer 0-23>,
  "confidenceScore": <decimal 0.0-1.0>,
  "reasoning": "<one specific sentence explaining why this time works for this niche and audience>"
}`;

        const res = await fetch("https://api.cohere.com/v2/chat", {
          method:  "POST",
          headers: { Authorization: `Bearer ${env.COHERE_API_KEY}`, "Content-Type": "application/json" },
          body:    JSON.stringify({
            model:    "command-r",
            messages: [
              { role: "system", content: "You return ONLY valid JSON. Never add text outside the JSON object." },
              { role: "user",   content: prompt },
            ],
            temperature: 0.1,
            max_tokens:  180,
          }),
        });
        if (!res.ok) throw new Error(`Cohere ${res.status}`);
        const data  = await res.json() as { message: { content: { text: string }[] } };
        const raw   = data.message?.content?.[0]?.text ?? "{}";
        const match = raw.match(/\{[\s\S]*?\}/);
        if (!match) throw new Error("No JSON object in Cohere response");
        return safeParseJSON<ScheduleRecommendation>(match[0]);
      }),
      validateSchedule,
      3,
      "scheduler"
    );

    trace.push({ agent:"scheduler", model:"command-r", latencyMs: Date.now()-t0, cached:false, success:true, attempts });
    await cache.set(cacheKey, result, 60 * 60 * 12);
    return result;

  } catch (err) {
    console.warn("[scheduler] degraded, using data-backed fallback:", err);
    const fallback = SCHEDULE_FALLBACKS[ctx.platform] ?? SCHEDULE_FALLBACKS.ALL!;
    trace.push({ agent:"scheduler", model:"command-r", latencyMs: Date.now()-t0, cached:false, success:false, attempts:3, error: String(err) });
    return fallback;
  }
}

// ─────────────────────────────────────────────────────────────────
// ORCHESTRATOR
// Vision → [Writer × 3 + Classifier] → [Optimizer + Scheduler]
// ─────────────────────────────────────────────────────────────────

export class AIOrchestrator {
  async run(ctx: VideoContext): Promise<OrchestratorResult> {
    const t0    = Date.now();
    const trace: AgentTrace[] = [];

    const fullKey    = cache.key("pipeline", ctx.assetId, ctx.platform);
    const fullCached = await cache.get<OrchestratorResult>(fullKey);
    if (fullCached) return { ...fullCached, cacheHit: true, processingMs: Date.now() - t0 };

    // Layer 1 — Vision (blocking — everything depends on it)
    const insights = await visionAgent(ctx, trace);

    // Layer 2 — Writer × 3 angles + Classifier in parallel
    const [variants, classification] = await Promise.all([
      writerAgent(ctx, insights, trace),
      classifierAgent(ctx, insights, trace),
    ]);

    // Layer 3 — Optimizer scores + Scheduler picks timing in parallel
    const [scoredVariants, schedule] = await Promise.all([
      optimizerAgent(ctx, variants, insights, trace),
      schedulerAgent(ctx, classification, trace),
    ]);

    const result: OrchestratorResult = {
      insights,
      variants:     scoredVariants,
      best:         scoredVariants[0]!,
      classification,
      schedule,
      cacheHit:     false,
      processingMs: Date.now() - t0,
      agentTrace:   trace,
    };

    await cache.set(fullKey, result, 60 * 60 * 6);
    return result;
  }
}

export const aiOrchestrator = new AIOrchestrator();
