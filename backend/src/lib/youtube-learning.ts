import type { PerformanceCheckpointKey } from "@prisma/client";

export const PERFORMANCE_CHECKPOINT_KEYS = ["H24", "H72", "D7", "D30"] as const satisfies PerformanceCheckpointKey[];

const CHECKPOINT_OFFSET_MS: Record<PerformanceCheckpointKey, number> = {
  H24: 24 * 60 * 60 * 1000,
  H72: 72 * 60 * 60 * 1000,
  D7: 7 * 24 * 60 * 60 * 1000,
  D30: 30 * 24 * 60 * 60 * 1000
};

export function getCheckpointOffsetMs(checkpointKey: PerformanceCheckpointKey) {
  return CHECKPOINT_OFFSET_MS[checkpointKey];
}

export function getCheckpointTargetAt(publishedAt: Date, checkpointKey: PerformanceCheckpointKey) {
  return new Date(publishedAt.getTime() + getCheckpointOffsetMs(checkpointKey));
}

export function getCheckpointDeadlineAt(publishedAt: Date, checkpointKey: PerformanceCheckpointKey) {
  return new Date(getCheckpointTargetAt(publishedAt, checkpointKey).getTime() + 24 * 60 * 60 * 1000);
}

export function getCheckpointRetryDelayMs(dueAt: Date, now = new Date()) {
  const lateByMs = Math.max(0, now.getTime() - dueAt.getTime());

  if (lateByMs < 2 * 60 * 60 * 1000) {
    return 15 * 60 * 1000;
  }

  if (lateByMs < 8 * 60 * 60 * 1000) {
    return 60 * 60 * 1000;
  }

  return 3 * 60 * 60 * 1000;
}
