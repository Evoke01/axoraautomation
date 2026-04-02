import {
  adminLoginSchema,
  bookingInputSchema,
  bookingStatusSchema,
  businessCreateInputSchema,
  businessPresets,
  leadInputSchema,
  planCatalog,
  type Booking,
  type BookingInput,
  type BookingStatus,
  type Business,
  type BusinessCreateInput,
  type BusinessCreateResult,
  type BusinessIdentity,
  type BusinessType,
  type DashboardPayload,
  type JobType,
  type LeadInput,
  type MessageKind,
  type PublicConfig,
} from "@business-automation/shared";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { AppConfig } from "./config.js";
import type { EmailService } from "./email.js";
import type { PendingJob, Repository } from "./repository.js";
import type { Scheduler } from "./scheduler.js";

type HttpError = Error & { statusCode?: number };

function createHttpError(statusCode: number, message: string) {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  return error;
}

function slugify(value: string) {
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "business";
}

function generatePasscode(type: BusinessType) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = type === "salon" ? "SLN-" : "GYM-";
  const bytes = randomBytes(6);
  for (const byte of bytes) {
    code += alphabet[byte % alphabet.length];
  }
  return code;
}

function hashPasscode(passcode: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(passcode, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPasscode(passcode: string, storedHash: string) {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) {
    return false;
  }
  const derived = scryptSync(passcode, salt, 64);
  const stored = Buffer.from(hash, "hex");
  if (stored.length !== derived.length) {
    return false;
  }
  return timingSafeEqual(stored, derived);
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function startOfUtcWeek(date: Date) {
  const start = startOfUtcDay(date);
  const day = start.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setUTCDate(start.getUTCDate() + diff);
  return start;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export class BookingService {
  private scheduler: Scheduler | null = null;

  constructor(
    private readonly repository: Repository,
    private readonly emailService: EmailService,
    private readonly appConfig: AppConfig,
  ) {}

  attachScheduler(scheduler: Scheduler) {
    this.scheduler = scheduler;
  }

  async ensureSeedData() {
    return;
  }

  async createBusiness(rawInput: BusinessCreateInput): Promise<BusinessCreateResult> {
    const input = businessCreateInputSchema.parse(rawInput);
    const slug = await this.generateUniqueSlug(input.name);
    const generatedPasscode = generatePasscode(input.type);
    const business = await this.repository.insertBusiness({
      name: input.name,
      slug,
      type: input.type,
      adminPasscodeHash: hashPasscode(generatedPasscode),
      supportEmail: this.appConfig.SUPPORT_EMAIL,
      settings: structuredClone(businessPresets[input.type]),
      currentPlan: "starter",
    });

    const identity = this.toBusinessIdentity(business);
    return {
      business: identity,
      generatedPasscode,
      bookingLink: identity.bookingLink,
      leadLink: identity.leadLink,
      adminLink: identity.adminLink,
    };
  }

  async getPublicConfig(businessSlug: string): Promise<PublicConfig> {
    const business = await this.getBusinessOrThrow(businessSlug);
    return {
      business: this.toBusinessIdentity(business),
      plans: planCatalog,
    };
  }

  async createLead(businessSlug: string, rawInput: LeadInput) {
    const business = await this.getBusinessOrThrow(businessSlug);
    const input = leadInputSchema.parse(rawInput);
    return this.repository.insertLead({
      businessId: business.id,
      name: input.name,
      email: input.email,
      phone: input.phone,
      source: "public",
    });
  }

  async createBooking(businessSlug: string, rawInput: BookingInput) {
    const business = await this.getBusinessOrThrow(businessSlug);
    const input = bookingInputSchema.parse(rawInput);
    const serviceName = this.resolveServiceName(input.service, business);
    const matchedLead = await this.repository.findOpenLeadForConversion(business.id, input.email, input.phone);

    const booking = await this.repository.insertBooking({
      businessId: business.id,
      name: input.name,
      email: input.email,
      phone: input.phone,
      service: serviceName,
      scheduledAt: new Date(input.scheduledAt),
      source: matchedLead ? "lead" : "public",
    });

    if (matchedLead) {
      await this.repository.markLeadConverted(matchedLead.id, booking.id);
    }

    await this.sendAndLog("confirmation", booking, business);
    await this.scheduleReminder(booking, business);
    await this.scheduler?.notifyChange();
    return booking;
  }

  async loginBusinessAdmin(businessSlug: string, passcode: string) {
    const input = adminLoginSchema.parse({ passcode });
    const auth = await this.repository.getBusinessAuthBySlug(businessSlug);
    if (!auth || !verifyPasscode(input.passcode, auth.admin_passcode_hash)) {
      throw createHttpError(401, "Invalid admin passcode.");
    }

    return auth.slug;
  }

  async updateStatus(businessSlug: string, bookingId: string, statusInput: BookingStatus) {
    const business = await this.getBusinessOrThrow(businessSlug);
    const status = bookingStatusSchema.parse(statusInput);
    const booking = await this.repository.updateBookingStatus(business.id, bookingId, status);
    if (!booking) {
      return null;
    }

    if (status === "completed") {
      await this.scheduleFollowUp(booking, business);
      await this.scheduler?.notifyChange();
    }

    return booking;
  }

  async handleJob(job: Pick<PendingJob, "booking_id" | "business_id" | "type">) {
    const booking = await this.repository.getBookingById(job.booking_id);
    if (!booking) {
      return;
    }

    const business = await this.repository.getBusinessById(job.business_id);
    if (!business) {
      return;
    }

    switch (job.type) {
      case "reminder":
        if (booking.status === "cancelled" || booking.status === "no_show") {
          await this.logSkipped("reminder", booking, business, "Reminder skipped because booking is inactive.");
          return;
        }
        await this.sendAndLog("reminder", booking, business);
        return;
      case "follow_up":
        if (booking.status !== "completed") {
          await this.logSkipped("follow_up", booking, business, "Follow-up skipped because booking is not completed.");
          return;
        }
        await this.sendAndLog("follow_up", booking, business);
        await this.scheduleReengagement(booking, business);
        await this.scheduler?.notifyChange();
        return;
      case "reengagement":
        if (booking.status !== "completed") {
          await this.logSkipped("reengagement", booking, business, "Re-engagement skipped because booking is not completed.");
          return;
        }
        await this.sendAndLog("reengagement", booking, business);
        return;
      default:
        return;
    }
  }

  async getDashboard(businessSlug: string): Promise<DashboardPayload> {
    const business = await this.getBusinessOrThrow(businessSlug);
    const snapshot = await this.repository.getDashboardSnapshot(business.id);
    if (!snapshot) {
      throw createHttpError(404, "Business not found.");
    }

    const now = new Date();
    const todayStart = startOfUtcDay(now);
    const tomorrowStart = addDays(todayStart, 1);
    const weekStart = startOfUtcWeek(now);
    const nextWeekStart = addDays(weekStart, 7);

    const bookingsToday = snapshot.bookings.filter((booking) => {
      const scheduledAt = new Date(booking.scheduledAt);
      return scheduledAt >= todayStart && scheduledAt < tomorrowStart;
    }).length;

    const bookingsThisWeek = snapshot.bookings.filter((booking) => {
      const scheduledAt = new Date(booking.scheduledAt);
      return scheduledAt >= weekStart && scheduledAt < nextWeekStart;
    }).length;

    const noShows = snapshot.bookings.filter((booking) => booking.status === "no_show").length;
    const convertedLeads = snapshot.leads.filter((lead) => lead.convertedBookingId).length;
    const totalLeads = snapshot.leads.length;
    const conversionRate = totalLeads === 0 ? 0 : convertedLeads / totalLeads;

    return {
      business: this.toBusinessIdentity(snapshot.business),
      impact: {
        bookingsToday,
        bookingsThisWeek,
        noShows,
        conversionRate,
        conversionRateLabel: formatPercent(conversionRate),
      },
      leadSummary: {
        totalLeads,
        convertedLeads,
        openLeads: totalLeads - convertedLeads,
      },
      bookings: snapshot.bookings,
      activity: snapshot.activity,
      plans: snapshot.plans,
    };
  }

  private async generateUniqueSlug(name: string) {
    const base = slugify(name);
    let candidate = base;
    let counter = 2;

    while (await this.repository.slugExists(candidate)) {
      candidate = `${base}-${counter}`;
      counter += 1;
    }

    return candidate;
  }

  private async getBusinessOrThrow(businessSlug: string) {
    const business = await this.repository.getBusinessBySlug(businessSlug);
    if (!business) {
      throw createHttpError(404, "Business not found.");
    }
    return business;
  }

  private toBusinessIdentity(business: Business): BusinessIdentity {
    const baseUrl = this.appConfig.APP_BASE_URL.replace(/\/$/, "");
    return {
      id: business.id,
      name: business.name,
      slug: business.slug,
      type: business.type,
      currentPlan: business.currentPlan,
      supportEmail: business.supportEmail,
      services: [...business.settings.services],
      settings: business.settings,
      bookingLink: `${baseUrl}/book/${business.slug}`,
      leadLink: `${baseUrl}/lead/${business.slug}`,
      adminLink: `${baseUrl}/admin/${business.slug}`,
    };
  }

  private resolveServiceName(service: string, business: Business) {
    const match = business.settings.services.find(
      (candidate) => candidate.toLowerCase() === service.trim().toLowerCase(),
    );

    if (!match) {
      throw createHttpError(400, `Service "${service}" is not available for ${business.name}.`);
    }

    return match;
  }

  private async scheduleReminder(booking: Booking, business: Business) {
    const reminderAt = addHours(new Date(booking.scheduledAt), -business.settings.reminderHours);
    if (reminderAt.getTime() <= Date.now()) {
      return;
    }

    await this.repository.ensurePendingJob(business.id, booking.id, "reminder", reminderAt);
  }

  private async scheduleFollowUp(booking: Booking, business: Business) {
    const start = booking.completedAt ? new Date(booking.completedAt) : new Date();
    const runAt = addHours(start, business.settings.followUpHours);
    await this.repository.ensurePendingJob(business.id, booking.id, "follow_up", runAt);
  }

  private async scheduleReengagement(booking: Booking, business: Business) {
    const runAt = addDays(new Date(), business.settings.reengagementDays);
    await this.repository.ensurePendingJob(business.id, booking.id, "reengagement", runAt);
  }

  private async sendAndLog(kind: MessageKind, booking: Booking, business: Business) {
    const delivery = await this.emailService.send(kind, booking, {
      businessName: business.name,
      businessType: business.type,
    });
    await this.repository.upsertMessageLog({
      businessId: business.id,
      bookingId: booking.id,
      kind,
      deliveryMode: delivery.deliveryMode,
      status: delivery.status,
      subject: delivery.subject,
      toEmail: booking.email,
      sentAt: delivery.status === "sent" ? new Date() : null,
      providerMessageId: delivery.providerMessageId ?? null,
      error: delivery.error ?? null,
    });
  }

  private async logSkipped(kind: MessageKind, booking: Booking, business: Business, reason: string) {
    await this.repository.upsertMessageLog({
      businessId: business.id,
      bookingId: booking.id,
      kind,
      deliveryMode: this.appConfig.EMAIL_MODE,
      status: "skipped",
      subject: `${business.name} skipped ${kind.replace("_", " ")}`,
      toEmail: booking.email,
      sentAt: null,
      error: reason,
    });
  }
}
