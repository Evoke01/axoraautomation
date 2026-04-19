import { z } from "zod";
import type {
  AIProvider,
  Capability,
  CompletionOptions,
  CompletionResult,
  CompletionChunk,
  HealthStatus
} from "./providers/base.js";
import { AILayer, type AILayerConfig, type LayerTier } from "./layer.js";

export type RoutingStrategy = "cost-optimized" | "quality-optimized" | "speed-optimized" | "cascade";

export interface RoutingContext {
  strategy: RoutingStrategy;
  requiredCapabilities: Capability[];
  preferredTier?: LayerTier;
  maxCost?: number;
  maxLatencyMs?: number;
  allowFallback: boolean;
  allowEscalation: boolean;
}

export interface OrchestratorConfig {
  defaultStrategy: RoutingStrategy;
  healthCheckIntervalMs: number;
  circuitBreakerThreshold: number;
  circuitBreakerResetMs: number;
}

export interface LayerScore {
  layer: AILayer;
  score: number;
  reason: string;
}

export class AIOrchestrator implements AIProvider {
  readonly name = "orchestrator";
  readonly capabilities: Capability[] = [
    "text-generation",
    "image-analysis",
    "video-analysis",
    "embedding",
    "classification",
    "structured-output"
  ];

  private layers = new Map<LayerTier, AILayer>();
  private config: OrchestratorConfig;
  private circuitBreakers = new Map<string, { failures: number; lastFailure: number }>();

  constructor(config: Partial<OrchestratorConfig> = {}) {
    this.config = {
      defaultStrategy: "cascade",
      healthCheckIntervalMs: 30000,
      circuitBreakerThreshold: 5,
      circuitBreakerResetMs: 60000,
      ...config
    };
  }

  registerLayer(layer: AILayer): void {
    this.layers.set(layer.config.tier, layer);
  }

  getLayer(tier: LayerTier): AILayer | undefined {
    return this.layers.get(tier);
  }

  get isAvailable(): boolean {
    return Array.from(this.layers.values()).some(l => l.isAvailable);
  }

  async complete<T>(options: CompletionOptions<T>): Promise<CompletionResult<T>> {
    const context = this.inferRoutingContext(options);
    const route = this.selectRoute(context);

    const errors: string[] = [];

    for (const { layer } of route) {
      if (!this.isCircuitClosed(layer.config.tier)) {
        errors.push(`${layer.config.name}: Circuit breaker open`);
        continue;
      }

      try {
        const result = await layer.complete(options);
        this.recordSuccess(layer.config.tier);
        return result;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`${layer.config.name}: ${errorMsg}`);
        this.recordFailure(layer.config.tier);

        if (!context.allowFallback) {
          break;
        }
      }
    }

