import { bookingInputSchema, demoBusiness, type Booking, type BookingInput, type BookingStatus, type JobType, type MessageKind } from "@business-automation/shared";
import type { AppConfig } from "./config.js";
import type { EmailService } from "./email.js";
import type { Repository } from "./repository.js";
import type { Scheduler } from "./scheduler.js";

type BookingSource = "live" | "demo" | "seed";

export class BookingService {
  private scheduler: Scheduler | null = null;

  constructor(
    private readonly repository: Repository,
    private readonly emailService: EmailService,
    private readonly appConfig: AppConfig
  ) {}

  attachScheduler(scheduler: Scheduler) {
    this.scheduler = scheduler;
  }

  async ensureSeedData() {
    const current = await this.repository.listBookings();
    if (current.length === 0) {
      await this.seedDemoData();
    }
  }

  async seedDemoData() {
    await this.repository.clearAllData();

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    tomorrow.setUTCHours(10, 30, 0, 0);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    yesterday.setUTCHours(12, 0, 0, 0);
    const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    lastWeek.setUTCHours(15, 30, 0, 0);

    const confirmed = await this.repository.insertBooking({
      name: "Alicia Brown",
      email: "alicia@example.com",
      phone: "+91 98765 43210",
      service: "haircut",
      scheduledAt: tomorrow,
      source: "seed"
    });

    const completed = await this.repository.insertBooking({
      name: "Mira Kapoor",
      email: "mira@example.com",
      phone: "+91 99887 66554",
      service: "facial",
      scheduledAt: yesterday,
      source: "seed",
      status: "completed"
    });

    const noShow = await this.repository.insertBooking({
      name: "Jordan Lee",
      email: "jordan@example.com",
      phone: "+91 90011 22334",
      service: "haircut",
      scheduledAt: lastWeek,
      source: "seed",
      status: "no_show"
    });

    await this.repository.upsertMessageLog({
      bookingId: confirmed.id,
      kind: "confirmation",
      deliveryMode: "demo",
      status: "sent",
      subject: "haircut booked at Demo Salon",
      toEmail: confirmed.email,
      sentAt: new Date(),
      providerMessageId: "seed-confirmed"
    });

    await this.repository.upsertMessageLog({
      bookingId: completed.id,
      kind: "follow_up",
      deliveryMode: "demo",
      status: "sent",
      subject: "How was your facial at Demo Salon?",
      toEmail: completed.email,
      sentAt: new Date(),
      providerMessageId: "seed-follow-up"
    });

    await this.repository.upsertMessageLog({
      bookingId: noShow.id,
      kind: "confirmation",
      deliveryMode: "demo",
      status: "sent",
      subject: "haircut booked at Demo Salon",
      toEmail: noShow.email,
      sentAt: new Date(),
      providerMessageId: "seed-no-show"
    });

    await this.scheduler?.notifyChange();
  }

  async createBooking(rawInput: BookingInput, source: BookingSource = "live") {
    const input = bookingInputSchema.parse(rawInput);
    const booking = await this.repository.insertBooking({
      name: input.name,
      email: input.email,
      phone: input.phone,
      service: input.service,
      scheduledAt: new Date(input.scheduledAt),
      source
    });

    await this.sendAndLog("confirmation", booking);
    await this.scheduleInitialJobs(booking.id, booking.scheduledAt, source);
    await this.scheduler?.notifyChange();
    return booking;
  }

  async updateStatus(bookingId: string, status: BookingStatus) {
    const booking = await this.repository.updateBookingStatus(bookingId, status);
    if (!booking) {
      return null;
    }

    if (status === "completed") {
      await this.scheduleFollowUp(booking.id, booking.source);
      await this.scheduler?.notifyChange();
    }

    return booking;
  }

  async runDemoFlow() {
    return this.createBooking(
      {
        name: "Maya Patel",
        email: "maya.demo@example.com",
        phone: "+91 98989 45454",
        service: "facial",
        scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
      },
      "demo"
    );
  }

