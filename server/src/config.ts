import { emailModeSchema } from "@business-automation/shared";
import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().optional(),
  CLIENT_ORIGIN: z.string().default("http://localhost:5173"),
  APP_BASE_URL: z.string().default("http://localhost:4000"),
  ADMIN_PASSCODE: z.string().default("demo123"),
  SESSION_SECRET: z.string().default("demo-salon-session-secret"),
  EMAIL_MODE: emailModeSchema.default("demo"),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().default("Demo Salon <onboarding@resend.dev>"),
  SUPPORT_EMAIL: z.string().email().default("sales@demosalon.app"),
  LIVE_REMINDER_HOURS: z.coerce.number().default(24),
  LIVE_FOLLOW_UP_HOURS: z.coerce.number().default(24),
  LIVE_REENGAGEMENT_DAYS: z.coerce.number().default(7),
  DEMO_REMINDER_MS: z.coerce.number().default(10000),
  DEMO_AUTO_COMPLETE_MS: z.coerce.number().default(15000),
  DEMO_FOLLOW_UP_MS: z.coerce.number().default(5000),
  DEMO_REENGAGEMENT_MS: z.coerce.number().default(10000)
});

export type AppConfig = z.infer<typeof envSchema>;

export const config = envSchema.parse(process.env);
