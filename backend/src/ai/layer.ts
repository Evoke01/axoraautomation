import { z } from "zod";
import type {
  AIProvider,
  Capability,
  CompletionOptions,
  CompletionResult,
  HealthStatus
} from "./providers/base.js";

export type LayerTier = "local" | "fast" | "balanced" | "premium";

export interface AILayerConfig {
  tier: LayerTier;
  name: string;
  description: string;
  priority: number;
  maxRetries: number;
  timeoutMs: number;
  costPer1KTokens: number;
  avgLatencyMs: number;
  capabilities: Capability[];
  requiredFor?: Capability[];
  fallbackTo?: LayerTier[];
}

export class AILayer {
  readonly config: AILayerConfig;
  private providers: AIProvider[] = [];
  private healthScores = new Map<string, number>();

  constructor(config: AILayerConfig) {
    this.config = config;
  }

  addProvider(provider: AIProvider): void {
    const hasRequiredCaps = this.config.requiredFor?.every(cap =>
      provider.capabilities.includes(cap)
    ) ?? true;

    if (!hasRequiredCaps) {
      throw new Error(
        `Provider ${provider.name} missing required capabilities for layer ${this.config.name}`
      );
    }

    this.providers.push(provider);
    this.healthScores.set(provider.name, 1.0);
  }

  get isAvailable(): boolean {
    return this.providers.some(p => p.isAvailable && (this.healthScores.get(p.name) ?? 0) > 0.3);
  }

  getProviders(): AIProvider[] {
    return [...this.providers].sort((a, b) => {
      const scoreA = this.healthScores.get(a.name) ?? 0;
      const scoreB = this.healthScores.get(b.name) ?? 0;
      return scoreB - scoreA;
    });
  }

  canHandle(capabilities: Capability[]): boolean {
    return capabilities.every(cap => this.config.capabilities.includes(cap));
  }

  async complete<T>(options: CompletionOptions<T>): Promise<CompletionResult<T>> {
    const errors: string[] = [];
    const availableProviders = this.getProviders().filter(p => p.isAvailable);

    for (const provider of availableProviders) {
      for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
        try {
          const startTime = Date.now();
          const result = await this.executeWithTimeout(
            () => provider.complete(options),
            this.config.timeoutMs
          );

          this.updateHealth(provider.name, true, Date.now() - startTime);
          return {
            ...result,
            provider: `${this.config.tier}:${provider.name}`
          };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          errors.push(`${provider.name}(attempt${attempt + 1}): ${errorMsg}`);
          this.updateHealth(provider.name, false, 0);

          if (attempt < this.config.maxRetries - 1) {
            await this.delay(Math.min(1000 * Math.pow(2, attempt), 5000));
          }
        }
      }
    }

    throw new Error(`Layer ${this.config.name} failed: ${errors.join("; ")}`);
  }

  async health(): Promise<HealthStatus> {
    const results = await Promise.all(
      this.providers.map(async p => {
        try {
          return await p.health();
        } catch {
          return { healthy: false, latencyMs: 0 };
        }
      })
    );

    const healthy = results.some(r => r.healthy);
    const avgLatency = results.length > 0
      ? results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length
      : 0;

    for (let i = 0; i < this.providers.length; i++) {
      const provider = this.providers[i];
      if (!provider) continue;
      const result = results[i];
      if (result) {
        this.updateHealth(provider.name, result.healthy, result.latencyMs);
      }
    }

    return {
      healthy,
      latencyMs: avgLatency,
      error: healthy ? undefined : `No healthy providers in layer ${this.config.name}`
    };
  }

  private updateHealth(providerName: string, success: boolean, latencyMs: number): void {
    const current = this.healthScores.get(providerName) ?? 1.0;
    const decay = success ? 0.05 : 0.3;
    const newScore = success
      ? Math.min(1.0, current + 0.1)
      : Math.max(0, current - decay);
    this.healthScores.set(providerName, newScore);
  }

  private async executeWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