  async handleJob(job: { booking_id: string; type: JobType }) {
    const booking = await this.repository.getBookingById(job.booking_id);
    if (!booking) {
      return;
    }

    switch (job.type) {
      case "reminder":
        if (booking.status === "cancelled" || booking.status === "no_show") {
          await this.logSkipped("reminder", booking.id, booking.email, "Reminder skipped because booking is inactive.");
          return;
        }
        await this.sendAndLog("reminder", booking);
        return;
      case "demo_complete":
        if (booking.status === "confirmed") {
          await this.updateStatus(booking.id, "completed");
        }
        return;
      case "follow_up":
        if (booking.status !== "completed") {
          await this.logSkipped("follow_up", booking.id, booking.email, "Follow-up skipped because booking is not completed.");
          return;
        }
        await this.sendAndLog("follow_up", booking);
        await this.scheduleReengagement(booking.id, booking.source);
        await this.scheduler?.notifyChange();
        return;
      case "reengagement":
        if (booking.status !== "completed") {
          await this.logSkipped("reengagement", booking.id, booking.email, "Re-engagement skipped because booking is not completed.");
          return;
        }
        await this.sendAndLog("reengagement", booking);
        return;
      default:
        return;
    }
  }

  async getDashboard() {
    return this.repository.getDashboardPayload();
  }

  private async scheduleInitialJobs(bookingId: string, scheduledAt: string, source: BookingSource) {
    const now = Date.now();
    const reminderAt = source === "demo"
      ? new Date(now + this.appConfig.DEMO_REMINDER_MS)
      : new Date(new Date(scheduledAt).getTime() - this.appConfig.LIVE_REMINDER_HOURS * 60 * 60 * 1000);

    if (reminderAt.getTime() > now) {
      await this.repository.ensurePendingJob(bookingId, "reminder", reminderAt);
    }

    if (source === "demo") {
      await this.repository.ensurePendingJob(bookingId, "demo_complete", new Date(now + this.appConfig.DEMO_AUTO_COMPLETE_MS));
    }
  }

  private async scheduleFollowUp(bookingId: string, source: BookingSource) {
    const delayMs = source === "demo"
      ? this.appConfig.DEMO_FOLLOW_UP_MS
      : this.appConfig.LIVE_FOLLOW_UP_HOURS * 60 * 60 * 1000;
    await this.repository.ensurePendingJob(bookingId, "follow_up", new Date(Date.now() + delayMs));
  }

  private async scheduleReengagement(bookingId: string, source: BookingSource) {
    const delayMs = source === "demo"
      ? this.appConfig.DEMO_REENGAGEMENT_MS
      : this.appConfig.LIVE_REENGAGEMENT_DAYS * 24 * 60 * 60 * 1000;
    await this.repository.ensurePendingJob(bookingId, "reengagement", new Date(Date.now() + delayMs));
  }

  private async sendAndLog(kind: MessageKind, booking: Booking) {
    const delivery = await this.emailService.send(kind, booking);
    await this.repository.upsertMessageLog({
      bookingId: booking.id,
      kind,
      deliveryMode: delivery.deliveryMode,
      status: delivery.status,
      subject: delivery.subject,
      toEmail: booking.email,
      sentAt: delivery.status === "sent" ? new Date() : null,
      providerMessageId: delivery.providerMessageId ?? null,
      error: delivery.error ?? null
    });
  }

  private async logSkipped(kind: MessageKind, bookingId: string, toEmail: string, reason: string) {
    await this.repository.upsertMessageLog({
      bookingId,
      kind,
      deliveryMode: this.appConfig.EMAIL_MODE,
      status: "skipped",
      subject: `${demoBusiness.name} skipped ${kind.replace("_", " ")}`,
      toEmail,
      sentAt: null,
      error: reason
    });
  }
}
