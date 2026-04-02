import type { BookingInput, BusinessCreateResult, DashboardPayload, LeadInput } from "@business-automation/shared";
import { newDb } from "pg-mem";
import request from "supertest";
import { afterEach, describe, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import { applySchema } from "../src/db.js";
import { EmailService } from "../src/email.js";
import { Repository } from "../src/repository.js";
import { Scheduler } from "../src/scheduler.js";
import { BookingService } from "../src/service.js";

type Harness = Awaited<ReturnType<typeof createHarness>>;

const harnesses: Harness[] = [];

async function createHarness(overrides: Partial<AppConfig> = {}, startScheduler = false) {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  const adapter = db.adapters.createPg();
  const pool = new adapter.Pool();
  await applySchema(pool);

  const config: AppConfig = {
    NODE_ENV: "test",
    PORT: 4000,
    DATABASE_URL: "postgres://test:test@localhost:5432/test",
    CLIENT_ORIGIN: "http://localhost:5173",
    APP_BASE_URL: "http://localhost:4000",
    SESSION_SECRET: "test-secret",
    EMAIL_MODE: "demo",
    RESEND_API_KEY: undefined,
    RESEND_FROM_EMAIL: "Axora <onboarding@resend.dev>",
    SUPPORT_EMAIL: "sales@axora.app",
    ...overrides,
  };

  const repository = new Repository(pool);
  const emailService = new EmailService(config);
  const service = new BookingService(repository, emailService, config);
  const scheduler = new Scheduler(repository, (job) => service.handleJob(job));
  service.attachScheduler(scheduler);
  await service.ensureSeedData();
  if (startScheduler) {
    await scheduler.start();
  }

  const app = createApp(config, service);
  const harness = {
    config,
    app,
    pool,
    repository,
    service,
    scheduler,
    close: async () => {
      await scheduler.stop();
      await pool.end();
    },
  };

  harnesses.push(harness);
  return harness;
}

async function waitFor(condition: () => Promise<boolean>, timeoutMs = 1200) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out while waiting for condition.");
}

async function createBusinessViaApi(harness: Harness, input = { name: "Luma Salon", type: "salon" as const }) {
  const response = await request(harness.app).post("/api/businesses").send(input).expect(201);
  return response.body as BusinessCreateResult;
}

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((harness) => harness.close()));
});

