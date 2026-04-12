import { type PrismaClient } from "@prisma/client";

export class DashboardService {
  constructor(private readonly prisma: PrismaClient) {}

  async getSummary(workspaceId: string) {
    const [assets, publishedPosts, pendingReview, latestReport] = await Promise.all([
      this.prisma.asset.count({ where: { workspaceId } }),
      this.prisma.platformPost.count({ where: { workspaceId, status: "PUBLISHED" } }),
      this.prisma.asset.count({ where: { workspaceId, status: "PENDING_REVIEW" } }),
      this.prisma.opportunityReport.findFirst({
        where: { workspaceId },
        orderBy: { generatedAt: "desc" }
      })
    ]);

    return {
      assets,
      publishedPosts,
      pendingReview,
      latestOpportunityReportAt: latestReport?.generatedAt ?? null
    };
  }

  async listPosts(workspaceId: string) {
    return this.prisma.platformPost.findMany({
      where: { workspaceId },
      include: {
        asset: true,
        decision: true,
        connectedAccount: true,
        snapshots: {
          orderBy: { capturedAt: "desc" },
          take: 1
        }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  async latestOpportunityReport(workspaceId: string) {
    return this.prisma.opportunityReport.findFirst({
      where: { workspaceId },
      orderBy: { generatedAt: "desc" }
    });
  }

  async getAccountHealth(workspaceId: string) {
    return this.prisma.connectedAccount.findMany({
      where: { workspaceId },
      include: {
        healthEvents: {
          orderBy: { createdAt: "desc" },
          take: 5
        }
      },
      orderBy: { createdAt: "asc" }
    });
  }
}
