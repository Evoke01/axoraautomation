import type { FastifyInstance } from "fastify";

import { z } from "zod";

import { buildOAuthRedirect } from "../lib/oauth-redirect.js";
import { AuthError, ValidationError } from "../lib/errors.js";
import {
  createAssetSchema,
  overrideAssetSchema,
  uploadCompleteSchema,
  uploadInitSchema,
  uploadPartUrlSchema
} from "../types/domain.js";

export async function registerApiRoutes(app: FastifyInstance) {
  app.post("/auth/session/resolve", async (request) => {
    const session = await app.services.auth.resolveSession(request.headers);
    return {
      user: session.user,
      workspace: session.workspace,
      creator: session.creator,
      entitlements: session.entitlements
    };
  });

  app.get("/connections", async (request) => {
    const session = await app.services.auth.resolveSession(request.headers);
    return app.services.connections.list(session.workspace.id);
  });

  app.post("/connections/youtube/start", async (request) => {
    const session = await app.services.auth.resolveSession(request.headers);
    const url = await app.services.youtube.getAuthorizationUrl(session.workspace.id);
    return { url };
  });

  app.get("/connections/youtube/callback", async (request, reply) => {
    try {
      const query = parseOAuthCallbackQuery(request.query);
      assertNoOAuthError(query, "youtube");
      const state = requireOAuthField(query.state, "state");
      const code = requireOAuthField(query.code, "code");

      const account = await app.services.youtube.handleCallback(state, code);
      return respondToOAuthCallback(reply, app.services.env.FRONTEND_APP_URL, "youtube", {
        connected: true,
        account
      });
    } catch (error) {
      return respondToOAuthError(reply, app.services.env.FRONTEND_APP_URL, "youtube", error);
    }
  });

  app.post("/connections/instagram/start", async (request) => {
    const session = await app.services.auth.resolveSession(request.headers);
    const url = await app.services.instagram.getAuthorizationUrl(session.workspace.id);
    return { url };
  });

  app.get("/connections/instagram/callback", async (request, reply) => {
    try {
      const query = parseOAuthCallbackQuery(request.query);
      assertNoOAuthError(query, "instagram");
      const state = requireOAuthField(query.state, "state");
      const code = requireOAuthField(query.code, "code");

      const account = await app.services.instagram.handleCallback(state, code);
      return respondToOAuthCallback(reply, app.services.env.FRONTEND_APP_URL, "instagram", {
        connected: true,
        account
      });
    } catch (error) {
      return respondToOAuthError(reply, app.services.env.FRONTEND_APP_URL, "instagram", error);
    }
  });

  app.post("/connections/tiktok/start", async (request) => {
    const session = await app.services.auth.resolveSession(request.headers);
    const url = await app.services.tiktok.getAuthorizationUrl(session.workspace.id);
    return { url };
  });

  app.get("/connections/tiktok/callback", async (request, reply) => {
    try {
      const query = parseOAuthCallbackQuery(request.query);
      assertNoOAuthError(query, "tiktok");
      const state = requireOAuthField(query.state, "state");
      const code = requireOAuthField(query.code, "code");

      const account = await app.services.tiktok.handleCallback(state, code);
      return respondToOAuthCallback(reply, app.services.env.FRONTEND_APP_URL, "tiktok", {
        connected: true,
        account
      });
    } catch (error) {
      return respondToOAuthError(reply, app.services.env.FRONTEND_APP_URL, "tiktok", error);
    }
  });

  app.post("/connections/:id/disconnect", async (request) => {
    const session = await app.services.auth.resolveSession(request.headers);
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const account = await app.services.connections.disconnect(params.id, session.user.id);
    return { disconnected: Boolean(account), account };
  });

  app.post("/uploads/multipart/init", async (request) => {
    await app.services.auth.resolveSession(request.headers);
    const body = uploadInitSchema.parse(request.body);
    return app.services.uploads.initMultipartUpload(body);
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

const oauthCallbackQuerySchema = z.object({
  state: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
  error_description: z.string().min(1).optional()
});

function parseOAuthCallbackQuery(query: unknown) {
  return oauthCallbackQuerySchema.parse(query);
}

function assertNoOAuthError(
  query: z.infer<typeof oauthCallbackQuerySchema>,
  platform: string
) {
  if (query.error) {
    throw new AuthError(
      `${platform} OAuth failed: ${query.error_description ?? query.error}`
    );
  }
}

function requireOAuthField(value: string | undefined, field: string) {
  if (!value) {
    throw new ValidationError(`OAuth callback is missing "${field}".`);
  }

  return value;
}

function respondToOAuthCallback(
  reply: { redirect: (url: string) => unknown },
  frontendUrl: string | undefined,
  platform: string,
  payload: Record<string, unknown>
) {
  if (frontendUrl) {
    return reply.redirect(buildOAuthRedirect(frontendUrl, platform, "success"));
  }

  return payload;
}

function respondToOAuthError(
  reply: { redirect: (url: string) => unknown },
  frontendUrl: string | undefined,
  platform: string,
  error: unknown
) {
  if (frontendUrl) {
    const message = error instanceof Error ? error.message : "OAuth callback failed.";
    return reply.redirect(buildOAuthRedirect(frontendUrl, platform, "error", message));
  }

  throw error;
}
