import { subDays } from "date-fns";
import { Prisma, type PrismaClient } from "@prisma/client";
import { AuditActorType, AuditTargetType } from "@prisma/client";

export class AuditService {
  constructor(private readonly prisma: PrismaClient) {}

  async log(input: {
    workspaceId?: string;
    assetId?: string;
    actorType?: AuditActorType;
    actorId?: string;
    eventType: string;
    targetType: AuditTargetType;
    targetId: string;
    payload?: Record<string, unknown>;
  }) {
    await this.prisma.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        assetId: input.assetId,
        actorType: input.actorType ?? AuditActorType.SYSTEM,
        actorId: input.actorId,
        eventType: input.eventType,
        targetType: input.targetType,
        targetId: input.targetId,
        payload: (input.payload ?? {}) as Prisma.InputJsonValue
      }
    });
  }

  async purgeExpired(retentionDays = 30) {
    const cutoff = subDays(new Date(), retentionDays);
    return this.prisma.auditLog.deleteMany({
      where: {
        createdAt: {
          lt: cutoff
        }
      }
    });
  }
}
