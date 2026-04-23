import type { FastifyInstance } from "fastify";

import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { Queue } from "bullmq";
import Fastify from "fastify";
import { Redis } from "ioredis";

import { InstagramAdapter } from "./adapters/instagram-adapter.js";
import { TikTokAdapter } from "./adapters/tiktok-adapter.js";
import { YouTubeAdapter } from "./adapters/youtube-adapter.js";
import { env } from "./config/env.js";
import { prisma } from "./db.js";
import { AppError } from "./lib/errors.js";
import { loggerOptions } from "./lib/logger.js";
import { StorageService } from "./lib/storage.js";
import { QUEUE_NAME } from "./queues/names.js";
import { createWorker, registerRecurringJobs } from "./queues/runtime.js";
import { registerApiRoutes } from "./routes/api.js";
import { AssetService } from "./services/asset-service.js";
import { AssetValidationService } from "./services/asset-validation-service.js";
import { IntelligenceService } from "./services/intelligence-service.js";
import { AuditService } from "./services/audit-service.js";
import { AuthService } from "./services/auth-service.js";
import { CampaignService } from "./services/campaign-service.js";
import { ConnectionService } from "./services/connection-service.js";
import { DashboardService } from "./services/dashboard-service.js";
import { LearningService } from "./services/learning-service.js";
import { MetadataService } from "./services/metadata-service.js";
import { MultiAgentService } from "./services/multi-agent-service.js";
import { OptimizationService } from "./services/optimization-service.js";
import { StoragePurgeService } from "./services/storage-purge-service.js";
import { QuotaService } from "./services/quota-service.js";
import { UploadService } from "./services/upload-service.js";
import { YouTubeHistoryService } from "./services/youtube-history-service.js";
import { createCascadeAI } from "./ai/factory.js";

export type AppServices = {
  env: typeof env;
  prisma: typeof prisma;
  redis: Redis;
  queue: Queue;
  storage: StorageService;
  audit: AuditService;
  auth: AuthService;
  uploads: UploadService;
  assets: AssetService;
  validation: AssetValidationService;
  agents: MultiAgentService;
  intelligence: IntelligenceService;
  metadata: MetadataService;
  quota: QuotaService;
  purge: StoragePurgeService;
  campaigns: CampaignService;
  optimization: OptimizationService;
  dashboard: DashboardService;
  learning: LearningService;
  connections: ConnectionService;
  youtube: YouTubeAdapter;
  instagram: InstagramAdapter;
  tiktok: TikTokAdapter;
  youtubeHistory: YouTubeHistoryService;
};

export async function buildApp(): Promise<FastifyInstance & { services: AppServices }> {
  const app = Fastify({ logger: loggerOptions as NonNullable<typeof loggerOptions> });

  const redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null
  });

  const queue = new Queue(QUEUE_NAME, {
    connection: redis
  });

  const storage = new StorageService();
  const audit = new AuditService(prisma);
  const auth = new AuthService(prisma);
  const uploads = new UploadService(prisma, storage);
  const assets = new AssetService(prisma, queue, audit);
  const validation = new AssetValidationService(prisma, storage, audit);
  const aiOrchestrator = createCascadeAI();
  const agents = new MultiAgentService(prisma, aiOrchestrator);
  const intelligence = new IntelligenceService(prisma, storage, agents);
  const metadata = new MetadataService(prisma, agents);
  const quota = new QuotaService(prisma);
  const purge = new StoragePurgeService(prisma, storage);
  const campaigns = new CampaignService(prisma, queue, audit, agents);
  const optimization = new OptimizationService(prisma);
  const dashboard = new DashboardService(prisma);
  const connections = new ConnectionService(prisma, audit);
  const youtube = new YouTubeAdapter(prisma, storage, audit);
  const learning = new LearningService(prisma, youtube);
  const youtubeHistory = new YouTubeHistoryService(prisma, queue, youtube);
  const instagram = new InstagramAdapter(prisma, audit);
  const tiktok = new TikTokAdapter(prisma, audit);

  app.decorate("services", {
    env,
    prisma,
    redis,
    queue,
    storage,
    audit,
    auth,
    uploads,
    assets,
    validation,
    agents,
    intelligence,
    metadata,
    quota,
    purge,
    campaigns,
    optimization,
    dashboard,
    learning,
    connections,
    youtube,
    youtubeHistory,
    instagram,
    tiktok
  });

  const corsOrigins: (string | RegExp)[] = [
    /^http:\/\/localhost(:\d+)?$/   // always allow localhost dev
  ];
  if (env.FRONTEND_APP_URL) {
    corsOrigins.push(env.FRONTEND_APP_URL.replace(/\/+$/, "")); // strip trailing slash
  }

  await app.register(cors, {
    origin: corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: ["X-Total-Count"]
  });
  await app.register(sensible);
  await registerApiRoutes(app);

  await registerRecurringJobs(app.services);
  const worker = createWorker(app.services);

  app.setErrorHandler((error: any, request, reply) => {
    request.log.error({
      err: error,
      msg: error?.message,
      stack: error?.stack,
      url: request.url,
      method: request.method
    }, "Unhandled exception occurred");

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: error.code,
        message: error.message,
        details: error.details
      });
    }

    return reply.status(500).send({
      error: "internal_error",
      message: "Internal server error.",
      ...(env.NODE_ENV === "development" ? { details: error?.message, stack: error?.stack } : {})
    });
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "axora-backend",
    environment: env.NODE_ENV
  }));

  app.addHook("onClose", async () => {
    await worker.close();
    await queue.close();
    await redis.quit();
    await prisma.$disconnect();
  });

  return app as FastifyInstance & { services: AppServices };
}
