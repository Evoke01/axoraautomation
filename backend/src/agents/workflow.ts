import type { Agent, AgentContext, AgentResult, AgentMemory, ToolRegistry } from "./base.js";
import { SimpleMemory, ToolRegistryImpl } from "./base.js";
import type { AIProvider } from "../ai/providers/base.js";
import type { AIOrchestrator, RoutingStrategy } from "../ai/orchestrator.js";
import { VisionAgent } from "./vision.js";
import { WriterAgent } from "./writer.js";
import { OptimizerAgent } from "./optimizer.js";
import { SchedulerAgent } from "./scheduler.js";
import { TrendAgent } from "./trend.js";

export interface WorkflowStep {
  agentId: string;
  agent: Agent;
  inputMapper: (context: WorkflowContext) => Record<string, unknown>;
  outputKey: string;
  condition?: (context: WorkflowContext) => boolean;
}

export interface WorkflowContext {
  workspaceId: string;
  assetId?: string;
  creatorId?: string;
  userId?: string;
  prisma: unknown;
  services: unknown;
  data: Map<string, unknown>;
  memory: AgentMemory;
  tools: ToolRegistry;
}

export interface WorkflowResult {
  success: boolean;
  outputs: Map<string, AgentResult>;
  finalOutput: Record<string, unknown>;
  executionPath: string[];
  totalLatencyMs: number;
  errors: string[];
}

export class AgentWorkflow {
  private steps: WorkflowStep[] = [];
  private orchestrator: AIOrchestrator;

  constructor(orchestrator: AIOrchestrator) {
    this.orchestrator = orchestrator;
  }

  addStep(step: WorkflowStep): this {
    this.steps.push(step);
    return this;
  }

  async execute(initialContext: Partial<WorkflowContext>): Promise<WorkflowResult> {
    const startTime = Date.now();
    const outputs = new Map<string, AgentResult>();
    const executionPath: string[] = [];
    const errors: string[] = [];

    const context: WorkflowContext = {
      workspaceId: initialContext.workspaceId || "",
      assetId: initialContext.assetId,
      creatorId: initialContext.creatorId,
      userId: initialContext.userId,
      prisma: initialContext.prisma || {},
      services: initialContext.services || {},
      data: initialContext.data || new Map(),
      memory: initialContext.memory || new SimpleMemory(),
      tools: initialContext.tools || new ToolRegistryImpl()
    };

    for (const step of this.steps) {
      if (step.condition && !step.condition(context)) {
        continue;
      }

      try {
        const agentContext: AgentContext = {
          workspaceId: context.workspaceId,
          assetId: context.assetId,
          creatorId: context.creatorId,
          userId: context.userId,
          input: step.inputMapper(context),
          memory: context.memory,
          tools: context.tools,
          prisma: context.prisma,
          services: context.services,
          iteration: 1,
          maxIterations: 5
        };

        if (!step.agent.canHandle(agentContext)) {
          errors.push(`${step.agentId}: Cannot handle input`);
          continue;
        }

        const result = await step.agent.execute(agentContext);
        outputs.set(step.outputKey, result);
        executionPath.push(step.agentId);

        if (result.success) {
          context.data.set(step.outputKey, result.output);

          if (result.decision.type === "halt") {
            errors.push(`${step.agentId}: Halted - ${result.decision.reason}`);
            break;
          }

          if (result.decision.type === "escalate") {
            errors.push(`${step.agentId}: Escalated to ${result.decision.to}`);
            break;
          }
        } else {
          errors.push(`${step.agentId}: Failed - ${result.reasoning}`);

          if (result.decision.type === "retry") {
            // Could implement retry logic here
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`${step.agentId}: Exception - ${errorMsg}`);
      }
    }

    const lastStep = this.steps[this.steps.length - 1];
    const finalOutput = lastStep && outputs.has(lastStep.outputKey)
      ? outputs.get(lastStep.outputKey)!.output
      : {};

    return {
      success: errors.length === 0,
      outputs,
      finalOutput,
      executionPath,
      totalLatencyMs: Date.now() - startTime,
      errors
    };
  }
}

export interface ContentPipelineConfig {
  visionProvider?: AIProvider;
  writerProvider?: AIProvider;
  optimizerProvider?: AIProvider;
  schedulerProvider?: AIProvider;
  trendProvider?: AIProvider;
  strategy?: RoutingStrategy;
}

export function createContentPipeline(
  orchestrator: AIOrchestrator,
  config: ContentPipelineConfig = {}
): AgentWorkflow {
  const workflow = new AgentWorkflow(orchestrator);

  workflow
    .addStep({
      agentId: "vision",
      agent: new VisionAgent(config.visionProvider || orchestrator),
      inputMapper: (ctx) => ({
        videoUrl: ctx.data.get("videoUrl"),
        videoPath: ctx.data.get("videoPath"),
        assetId: ctx.assetId,
        title: ctx.data.get("title"),
        creatorName: ctx.data.get("creatorName"),
        creatorNiche: ctx.data.get("creatorNiche"),
        durationSeconds: ctx.data.get("durationSeconds")
      }),
      outputKey: "vision",
      condition: (ctx) => !!ctx.data.get("videoUrl") || !!ctx.data.get("videoPath")
    })
    .addStep({
      agentId: "writer",
      agent: new WriterAgent(config.writerProvider || orchestrator),
      inputMapper: (ctx) => ({
        visionResult: ctx.data.get("vision"),
        creatorName: ctx.data.get("creatorName"),
        creatorNiche: ctx.data.get("creatorNiche"),
        creatorBrandVoice: ctx.data.get("creatorBrandVoice"),
        platform: ctx.data.get("platform") || "youtube",
        variantCount: ctx.data.get("variantCount") || 3
      }),
      outputKey: "writer"
    })
    .addStep({
      agentId: "optimizer",
      agent: new OptimizerAgent(config.optimizerProvider || orchestrator),
      inputMapper: (ctx) => ({
        variants: (ctx.data.get("writer") as { variants?: unknown[] })?.variants,
        visionResult: ctx.data.get("vision"),
        creatorNiche: ctx.data.get("creatorNiche"),
        platform: ctx.data.get("platform") || "youtube",
        historicalPerformance: ctx.data.get("historicalPerformance")
      }),
      outputKey: "optimizer"
    })
    .addStep({
      agentId: "scheduler",
      agent: new SchedulerAgent(config.schedulerProvider || orchestrator),
      inputMapper: (ctx) => ({
        analytics: ctx.data.get("analytics"),
        timezone: ctx.data.get("timezone"),
        creatorName: ctx.data.get("creatorName"),
        creatorNiche: ctx.data.get("creatorNiche"),
        contentType: ctx.data.get("contentType"),
        targetAudience: ctx.data.get("targetAudience"),
        visionResult: ctx.data.get("vision")
      }),
      outputKey: "scheduler",
      condition: (ctx) => !!ctx.data.get("analytics")
    })
    .addStep({
      agentId: "trend",
      agent: new TrendAgent(config.trendProvider || orchestrator),
      inputMapper: (ctx) => ({
        visionResult: ctx.data.get("vision"),
        contentText: ctx.data.get("contentText"),
        creatorNiche: ctx.data.get("creatorNiche"),
        recentTrends: ctx.data.get("recentTrends"),
        competitorContent: ctx.data.get("competitorContent")
      }),
      outputKey: "trend"
    });

  return workflow;
}
