import { demoBusiness, planCatalog, type Booking, type BookingStatus, type EmailMode, type JobType, type MessageKind, type MessageLog } from "@business-automation/shared";
import { randomUUID } from "node:crypto";
import type { DatabaseClient } from "./db.js";

type BookingRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  service: "haircut" | "facial";
  scheduled_at: Date;
  status: BookingStatus;
  source: "live" | "demo" | "seed";
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type JobRow = {
  id: string;
  booking_id: string;
  type: JobType;
  run_at: Date;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  attempts: number;
  payload_json: Record<string, unknown>;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
};

type MessageRow = {
  id: string;
  booking_id: string;
  kind: MessageKind;
  delivery_mode: EmailMode;
  status: "sent" | "failed" | "skipped";
  subject: string;
  to_email: string;
  sent_at: Date | null;
  provider_message_id: string | null;
  error: string | null;
  created_at: Date;
};

function mapBooking(row: BookingRow): Booking {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    service: row.service,
    scheduledAt: row.scheduled_at.toISOString(),
    status: row.status,
    source: row.source,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    completedAt: row.completed_at ? row.completed_at.toISOString() : null
  };
}

function mapMessage(row: MessageRow): MessageLog {
  return {
    id: row.id,
    bookingId: row.booking_id,
    kind: row.kind,
    deliveryMode: row.delivery_mode,
    status: row.status,
    subject: row.subject,
    toEmail: row.to_email,
    sentAt: row.sent_at ? row.sent_at.toISOString() : null,
    providerMessageId: row.provider_message_id,
    error: row.error,
    createdAt: row.created_at.toISOString()
  };
}

export class Repository {
  constructor(private readonly db: DatabaseClient) {}

  async insertBooking(input: {
    name: string;
    email: string;
    phone: string;
    service: "haircut" | "facial";
    scheduledAt: Date;
    source: "live" | "demo" | "seed";
    status?: BookingStatus;
  }) {
    const result = await this.db.query<BookingRow>(
      `insert into bookings (id, name, email, phone, service, scheduled_at, status, source)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning *`,
      [randomUUID(), input.name, input.email, input.phone, input.service, input.scheduledAt, input.status ?? "confirmed", input.source]
    );
    return mapBooking(result.rows[0]);
  }

  async updateBookingStatus(id: string, status: BookingStatus) {
    const completedAt = status === "completed" ? new Date() : null;
    const result = await this.db.query<BookingRow>(
      `update bookings
       set status = $2,
           completed_at = case when $2 = 'completed' then coalesce(completed_at, $3) else completed_at end,
           updated_at = now()
       where id = $1
       returning *`,
      [id, status, completedAt]
    );
    return result.rows[0] ? mapBooking(result.rows[0]) : null;
  }

  async getBookingById(id: string) {
    const result = await this.db.query<BookingRow>("select * from bookings where id = $1", [id]);
    return result.rows[0] ? mapBooking(result.rows[0]) : null;
  }

  async listBookings() {
    const result = await this.db.query<BookingRow>("select * from bookings order by scheduled_at asc, created_at desc");
    return result.rows.map(mapBooking);
  }

  async listActivity(limit = 20) {
    const result = await this.db.query<MessageRow>(
      "select * from message_log order by coalesce(sent_at, created_at) desc, created_at desc limit $1",
      [limit]
    );
    return result.rows.map(mapMessage);
  }

  async countMonthlyBookings(monthStart: Date) {
    const result = await this.db.query<{ count: string }>(
      "select count(*)::text as count from bookings where created_at >= $1",
      [monthStart]
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async countActiveAutomations() {
    const result = await this.db.query<{ count: string }>(
      "select count(*)::text as count from jobs where status in ('pending', 'running')"
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async ensurePendingJob(bookingId: string, type: JobType, runAt: Date, payload: Record<string, unknown> = {}) {
    const existing = await this.db.query<{ id: string }>(
      "select id from jobs where booking_id = $1 and type = $2 and status in ('pending', 'running') limit 1",
      [bookingId, type]
    );
    if (existing.rows[0]) {
      return false;
    }

    await this.db.query(
      `insert into jobs (id, booking_id, type, run_at, payload_json)
       values ($1, $2, $3, $4, $5::jsonb)`,
      [randomUUID(), bookingId, type, runAt, JSON.stringify(payload)]
    );
    return true;
  }

  async getNextPendingJob() {
    const result = await this.db.query<JobRow>("select * from jobs where status = 'pending' order by run_at asc limit 1");
    return result.rows[0] ?? null;
  }

  async listJobs() {
    const result = await this.db.query<JobRow>("select * from jobs order by run_at asc, created_at asc");
    return result.rows;
  }

  async claimNextDueJob(now = new Date()) {
    const next = await this.db.query<{ id: string }>(
      "select id from jobs where status = 'pending' and run_at <= $1 order by run_at asc limit 1",
      [now]
    );
    const jobId = next.rows[0]?.id;
    if (!jobId) {
      return null;
    }

    const claimed = await this.db.query<JobRow>(
      `update jobs
       set status = 'running', attempts = attempts + 1, updated_at = now()
       where id = $1 and status = 'pending'
       returning *`,
      [jobId]
    );
    return claimed.rows[0] ?? null;
  }

  async finishJob(id: string, status: "completed" | "failed" | "skipped", error: string | null = null) {
    await this.db.query("update jobs set status = $2, last_error = $3, updated_at = now() where id = $1", [id, status, error]);
  }

  async upsertMessageLog(input: {
    bookingId: string;
    kind: MessageKind;
    deliveryMode: EmailMode;
    status: "sent" | "failed" | "skipped";
    subject: string;
    toEmail: string;
    sentAt: Date | null;
    providerMessageId?: string | null;
    error?: string | null;
  }) {
    const result = await this.db.query<MessageRow>(
      `insert into message_log (id, booking_id, kind, delivery_mode, status, subject, to_email, sent_at, provider_message_id, error)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       on conflict (booking_id, kind) do update
         set delivery_mode = excluded.delivery_mode,
             status = excluded.status,
             subject = excluded.subject,
             to_email = excluded.to_email,
             sent_at = excluded.sent_at,
             provider_message_id = excluded.provider_message_id,
             error = excluded.error
       returning *`,
      [
        randomUUID(),
        input.bookingId,
        input.kind,
        input.deliveryMode,
        input.status,
        input.subject,
        input.toEmail,
        input.sentAt,
        input.providerMessageId ?? null,
        input.error ?? null
      ]
    );
    return mapMessage(result.rows[0]);
  }

  async clearAllData() {
    await this.db.query("delete from message_log");
    await this.db.query("delete from jobs");
    await this.db.query("delete from bookings");
  }

  async getDashboardPayload() {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const [bookings, activity, monthlyBookingsUsed, activeAutomations] = await Promise.all([
      this.listBookings(),
      this.listActivity(),
      this.countMonthlyBookings(monthStart),
      this.countActiveAutomations()
    ]);

    const currentPlan = planCatalog.find((plan) => plan.tier === demoBusiness.currentPlan) ?? planCatalog[0];
    return {
      business: {
        name: demoBusiness.name,
        slug: demoBusiness.slug,
        services: [...demoBusiness.services],
        currentPlan: demoBusiness.currentPlan,
        supportEmail: demoBusiness.supportEmail
      },
      bookings,
      activity,
      plans: planCatalog,
      metrics: {
        monthlyBookingsUsed,
        monthlyBookingsLimit: currentPlan.bookingLimit,
        activeAutomations,
        automationLimit: currentPlan.automationLimit
      }
    };
  }
}
