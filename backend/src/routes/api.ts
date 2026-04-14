import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createAssetSchema,
  overrideAssetSchema,
  uploadCompleteSchema,
  uploadInitSchema,
  uploadPartUrlSchema
} from "../types/domain.js";

export async function registerApiRoutes(app: FastifyInstance) {
  // Allow empty JSON bodies (e.g. POST with no payload)
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (!body || body === '') { done(null, {}); return; }
    try { done(null, JSON.parse(body as string)); } catch (e) { done(e as Error, undefined); }
  });

  // AUTH
  app.post("/auth/session/resolve", async (request) => {
    const session = await app.services.auth.resolveSession(request.headers);
    return { user: session.user, workspace: session.workspace, creator: session.creator, entitlements: session.entitlements };
  });

  // CONNECTIONS - list all for workspace
  app.get("/connections", async (request) => {
    const session = await app.services.auth.resolveSession(request.headers);
    const accounts = await app.services.prisma.connectedAccount.findMany({
      where: { workspaceId: session.workspace.id },
      orderBy: { createdAt: "asc" }
    });

    const PLATFORM_META: Record<string, { label: string; note: string; connectable: boolean }> = {
      YOUTUBE:   { label: "YouTube",   note: "Ready for channel OAuth, uploads, and metrics polling.", connectable: true },
      INSTAGRAM: { label: "Instagram", note: "Missing OAuth credentials in the backend environment.", connectable: false },
      TIKTOK:    { label: "TikTok",    note: "Content Posting API access required.", connectable: false },
      LINKEDIN:  { label: "LinkedIn",  note: "Video posting requires allowlist approval.", connectable: false },
      X:         { label: "X (Twitter)", note: "Posting requires paid API tier.", connectable: false },
    };

    const allPlatforms = ["YOUTUBE", "INSTAGRAM", "TIKTOK", "LINKEDIN", "X"];

    return allPlatforms.map((platform) => {
      const meta = PLATFORM_META[platform]!;
      const platformAccounts = accounts.filter(a => a.platform === platform);
      const connected = platformAccounts.some(a => a.status === "ACTIVE");
      return {
        platform,
        label: meta.label,
        note: meta.note,
        connectable: meta.connectable,
        connected,
        accounts: platformAccounts.map(a => ({
          id: a.id,
          accountLabel: a.accountLabel,
          status: a.status,
          externalAccountId: a.externalAccountId,
          tokenExpiresAt: a.tokenExpiresAt
        }))
      };
    });
  });

  // CONNECTIONS - disconnect
  app.delete("/connections/:id", async (request) => {
    const session = await app.services.auth.resolveSession(request.headers);
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const account = await app.services.prisma.connectedAccount.findUnique({ where: { id: params.id } });
    if (!account || account.workspaceId !== session.workspace.id) {
      return { disconnected: false, error: "Account not found." };
    }
    await app.services.prisma.connectedAccount.update({
      where: { id: params.id },
      data: { status: "DISCONNECTED", accessTokenEncrypted: null, refreshTokenEncrypted: null }
    });
    return { disconnected: true };
  });

  // YOUTUBE OAUTH
  app.post("/connections/youtube/start", async (request) => {
    const session = await app.services.auth.resolveSession(request.headers);
    const url = await app.services.youtube.getAuthorizationUrl(session.workspace.id);
    return { url };
  });

  app.get("/connections/youtube/callback", async (request, reply) => {
    const frontendUrl = app.services.env.FRONTEND_APP_URL ?? "http://localhost:5173";
    try {
      const query = z.object({ state: z.string().min(1), code: z.string().min(1) }).parse(request.query);
      await app.services.youtube.handleCallback(query.state, query.code);
      return reply.redirect(${frontendUrl}?view=settings&oauthPlatform=youtube&oauthStatus=success);
    } catch (err) {
      request.log.error(err);
      return reply.redirect(${frontendUrl}?view=settings&oauthPlatform=youtube&oauthStatus=error);
    }
  });

  // UPLOADS
  app.post("/uploads/multipart/init", async (request) => {
    await app.services.auth.resolveSession(request.headers);
    const body = uploadInitSchema.parse(request.body);
    const session = await app.services.uploads.initMultipartUpload(body);
    return {
      uploadSessionId: session.id,
      uploadId: session.multipartUploadId,
      objectKey: session.objectKey,
    };
  });

  app.post("/uploads/multipart/part-url", async (request) => {
    await app.services.auth.resolveSession(request.headers);
    const body = uploadPartUrlSchema.parse(request.body);
    return app.services.uploads.getPartUrl(body);
  });

  app.post("/uploads/multipart/complete", async (request) => {
    await app.services.auth.resolveSession(request.headers);
    const body = uploadCompleteSchema.parse(request.body);
    return app.services.uploads.completeMultipartUpload(body);
  });

  // ASSETS
  app.get("/assets", async (request) => {
    const session = await app.services.auth.resolveSession(request.headers);
    return app.services.dashboard.listAssets(session.workspace.id);
  });

  app.post("/assets", async (request) => {
    await app.services.auth.resolveSession(request.headers);
    const body = createAssetSchema.parse(request.body);
    return app.services.assets.createAsset(body);
  });

  app.get("/assets/:id", async (request) => {
    await app.services.auth.resolveSession(request.headers);
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    return app.services.assets.getAsset(params.id);
  });

  app.post("/assets/:id/plan", async (request) => {
    await app.services.auth.resolveSession(request.headers);
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    await app.services.assets.queuePlan(params.id);
    return { queued: true };
  });

  app.post("/assets/:id/approve", async (request) => {
    const session = await app.services.auth.resolveSession(request.headers);
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    await app.services.campaigns.approveAsset(params.id, session.user.id);
    return { approved: true };
  });

  app.post("/assets/:id/override", async (request) => {
    const session = await app.services.auth.resolveSession(request.headers);
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = overrideAssetSchema.parse(request.body);
    await app.services.assets.recordOverride(params.id, body, session.user.id);
    return { updated: true };
  });

  // POSTS & DASHBOARD
  app.get("/posts", async (request) => {
    const session = await app.services.auth.resolveSession(request.headers);
    return app.services.dashboard.listPosts(session.workspace.id);
  });

  app.get("/dashboard/summary", async (request) => {
    const session = await app.services.auth.resolveSession(request.headers);
    return app.services.dashboard.getSummary(session.workspace.id);
  });

  app.get("/intelligence/weekly", async (request) => {
    const session = await app.services.auth.resolveSession(request.headers);
    return app.services.dashboard.latestOpportunityReport(session.workspace.id);
  });

  app.get("/health/accounts", async (request) => {
    const session = await app.services.auth.resolveSession(request.headers);
    return app.services.dashboard.getAccountHealth(session.workspace.id);
  });
}





