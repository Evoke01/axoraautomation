import { endOfWeek, startOfWeek, subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

export function getPacificQuotaDate(date = new Date()): string {
  return formatInTimeZone(date, "America/Los_Angeles", "yyyy-MM-dd");
}

export function isWeeklyReportWindow(date: Date, timezone: string, hour: number): boolean {
  const weekday = formatInTimeZone(date, timezone, "i");
  const currentHour = Number(formatInTimeZone(date, timezone, "H"));
  return weekday === "1" && currentHour === hour;
}

export function getWeeklyWindow(date: Date, timezone: string): { start: Date; end: Date } {
  const localDate = new Date(formatInTimeZone(date, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX"));
  const end = endOfWeek(subDays(localDate, 1), { weekStartsOn: 1 });
  const start = startOfWeek(subDays(localDate, 1), { weekStartsOn: 1 });
  return { start, end };
}

export function minutesFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}

export function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

export function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
