import "dotenv/config";

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_URL: z.string().url(),
  FRONTEND_APP_URL: z.string().url().optional().or(z.literal("")),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  APP_ENCRYPTION_KEY: z.string().min(16),
  AUTH_JWKS_URL: z.string().url().optional().or(z.literal("")),
  AUTH_ISSUER: z.string().optional(),
  AUTH_AUDIENCE: z.string().optional(),
  DEV_AUTH_BYPASS: z.coerce.boolean().default(false),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_PUBLIC_BASE_URL: z.string().url().optional().or(z.literal("")),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(false),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-1.5-flash"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  INSTAGRAM_CLIENT_ID: z.string().optional(),
  INSTAGRAM_CLIENT_SECRET: z.string().optional(),
  INSTAGRAM_REDIRECT_URI: z.string().url().optional(),
  INSTAGRAM_AUTH_URL: z.string().url().default("https://www.instagram.com/oauth/authorize"),
  INSTAGRAM_TOKEN_URL: z.string().url().default("https://api.instagram.com/oauth/access_token"),
  INSTAGRAM_LONG_LIVED_TOKEN_URL: z
    .string()
    .url()
    .default("https://graph.instagram.com/access_token"),
  INSTAGRAM_ME_URL: z.string().url().default("https://graph.instagram.com/me"),
  TIKTOK_CLIENT_KEY: z.string().optional(),
  TIKTOK_CLIENT_SECRET: z.string().optional(),
  TIKTOK_REDIRECT_URI: z.string().url().optional(),
  TIKTOK_AUTH_URL: z
    .string()
    .url()
    .default("https://www.tiktok.com/v2/auth/authorize/"),
  TIKTOK_TOKEN_URL: z
    .string()
    .url()
    .default("https://open.tiktokapis.com/v2/oauth/token/"),
  GROQ_API_KEY: z.string().optional(),
  GROQ_BASE_URL: z.string().url().default("https://api.groq.com/openai/v1"),
  GROQ_MODEL: z.string().default("llama-3.3-70b-versatile"),
  MISTRAL_API_KEY: z.string().optional(),
  MISTRAL_API_URL: z.string().url().default("https://api.mistral.ai/v1/chat/completions"),
  MISTRAL_MODEL: z.string().default("mistral-small-latest"),
  COHERE_API_KEY: z.string().optional(),
  COHERE_API_URL: z.string().url().default("https://api.cohere.com/v2/chat"),
  COHERE_MODEL: z.string().default("command-r-08-2024"),
  HF_API_TOKEN: z.string().optional(),
  HF_ZERO_SHOT_MODEL: z.string().default("facebook/bart-large-mnli"),
  HF_INFERENCE_BASE_URL: z
    .string()
    .url()
    .default("https://router.huggingface.co/hf-inference/models"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
  OPENAI_MODEL: z.string().default("deepseek-chat"),
  MAX_VIDEO_BYTES: z.coerce.number().int().positive().default(524288000),
  MAX_VIDEO_DURATION_SECONDS: z.coerce.number().int().positive().default(600),
  WORKSPACE_TIMEZONE: z.string().default("UTC"),
  DEFAULT_WEEKLY_REPORT_HOUR: z.coerce.number().int().min(0).max(23).default(9),
  YOUTUBE_DAILY_QUOTA_LIMIT: z.coerce.number().int().positive().default(10000),
  YOUTUBE_UPLOAD_RESERVATION_UNITS: z.coerce.number().int().positive().default(150),
  YOUTUBE_QUOTA_SAFETY_BUFFER: z.coerce.number().int().nonnegative().default(2000),
  YOUTUBE_ALLOW_MOCK: z.coerce.boolean().default(false)
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables.");
}

export const env = {
  ...parsed.data,
  AUTH_JWKS_URL: parsed.data.AUTH_JWKS_URL || undefined,
  FRONTEND_APP_URL: parsed.data.FRONTEND_APP_URL || undefined,
  S3_PUBLIC_BASE_URL: parsed.data.S3_PUBLIC_BASE_URL || undefined
};

export type Env = typeof env;
