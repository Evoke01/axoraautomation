// Agent System Exports
export {
  BaseAgent,
  SimpleMemory,
  ToolRegistryImpl,
  type Agent,
  type AgentContext,
  type AgentDecision,
  type AgentMemory,
  type AgentResult,
  type ToolExecution,
  type ToolRegistry
} from "./base.js";

// Tool types from providers
export type { Tool, ToolCall, ToolContext } from "../ai/providers/base.js";

export { ClassifierAgent, type ClassificationResult } from "./classifier.js";
export { VisionAgent, type VisionResult } from "./vision.js";
export { WriterAgent, type MetadataVariant, type WriterResult } from "./writer.js";
export { OptimizerAgent, type VariantScore, type OptimizerResult } from "./optimizer.js";
export { SchedulerAgent, type ScheduleSlot, type SchedulerResult } from "./scheduler.js";
export { TrendAgent, type TrendPrediction, type TrendResult } from "./trend.js";

export {
  AgentWorkflow,
  createContentPipeline,
  type WorkflowContext,
  type WorkflowResult,
  type WorkflowStep,
  type ContentPipelineConfig
} from "./workflow.js";
