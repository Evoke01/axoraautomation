import "dotenv/config";

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_URL: z.string().url(),
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
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
  OPENAI_MODEL: z.string().default("deepseek-chat"),
  MAX_VIDEO_BYTES: z.coerce.number().int().positive().default(524288000),
  MAX_VIDEO_DURATION_SECONDS: z.coerce.number().int().positive().default(600),
  WORKSPACE_TIMEZONE: z.string().default("UTC"),
  DEFAULT_WEEKLY_REPORT_HOUR: z.coerce.number().int().min(0).max(23).default(9),
  YOUTUBE_DAILY_QUOTA_LIMIT: z.coerce.number().int().positive().default(10000),
  YOUTUBE_UPLOAD_RESERVATION_UNITS: z.coerce.number().int().positive().default(150),
  YOUTUBE_QUOTA_SAFETY_BUFFER: z.coerce.number().int().nonnegative().default(2000)
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables.");
}

export const env = {
  ...parsed.data,
  AUTH_JWKS_URL: parsed.data.AUTH_JWKS_URL || undefined,
  S3_PUBLIC_BASE_URL: parsed.data.S3_PUBLIC_BASE_URL || undefined
};

export type Env = typeof env;
