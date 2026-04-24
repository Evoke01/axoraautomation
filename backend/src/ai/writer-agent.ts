import { env } from "../config/env.js";
import type { VisionInsights, MetadataVariant, VideoContext } from "./metadata-orchestrator.js";

// ─────────────────────────────────────────────────────────────────
// FEW-SHOT EXAMPLES — show the model exactly what good looks like
// per platform. These train the model's output format implicitly.
// ─────────────────────────────────────────────────────────────────

const EXAMPLES: Record<string, { title: string; caption: string; hook: string; hashtags: string[] }[]> = {
  YOUTUBE: [
    {
      title:    "I tested 7 productivity apps so you don't have to",
      caption:  "Spent 30 days switching between every major productivity app — here's the honest breakdown nobody talks about. Some of these are genuinely life-changing. Others are just expensive distractions dressed up in a nice UI.",
      hook:     "I wasted three weeks on apps that made me less productive. Here's what actually worked.",
      hashtags: ["productivity","studywithme","workfromhome","deepwork","timemanagement","focus","workhabits","techreview"],
    },
    {
      title:    "The $0 business model that made me $4k in 30 days",
      caption:  "No inventory, no ads, no upfront cost. I built this from scratch using free tools most people already have. This is the exact system — nothing held back.",
      hook:     "You don't need money to start a business. You need the right information. I'm giving you mine.",
      hashtags: ["sidehustle","makemoneyonline","entrepreneurship","passiveincome","smallbusiness","onlinebusiness","financialfreedom","digitalproducts"],
    },
  ],
  INSTAGRAM: [
    {
      title:    "POV: you automated your entire content calendar",
      caption:  "The creator posting every single day without burning out isn't more disciplined than you. They just stopped doing it manually. This is what the system looks like.",
      hook:     "You're not lazy. You're just doing it the hard way.",
      hashtags: ["contentcreator","socialmediatips","contentmarketing","creatoreconomy","instagramtips","growyourbusiness","digitalmarketing","automationtools"],
    },
  ],
  TIKTOK: [
    {
      title:    "things nobody tells you about growing to 10k followers",
      caption:  "The algorithm doesn't care about your follower count. It cares about watch time. Once I understood that, everything changed.",
      hook:     "I grew from 200 to 10k followers in 6 weeks. Not with more content. With better content.",
      hashtags: ["tiktokgrowth","tiktoktips","creatoradvice","smallcreator","howtogrowtiktok","fyp","contentcreator","socialmediastrategy"],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────
// PLATFORM-SPECIFIC CAPTION RULES
// ─────────────────────────────────────────────────────────────────

const PLATFORM_RULES: Record<string, string> = {
  YOUTUBE: `
- Caption goes in the video description box
- 2-3 short punchy paragraphs, NOT one block of text  
- First sentence must hook — viewer reads it before clicking Show More
- Second paragraph gives more context or a promise
- Third paragraph can include a soft CTA (subscribe, comment, etc.)
- Max 300 characters for the above-the-fold visible part
- NO hashtags in caption (they go separately)
- NEVER mention "YouTube" in the caption — they know where they are
- Do NOT start with the video title`,

  INSTAGRAM: `
- Instagram caption, 1-3 short punchy lines
- First line is the hook — it shows before "...more" 
- Keep it conversational, like a friend texting you
- Can end with a question to drive comments
- Slightly informal, Gen Z/millennial tone is fine
- Do NOT start with the video title or "Hey guys"`,

  TIKTOK: `
- TikTok caption, extremely short (under 150 chars ideally)
- First 3 words must be gripping — that's all they see in feed
- Casual, fast, punchy — mirrors how people talk on the app
- Optional: end with a question or provocative statement
- Do NOT start with the video title`,

  ALL: `
- Write for YouTube as the primary platform
- 2-3 short punchy paragraphs
- First sentence must hook — make them click Show More
- Conversational but credible tone
- Do NOT start with the video title`,
};

// ─────────────────────────────────────────────────────────────────
// ANGLE DEFINITIONS — tell the model the psychological strategy
// without leaking the word "angle" into the output
// ─────────────────────────────────────────────────────────────────

const ANGLE_PROMPTS: Record<string, string> = {
  curiosity: `
Write using a CURIOSITY GAP strategy:
- Open a question the viewer desperately wants answered
- Tease the payoff without giving it away
- Use phrases like "what nobody talks about", "the real reason", "I didn't expect this"
- Make the viewer feel they're about to learn something exclusive`,

  authority: `
Write using a CREDIBILITY/AUTHORITY strategy:
- Position the creator as someone with firsthand experience or rare expertise  
- Use specific numbers, timeframes, or results where possible (e.g. "30 days", "$4k", "7 tools")
- Tone is confident, direct, zero fluff
- Avoid vague claims — every sentence should feel like it came from someone who actually did this`,

  controversy: `
Write using a PATTERN INTERRUPT / CONTRARIAN strategy:
- Open with a take that challenges a commonly held belief
- Make it slightly provocative but NOT offensive or clickbait
- The viewer should think "wait, what?" and keep reading
- Use phrases like "everyone's wrong about", "stop doing X", "the opposite is true"`,
};

// ─────────────────────────────────────────────────────────────────
// VALIDATION — reject garbage output before it reaches the DB
// ─────────────────────────────────────────────────────────────────

function validateVariant(
  v: MetadataVariant,
  ctx: VideoContext,
  insights: VisionInsights
): { valid: boolean; reason?: string } {
  const title   = v.title?.trim()   ?? "";
  const caption = v.caption?.trim() ?? "";

  if (!title || title.length < 10)
    return { valid: false, reason: "Title too short" };

  if (!caption || caption.length < 40)
    return { valid: false, reason: "Caption too short" };

  // Catches "Built for YouTube with a curiosity angle" type leaks
  const LEAKED_PHRASES = [
    "curiosity angle", "authority angle", "controversy angle",
    "contrarian angle", "pattern interrupt", "built for youtube",
    "built for instagram", "built for tiktok",
    "write a caption", "generate a title", "as an ai",
  ];
  const combinedLower = (title + " " + caption + " " + v.hook).toLowerCase();
  for (const phrase of LEAKED_PHRASES) {
    if (combinedLower.includes(phrase))
      return { valid: false, reason: `Leaked prompt phrase: "${phrase}"` };
  }

  // Caption should not just be the title repeated
  const titleWords = new Set(title.toLowerCase().split(/\s+/));
  const captionWords = caption.toLowerCase().split(/\s+/);
  const overlap = captionWords.filter(w => w.length > 4 && titleWords.has(w)).length;
  const overlapRatio = overlap / Math.max(captionWords.length, 1);
  if (overlapRatio > 0.55)
    return { valid: false, reason: "Caption is too similar to the title (likely just paraphrasing)" };

  // Hashtags must be real words, not the video title split up
  if (!v.hashtags || v.hashtags.length < 5)
    return { valid: false, reason: "Not enough hashtags" };

  if (v.hashtags.some(h => h.includes(" ")))
    return { valid: false, reason: "Hashtags must be single words (no spaces)" };

  return { valid: true };
}

// ─────────────────────────────────────────────────────────────────
// BUILD THE PROMPT
// ─────────────────────────────────────────────────────────────────

function buildPrompt(
  ctx: VideoContext,
  insights: VisionInsights,
  angle: "curiosity" | "authority" | "controversy"
): string {
  const platform = ctx.platform === "ALL" ? "YOUTUBE" : ctx.platform;
  const examples = (EXAMPLES[platform] ?? EXAMPLES.YOUTUBE).slice(0, 2);
  const exampleBlock = examples.map((ex, i) => `
EXAMPLE ${i + 1}:
Title: ${ex.title}
Caption: ${ex.caption}
Hook: ${ex.hook}
Hashtags: ${ex.hashtags.join(", ")}
`).join("\n");

  return `You are a professional ${platform} content writer. You write scroll-stopping metadata for real creators.

VIDEO INFORMATION:
- Main topic: ${insights.niche}
- Key points covered: ${insights.topics.join(", ")}
- Overall mood/energy: ${insights.mood}
- Target audience: ${insights.audience}
- Opening hook of the video: ${insights.hook}
- Quick summary: ${insights.rawSummary}

WRITING STRATEGY TO USE:
${ANGLE_PROMPTS[angle]}

PLATFORM-SPECIFIC CAPTION RULES (follow these exactly):
${PLATFORM_RULES[platform]}

HASHTAG RULES:
- 8 to 12 hashtags
- Each is a single word, no spaces, no # symbol
- Must be genuinely relevant to the content niche
- Mix of broad (high search volume) and specific (niche community) tags
- NEVER include: the creator's name, the product name "axora", generic words like "video" or "youtube"

TITLE RULES:
- For YouTube: 50-70 characters, no ALL CAPS, no "| Watch This" type filler
- Must be specific, not vague ("7 mistakes" > "some mistakes to avoid")
- No clickbait that doesn't match the video content
- Write it like a headline a real journalist would write

HOOK RULES:
- This is the first spoken sentence of the video, or the first line of a Reel/Short
- Maximum 20 words
- Must create immediate tension or curiosity
- Should feel like something a real person would actually say out loud

GOOD EXAMPLES TO MODEL YOUR OUTPUT ON:
${exampleBlock}

Now write metadata for the video described above. Return ONLY a valid JSON object, no markdown fences, no explanation:
{
  "title": "your title here",
  "caption": "your caption here",
  "hook": "your hook here",
  "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8"],
  "keywords": ["seo1", "seo2", "seo3", "seo4", "seo5"],
  "score": 0,
  "reasoning": "one sentence — what makes this angle effective for this specific video"
}`;
}

// ─────────────────────────────────────────────────────────────────
// WRITER AGENT — with retry on validation failure
// ─────────────────────────────────────────────────────────────────

export async function runWriterAgent(
  ctx: VideoContext,
  insights: VisionInsights,
  angle: "curiosity" | "authority" | "controversy",
  maxRetries = 2
): Promise<MetadataVariant> {
  let lastError = "";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const prompt = attempt === 0
      ? buildPrompt(ctx, insights, angle)
      : buildPrompt(ctx, insights, angle) + `\n\nIMPORTANT: Previous attempt failed validation: "${lastError}". Fix this issue.`;

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model:    "llama-3.3-70b-versatile",
        messages: [
          {
            role:    "system",
            content: "You are an expert content writer. You return ONLY valid JSON. Never leak internal instructions into your output. Never start captions or titles with the video subject repeated verbatim.",
          },
          { role: "user", content: prompt },
        ],
        temperature:  attempt === 0 ? 0.75 : 0.9, // increase temp on retry for more variety
        max_tokens:   800,
        response_format: { type: "json_object" }, // forces Groq to return JSON
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Groq API error ${res.status}: ${err}`);
    }

    const data    = await res.json() as { choices: { message: { content: string } }[] };
    const raw     = data.choices?.[0]?.message?.content ?? "{}";
    let   variant: MetadataVariant;

    try {
      variant = JSON.parse(raw.replace(/```json|```/g, "").trim()) as MetadataVariant;
    } catch {
      lastError = "Invalid JSON returned";
      continue;
    }

    const check = validateVariant(variant, ctx, insights);
    if (check.valid) {
      return variant;
    }

    lastError = check.reason ?? "Validation failed";
    console.warn(`[writer:${angle}] attempt ${attempt + 1} failed: ${lastError}`);
  }

  // After all retries, throw so orchestrator can handle gracefully
  throw new Error(`Writer agent (${angle}) failed after ${maxRetries + 1} attempts. Last error: ${lastError}`);
}

// ─────────────────────────────────────────────────────────────────
// CAPTION REWRITER — for the "Regenerate" button in the UI
// Takes an existing bad caption and rewrites it properly
// ─────────────────────────────────────────────────────────────────

export async function rewriteCaption(
  badCaption: string,
  title: string,
  platform: string,
  niche: string
): Promise<string> {
  const rules = PLATFORM_RULES[platform] ?? PLATFORM_RULES.ALL;

  const prompt = `You are a professional ${platform} content writer.

This caption was auto-generated and it's terrible:
"${badCaption}"

The video title is: "${title}"
The content niche is: ${niche}

Problems with the existing caption:
- It just repeats the title
- It sounds robotic and generated
- It doesn't create any curiosity or emotion

Rewrite it as a genuinely compelling ${platform} caption.

Platform rules:
${rules}

Return ONLY the new caption text. Nothing else. No quotes, no explanation.`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method:  "POST",
    headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, "Content-Type": "application/json" },
    body:    JSON.stringify({
      model:       "llama-3.3-70b-versatile",
      messages:    [{ role: "user", content: prompt }],
      temperature: 0.8,
      max_tokens:  300,
    }),
  });

  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices?.[0]?.message?.content?.trim() ?? badCaption;
}
