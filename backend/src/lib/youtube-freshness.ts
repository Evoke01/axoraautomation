const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

export function getFreshnessMinutes(date: Date | string | null | undefined, now = new Date()) {
  if (!date) {
    return null;
  }

  const parsed = typeof date === "string" ? new Date(date) : date;
  const diffMs = now.getTime() - parsed.getTime();
  if (Number.isNaN(diffMs)) {
    return null;
  }

  return Math.max(0, Math.floor(diffMs / 60_000));
}

export function getNextYouTubePostMetricDelayMinutes(publishedAt: Date | null | undefined, now = new Date()) {
  if (!publishedAt) {
    return 5;
  }

  const ageMinutes = Math.max(0, (now.getTime() - publishedAt.getTime()) / 60_000);

  if (ageMinutes < 2 * MINUTES_PER_HOUR) {
    return 5;
  }

  if (ageMinutes < MINUTES_PER_DAY) {
    return 15;
  }

  if (ageMinutes < 7 * MINUTES_PER_DAY) {
    return 60;
  }

  if (ageMinutes < 30 * MINUTES_PER_DAY) {
    return MINUTES_PER_DAY;
  }

  return null;
}

export function isFreshWithin(date: Date | string | null | undefined, maxMinutes: number, now = new Date()) {
  const freshnessMinutes = getFreshnessMinutes(date, now);
  return freshnessMinutes !== null && freshnessMinutes <= maxMinutes;
}
