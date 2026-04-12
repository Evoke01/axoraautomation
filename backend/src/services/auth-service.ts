import type { IncomingHttpHeaders } from "node:http";

import { MembershipRole, PlanTier, type PrismaClient } from "@prisma/client";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

import { env } from "../config/env.js";
import { AuthError } from "../lib/errors.js";

type ResolvedIdentity = {
  externalId: string;
  email?: string;
  name?: string;
};

export class AuthService {
  private readonly jwks = env.AUTH_JWKS_URL ? createRemoteJWKSet(new URL(env.AUTH_JWKS_URL)) : null;

  constructor(private readonly prisma: PrismaClient) {}

  private async resolveIdentity(headers: IncomingHttpHeaders): Promise<ResolvedIdentity> {
    const authorization = headers.authorization;

    if (authorization?.startsWith("Bearer ") && this.jwks) {
      const token = authorization.slice("Bearer ".length);
      const verified = await jwtVerify(token, this.jwks, {
        issuer: env.AUTH_ISSUER,
        audience: env.AUTH_AUDIENCE
      });

      return this.mapJwtPayload(verified.payload);
    }

    if (env.DEV_AUTH_BYPASS) {
      const externalId = headerValue(headers["x-dev-user-id"]) ?? "dev-user";
      return {
        externalId,
        email: headerValue(headers["x-dev-email"]) ?? `${externalId}@axora.local`,
        name: headerValue(headers["x-dev-name"]) ?? "Axora Dev User"
      };
    }

    throw new AuthError("Missing valid session.");
  }

  private mapJwtPayload(payload: JWTPayload): ResolvedIdentity {
    const externalId = payload.sub;

    if (!externalId) {
      throw new AuthError("Session token does not contain a subject.");
    }

    return {
      externalId,
      email: typeof payload.email === "string" ? payload.email : undefined,
      name: typeof payload.name === "string" ? payload.name : undefined
    };
  }

  async resolveSession(headers: IncomingHttpHeaders) {
    const identity = await this.resolveIdentity(headers);

    const user = await this.prisma.user.upsert({
      where: { externalId: identity.externalId },
      update: {
        email: identity.email,
        name: identity.name
      },
      create: {
        externalId: identity.externalId,
        email: identity.email,
        name: identity.name
      }
    });

    let workspace = await this.prisma.workspace.findFirst({
      orderBy: { createdAt: "asc" },
      include: {
        entitlements: true,
        creators: {
          take: 1,
          orderBy: { createdAt: "asc" }
        }
      }
    });

    if (!workspace) {
      workspace = await this.prisma.workspace.create({
        data: {
          name: "Axora Workspace",
          timezone: env.WORKSPACE_TIMEZONE,
          entitlements: {
            create: {
              plan: PlanTier.FREE,
              connectedPlatformLimit: 1,
              autoPublishEnabled: false,
              manualReviewRequired: true
            }
          },
          creators: {
            create: {
              name: identity.name ? `${identity.name}'s Channel` : "Primary Creator"
            }
          }
        },
        include: {
          entitlements: true,
          creators: {
            take: 1,
            orderBy: { createdAt: "asc" }
          }
        }
      });
    }

    await this.prisma.membership.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: workspace.id,
          userId: user.id
        }
      },
      update: {},
      create: {
        workspaceId: workspace.id,
        userId: user.id,
        role: MembershipRole.OWNER
      }
    });

    return {
      user,
      workspace,
      creator: workspace.creators[0] ?? null,
      entitlements: workspace.entitlements
    };
  }
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