    throw new Error(`Orchestrator failed: ${errors.join("; ")}`);
  }

  async *stream<T>(options: CompletionOptions<T>): AsyncIterable<CompletionChunk<T>> {
    const context = this.inferRoutingContext(options);
    const route = this.selectRoute(context);

    for (const { layer } of route) {
      if (!this.isCircuitClosed(layer.config.tier)) {
        continue;
      }

      const providers = layer.getProviders();
      for (const provider of providers) {
        if (!provider.stream) continue;

        try {
          const stream = await provider.stream(options);
          for await (const chunk of stream) {
            yield chunk;
          }
          return;
        } catch (error) {
          this.recordFailure(layer.config.tier);
          if (!context.allowFallback) throw error;
        }
      }
    }

    throw new Error("No available provider for streaming");
  }

  async health(): Promise<HealthStatus> {
    const results = await Promise.all(
      Array.from(this.layers.values()).map(l => l.health().catch(() => ({ healthy: false, latencyMs: 0 })))
    );

    const healthy = results.some(r => r.healthy);
    const avgLatency = results.length > 0
      ? results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length
      : 0;

    const unhealthy = results
      .map((r, i) => ({ ...r, tier: Array.from(this.layers.keys())[i] }))
      .filter(r => !r.healthy)
      .map(r => r.tier);

    return {
      healthy,
      latencyMs: avgLatency,
      error: unhealthy.length > 0 ? `Unhealthy layers: ${unhealthy.join(", ")}` : undefined
    };
  }

  selectRoute(context: RoutingContext): LayerScore[] {
    const availableLayers = Array.from(this.layers.values())
      .filter(l => l.isAvailable && l.canHandle(context.requiredCapabilities));

    if (availableLayers.length === 0) {
      throw new Error(`No layer available for capabilities: ${context.requiredCapabilities.join(", ")}`);
    }

    const scored = availableLayers.map(layer => this.scoreLayer(layer, context));
    return scored.sort((a, b) => b.score - a.score);
  }

  private scoreLayer(layer: AILayer, context: RoutingContext): LayerScore {
    let score = 0;
    const reasons: string[] = [];

    switch (context.strategy) {
      case "cost-optimized": {
        const costScore = 1 / (1 + layer.config.costPer1KTokens);
        score = costScore * 100;
        reasons.push(`cost=${layer.config.costPer1KTokens}`);
        break;
      }

      case "speed-optimized": {
        const speedScore = 1 / (1 + layer.config.avgLatencyMs / 1000);
        score = speedScore * 100;
        reasons.push(`latency=${layer.config.avgLatencyMs}ms`);
        break;
      }

      case "quality-optimized": {
        const tierQuality: Record<LayerTier, number> = {
          local: 0.6,
          fast: 0.7,
          balanced: 0.85,
          premium: 1.0
        };
        score = (tierQuality[layer.config.tier] ?? 0.7) * 100;
        reasons.push(`tier=${layer.config.tier}`);
        break;
      }

      case "cascade": {
        const tierOrder: Record<LayerTier, number> = {
          local: 4,
          fast: 3,
          balanced: 2,
          premium: 1
        };
        score = (tierOrder[layer.config.tier] ?? 0) * 25;
        reasons.push(`cascade-priority=${layer.config.tier}`);
        break;
      }
    }

    if (context.preferredTier === layer.config.tier) {
      score += 50;
      reasons.push("preferred");
    }

    if (context.maxCost && layer.config.costPer1KTokens > context.maxCost) {
      score -= 100;
      reasons.push("over-budget");
    }

    if (context.maxLatencyMs && layer.config.avgLatencyMs > context.maxLatencyMs) {
      score -= 100;
      reasons.push("too-slow");
    }

    if (!this.isCircuitClosed(layer.config.tier)) {
      score -= 200;
      reasons.push("circuit-open");
    }

    return { layer, score, reason: reasons.join(", ") };
  }

  private inferRoutingContext<T>(options: CompletionOptions<T>): RoutingContext {
    const requiredCapabilities: Capability[] = ["structured-output"];

    if (options.schema) {
      requiredCapabilities.push("structured-output");
    }

    return {
      strategy: this.config.defaultStrategy,
      requiredCapabilities,
      allowFallback: true,
      allowEscalation: true
    };
  }

  private isCircuitClosed(tier: LayerTier): boolean {
    const state = this.circuitBreakers.get(tier);
    if (!state) return true;

    const timeSinceLastFailure = Date.now() - state.lastFailure;
    if (timeSinceLastFailure > this.config.circuitBreakerResetMs) {
      this.circuitBreakers.delete(tier);
      return true;
    }

    return state.failures < this.config.circuitBreakerThreshold;
  }

  private recordSuccess(tier: LayerTier): void {
    this.circuitBreakers.delete(tier);
  }

  private recordFailure(tier: LayerTier): void {
    const current = this.circuitBreakers.get(tier);
    this.circuitBreakers.set(tier, {
      failures: (current?.failures ?? 0) + 1,
      lastFailure: Date.now()
    });
  }
}
