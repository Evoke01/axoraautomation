import { z } from "zod";
import { env } from "../../config/env.js";
import type { AIProvider, CompletionOptions, CompletionResult, HealthStatus, Message } from "./base.js";

export class HuggingFaceProvider implements AIProvider {
  readonly name = "huggingface";
  readonly capabilities = ["text-generation", "classification", "embedding"] as const;
  
  private apiToken: string;
  private baseUrl = "https://api-inference.huggingface.co";
  private textModel: string;
  private embeddingModel: string;
  
  constructor() {
    this.apiToken = env.HF_API_TOKEN ?? "";
    this.textModel = env.HF_TEXT_MODEL ?? "mistralai/Mistral-7B-Instruct-v0.2";
    this.embeddingModel = env.HF_EMBEDDING_MODEL ?? "sentence-transformers/all-MiniLM-L6-v2";
  }
  
  get isAvailable(): boolean {
    return Boolean(this.apiToken);
  }
  
  async complete<T>(options: CompletionOptions<T>): Promise<CompletionResult<T>> {
    const startTime = Date.now();
    
    const prompt = this.buildPrompt(options.prompt);
    
    const response = await fetch(`${this.baseUrl}/models/${this.textModel}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: options.maxTokens ?? 1024,
          temperature: options.temperature ?? 0.7,
          return_full_text: false
        }
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HuggingFace error: ${response.status} ${error}`);
    }
    
    const data = await response.json() as Array<{ generated_text: string }>;
    const raw = data[0]?.generated_text ?? "";
    
    // Parse and validate
    let parsed: T;
    try {
      const cleaned = this.cleanJson(raw);
      parsed = options.schema.parse(JSON.parse(cleaned));
    } catch (error) {
      const extracted = this.extractJson(raw);
      if (extracted) {
        parsed = options.schema.parse(JSON.parse(extracted));
      } else {
        throw new Error(`Failed to parse HF output: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // Estimate token usage (HF doesn't return this)
    const promptTokens = Math.ceil(prompt.length / 4);
    const completionTokens = Math.ceil(raw.length / 4);
    
    return {
      content: parsed,
      raw,
      usage: {
        prompt: promptTokens,
        completion: completionTokens,
        total: promptTokens + completionTokens
      },
      latencyMs: Date.now() - startTime,
      provider: this.name,
      model: this.textModel,
      cached: false
    };
  }
  
  async classify(text: string, labels: string[]): Promise<Array<{ label: string; score: number }>> {
    const response = await fetch(
      `${this.baseUrl}/models/${env.HF_ZERO_SHOT_MODEL ?? "facebook/bart-large-mnli"}`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          inputs: text,
          parameters: {
            candidate_labels: labels,
            multi_label: true
          }
        })
      }
    );
    
    if (!response.ok) {
      throw new Error(`HF classification error: ${response.status}`);
    }
    
    const data = await response.json() as 
      | { labels: string[]; scores: number[] }
      | Array<{ label: string; score: number }>;
    
    if (Array.isArray(data)) {
      return data
        .filter(d => typeof d.label === "string" && typeof d.score === "number")
        .map(d => ({ label: d.label, score: d.score }))
        .sort((a, b) => b.score - a.score);
    }
    
    if (data.labels && data.scores) {
      return data.labels
        .map((label, i) => ({ label, score: data.scores[i] ?? 0 }))
        .sort((a, b) => b.score - a.score);
    }
    
    return [];
  }
  
  async embed(texts: string[]): Promise<number[][]> {
    const response = await fetch(`${this.baseUrl}/models/${this.embeddingModel}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ inputs: texts })
    });
    
    if (!response.ok) {
      throw new Error(`HF embedding error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (Array.isArray(data) && Array.isArray(data[0])) {
      return data as number[][];
    }
    
    // Handle single embedding case
    if (texts.length === 1 && Array.isArray(data)) {
      return [data as number[]];
    }
    
    throw new Error("Unexpected embedding format from HF");
  }
  
  async health(): Promise<HealthStatus> {
    const start = Date.now();
    
    try {
      const response = await fetch(`${this.baseUrl}/status`, {
        method: "GET",
        headers: { "Authorization": `Bearer ${this.apiToken}` },
        signal: AbortSignal.timeout(5000)
      });
      
      return {
        healthy: response.ok,
        latencyMs: Date.now() - start
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  private buildPrompt(prompt: string | Message[]): string {
    if (typeof prompt === "string") {
      return prompt;
    }
    
    // Build instruction-following format
    let result = "";
    
    for (const msg of prompt) {
      if (msg.role === "system") {
        result += `<system>\n${msg.content}\n</system>\n\n`;
      } else if (msg.role === "user") {
        result += `<user>\n${msg.content}\n</user>\n\n`;
      } else if (msg.role === "assistant") {
        result += `<assistant>\n${msg.content}\n</assistant>\n\n`;
      }
    }
    
    result += "<assistant>\n";
    return result;
  }
  
  private cleanJson(raw: string): string {
    return raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }
  
  private extractJson(raw: string): string | null {
    const match = raw.match(/\{[\s\S]*\}/);
    return match ? match[0] : null;
  }
}
