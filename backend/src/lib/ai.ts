import OpenAI from "openai";

import { env } from "../config/env.js";

let aiClient: OpenAI | null = null;

export function getAIClient(): OpenAI | null {
  if (!env.OPENAI_API_KEY) {
    return null;
  }

  if (!aiClient) {
    aiClient = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      baseURL: env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"
    });
  }

  return aiClient;
}
