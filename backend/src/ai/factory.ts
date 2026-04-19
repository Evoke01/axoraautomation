import { env } from "../config/env.js";
import { GroqProvider } from "./providers/groq.js";
import { OllamaProvider } from "./providers/ollama.js";
import { HuggingFaceProvider } from "./providers/huggingface.js";
import { CohereProvider } from "./providers/cohere.js";
import { MistralProvider } from "./providers/mistral.js";
import { AILayer, type AILayerConfig } from "./layer.js";
import { AIOrchestrator, type OrchestratorConfig } from "./orchestrator.js";

export interface MultiLayerAIOptions {
  orchestratorConfig?: Partial<OrchestratorConfig>;
  enableLocal?: boolean;
  enableFast?: boolean;
  enableBalanced?: boolean;
  enablePremium?: boolean;
}

export function createMultiLayerAI(options: MultiLayerAIOptions = {}): AIOrchestrator {
  const {
    orchestratorConfig,
    enableLocal = true,
    enableFast = true,
    enableBalanced = true,
    enablePremium = false
  } = options;

  const orchestrator = new AIOrchestrator(orchestratorConfig);

  if (enableLocal) {
    const localLayer = createLocalLayer();
    if (localLayer.isAvailable) {
      orchestrator.registerLayer(localLayer);
    }
  }

  if (enableFast) {
    const fastLayer = createFastLayer();
    if (fastLayer.isAvailable) {
      orchestrator.registerLayer(fastLayer);
    }
  }

  if (enableBalanced) {
    const balancedLayer = createBalancedLayer();
    if (balancedLayer.isAvailable) {
      orchestrator.registerLayer(balancedLayer);
    }
  }

  if (enablePremium) {
    const premiumLayer = createPremiumLayer();
    if (premiumLayer.isAvailable) {
      orchestrator.registerLayer(premiumLayer);
    }
  }

  return orchestrator;
}

function createLocalLayer(): AILayer {
  const config: AILayerConfig = {
    tier: "local",
    name: "Local Layer",
    description: "Free local inference via Ollama",
    priority: 4,
    maxRetries: 2,
    timeoutMs: 60000,
    costPer1KTokens: 0,
    avgLatencyMs: 2000,
    capabilities: ["text-generation", "structured-output", "embedding"],
    fallbackTo: ["fast", "balanced"]
  };

  const layer = new AILayer(config);

  const ollama = new OllamaProvider();
  if (ollama.isAvailable) {
    layer.addProvider(ollama);
  }

  return layer;
}

function createFastLayer(): AILayer {
  const config: AILayerConfig = {
    tier: "fast",
    name: "Fast Layer",
    description: "Low-latency inference via Groq",
    priority: 3,
    maxRetries: 2,
    timeoutMs: 15000,
    costPer1KTokens: 0.05,
    avgLatencyMs: 500,
    capabilities: ["text-generation", "structured-output"],
    fallbackTo: ["balanced", "premium"]
  };

  const layer = new AILayer(config);

  const groq = new GroqProvider();
  if (groq.isAvailable) {
    layer.addProvider(groq);
  }

  const mistral = new MistralProvider();
  if (mistral.isAvailable) {
    layer.addProvider(mistral);
  }

  return layer;
}

function createBalancedLayer(): AILayer {
  const config: AILayerConfig = {
    tier: "balanced",
    name: "Balanced Layer",
    description: "HuggingFace inference for classification",
    priority: 2,
    maxRetries: 3,
    timeoutMs: 20000,
    costPer1KTokens: 0.02,
    avgLatencyMs: 1500,
    capabilities: ["text-generation", "classification", "embedding"],
    requiredFor: ["classification"],
    fallbackTo: ["fast", "premium"]
  };

  const layer = new AILayer(config);

  if (env.HF_API_TOKEN) {
    const hf = new HuggingFaceProvider();
    if (hf.isAvailable) {
      layer.addProvider(hf);
    }
  }

  const cohere = new CohereProvider();
  if (cohere.isAvailable) {
    layer.addProvider(cohere);
  }

  return layer;
}

function createPremiumLayer(): AILayer {
  const config: AILayerConfig = {
    tier: "premium",
    name: "Premium Layer",
    description: "High-quality inference (Gemini/OpenAI)",
    priority: 1,
    maxRetries: 3,
    timeoutMs: 30000,
    costPer1KTokens: 0.50,
    avgLatencyMs: 3000,
    capabilities: ["text-generation", "image-analysis", "video-analysis", "structured-output"],
    requiredFor: ["video-analysis", "image-analysis"],
    fallbackTo: ["balanced"]
  };

  const layer = new AILayer(config);

  return layer;
}

export function createCostOptimizedAI(): AIOrchestrator {
  return createMultiLayerAI({
    orchestratorConfig: { defaultStrategy: "cost-optimized" },
    enableLocal: true,
    enableFast: true,
    enableBalanced: true,
    enablePremium: false
  });
}

export function createSpeedOptimizedAI(): AIOrchestrator {
  return createMultiLayerAI({
    orchestratorConfig: { defaultStrategy: "speed-optimized" },
    enableLocal: false,
    enableFast: true,
    enableBalanced: false,
    enablePremium: false
  });
}

export function createQualityOptimizedAI(): AIOrchestrator {
  return createMultiLayerAI({
    orchestratorConfig: { defaultStrategy: "quality-optimized" },
    enableLocal: false,
    enableFast: false,
    enableBalanced: true,
    enablePremium: false
  });
}

export function createPremiumAI(): AIOrchestrator {
  return createMultiLayerAI({
    orchestratorConfig: { defaultStrategy: "quality-optimized" },
    enableLocal: false,
    enableFast: false,
    enableBalanced: false,
    enablePremium: true
  });
}

export function createCascadeAI(): AIOrchestrator {
  return createMultiLayerAI({
    orchestratorConfig: { defaultStrategy: "cascade" },
    enableLocal: true,
    enableFast: true,
    enableBalanced: true,
    enablePremium: false
  });
}