describe("revenue-focused onboarding and impact dashboard", () => {
  test("creates a business with slugged public/admin links and a generated passcode", async () => {
    const harness = await createHarness();

    const result = await createBusinessViaApi(harness, { name: "North Star Gym", type: "gym" });

    expect(result.business.slug).toBe("north-star-gym");
    expect(result.generatedPasscode).toMatch(/^GYM-/);
    expect(result.bookingLink).toContain("/book/north-star-gym");
    expect(result.leadLink).toContain("/lead/north-star-gym");
    expect(result.adminLink).toContain("/admin/north-star-gym");
    expect(result.business.services).toEqual(expect.arrayContaining(["monthly membership", "personal training"]));

    const publicConfig = await request(harness.app).get(`/api/public-config/${result.business.slug}`).expect(200);
    expect(publicConfig.body.business.name).toBe("North Star Gym");
  });

  test("captures leads, converts them into bookings, and reports impact metrics", async () => {
    const harness = await createHarness();
    const business = await createBusinessViaApi(harness);

    const leadPayload: LeadInput = {
      name: "Rhea Menon",
      email: "rhea@example.com",
      phone: "+91 90000 11111",
    };
    await request(harness.app).post(`/api/leads/${business.business.slug}`).send(leadPayload).expect(201);

    const bookingPayload: BookingInput = {
      name: "Rhea Menon",
      email: "rhea@example.com",
      phone: "+91 90000 11111",
      service: "haircut",
      scheduledAt: new Date().toISOString(),
    };
    const bookingResponse = await request(harness.app).post(`/api/bookings/${business.business.slug}`).send(bookingPayload).expect(201);
    expect(bookingResponse.body.booking.source).toBe("lead");

    const agent = request.agent(harness.app);
    await agent.post(`/api/admin/${business.business.slug}/login`).send({ passcode: business.generatedPasscode }).expect(200);
    const dashboardResponse = await agent.get(`/api/admin/${business.business.slug}/dashboard`).expect(200);
    const dashboard = dashboardResponse.body as DashboardPayload;

    expect(dashboard.leadSummary.totalLeads).toBe(1);
    expect(dashboard.leadSummary.convertedLeads).toBe(1);
    expect(dashboard.impact.conversionRate).toBe(1);
    expect(dashboard.impact.conversionRateLabel).toBe("100%");
    expect(dashboard.impact.bookingsToday).toBe(1);
    expect(dashboard.impact.noShows).toBe(0);
  });

  test("business-scoped admin sessions cannot read another business dashboard", async () => {
    const harness = await createHarness();
    const first = await createBusinessViaApi(harness, { name: "Luma Salon", type: "salon" });
    const second = await createBusinessViaApi(harness, { name: "Peak Form Gym", type: "gym" });

    const secondBooking: BookingInput = {
      name: "Arjun Rao",
      email: "arjun@example.com",
      phone: "+91 93333 44444",
      service: "trial session",
      scheduledAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    };
    const secondBookingResponse = await request(harness.app).post(`/api/bookings/${second.business.slug}`).send(secondBooking).expect(201);

    const firstAgent = request.agent(harness.app);
    await firstAgent.post(`/api/admin/${first.business.slug}/login`).send({ passcode: first.generatedPasscode }).expect(200);
    await firstAgent.get(`/api/admin/${first.business.slug}/dashboard`).expect(200);
    await firstAgent.get(`/api/admin/${second.business.slug}/dashboard`).expect(401);
    await firstAgent
      .patch(`/api/admin/${second.business.slug}/bookings/${secondBookingResponse.body.booking.id}/status`)
      .send({ status: "completed" })
      .expect(401);
  });

  test("booking creation stores confirmation activity and a reminder job with business scope", async () => {
    const harness = await createHarness();
    const business = await createBusinessViaApi(harness);

    const bookingPayload: BookingInput = {
      name: "Mira Kapoor",
      email: "mira@example.com",
      phone: "+91 92222 33333",
      service: "facial",
      scheduledAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    };
    const response = await request(harness.app).post(`/api/bookings/${business.business.slug}`).send(bookingPayload).expect(201);

    const jobs = await harness.repository.listJobs();
    const reminderJob = jobs.find((job) => job.booking_id === response.body.booking.id && job.type === "reminder" && job.status === "pending");
    expect(reminderJob?.business_id).toBe(business.business.id);

    const activity = await harness.repository.listActivityByBusiness(business.business.id);
    const confirmation = activity.find((entry) => entry.bookingId === response.body.booking.id && entry.kind === "confirmation");
    expect(confirmation?.status).toBe("sent");
  });

  test("completing a booking schedules follow-up and re-engagement for that business", async () => {
    const harness = await createHarness({}, true);
    const business = await createBusinessViaApi(harness);

    const customSettings = {
      ...business.business.settings,
      followUpHours: 0,
      reengagementDays: 0,
    };
    await harness.pool.query("update businesses set settings_json = $2::jsonb where id = $1", [
      business.business.id,
      JSON.stringify(customSettings),
    ]);

    const bookingPayload: BookingInput = {
      name: "Jordan Lee",
      email: "jordan@example.com",
      phone: "+91 94444 55555",
      service: "haircut",
      scheduledAt: new Date().toISOString(),
    };
    const bookingResponse = await request(harness.app).post(`/api/bookings/${business.business.slug}`).send(bookingPayload).expect(201);

    const agent = request.agent(harness.app);
    await agent.post(`/api/admin/${business.business.slug}/login`).send({ passcode: business.generatedPasscode }).expect(200);
    await agent
      .patch(`/api/admin/${business.business.slug}/bookings/${bookingResponse.body.booking.id}/status`)
      .send({ status: "completed" })
      .expect(200);

    await waitFor(async () => {
      const activity = await harness.repository.listActivityByBusiness(business.business.id);
      return activity.some((entry) => entry.bookingId === bookingResponse.body.booking.id && entry.kind === "follow_up")
        && activity.some((entry) => entry.bookingId === bookingResponse.body.booking.id && entry.kind === "reengagement");
    }, 1500);
  });
});
