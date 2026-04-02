import type { BookingInput } from "@business-automation/shared";
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
    ADMIN_PASSCODE: "demo123",
    SESSION_SECRET: "test-secret",
    EMAIL_MODE: "demo",
    RESEND_API_KEY: undefined,
    RESEND_FROM_EMAIL: "Demo Salon <onboarding@resend.dev>",
    SUPPORT_EMAIL: "sales@demosalon.app",
    LIVE_REMINDER_HOURS: 24,
    LIVE_FOLLOW_UP_HOURS: 24,
    LIVE_REENGAGEMENT_DAYS: 7,
    DEMO_REMINDER_MS: 100,
    DEMO_AUTO_COMPLETE_MS: 160,
    DEMO_FOLLOW_UP_MS: 60,
    DEMO_REENGAGEMENT_MS: 60,
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

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((harness) => harness.close()));
});

describe("business automation MVP", () => {
  test("POST /api/bookings stores a booking, logs confirmation, and schedules a reminder", async () => {
    const harness = await createHarness();
    const before = await harness.repository.listBookings();

    const payload: BookingInput = {
      name: "Rhea Menon",
      email: "rhea@example.com",
      phone: "+91 90000 11111",
      service: "haircut",
      scheduledAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    };

    const response = await request(harness.app).post("/api/bookings").send(payload).expect(201);
    expect(response.body.booking.name).toBe("Rhea Menon");

    const after = await harness.repository.listBookings();
    expect(after).toHaveLength(before.length + 1);

    const reminderJob = (await harness.repository.listJobs()).find(
      (job) => job.booking_id === response.body.booking.id && job.type === "reminder" && job.status === "pending",
    );
    expect(reminderJob).toBeDefined();

    const confirmation = (await harness.repository.listActivity()).find(
      (entry) => entry.bookingId === response.body.booking.id && entry.kind === "confirmation",
    );
    expect(confirmation?.status).toBe("sent");
  });

  test("scheduler reloads pending jobs on startup after a simulated restart", async () => {
    const harness = await createHarness(
      {
        DEMO_REMINDER_MS: 30,
        DEMO_AUTO_COMPLETE_MS: 500,
      },
      false,
    );

    const booking = await harness.service.createBooking(
      {
        name: "Restart Case",
        email: "restart@example.com",
        phone: "+91 90111 11111",
        service: "facial",
        scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
      "demo",
    );

    await harness.scheduler.start();

    await waitFor(async () => {
      const activity = await harness.repository.listActivity();
      return activity.some((entry) => entry.bookingId === booking.id && entry.kind === "reminder" && entry.status === "sent");
    });
  });

  test("completing a booking schedules follow-up and re-engagement", async () => {
    const harness = await createHarness(
      {
        LIVE_FOLLOW_UP_HOURS: 0,
        LIVE_REENGAGEMENT_DAYS: 0,
      },
      false,
    );

    const booking = await harness.service.createBooking(
      {
        name: "Follow Up Case",
        email: "follow@example.com",
        phone: "+91 92222 22222",
        service: "haircut",
        scheduledAt: new Date().toISOString(),
      },
      "live",
    );

    await harness.service.updateStatus(booking.id, "completed");
    const pendingJobs = await harness.repository.listJobs();
    expect(pendingJobs.some((job) => job.booking_id === booking.id && job.type === "follow_up")).toBe(true);

    await harness.scheduler.start();

    await waitFor(async () => {
      const activity = await harness.repository.listActivity();
      return activity.some((entry) => entry.bookingId === booking.id && entry.kind === "follow_up")
        && activity.some((entry) => entry.bookingId === booking.id && entry.kind === "reengagement");
    });
  });

  test("demo reset restores the seeded fake salon state", async () => {
    const harness = await createHarness();
    const agent = request.agent(harness.app);
    await agent.post("/api/admin/login").send({ passcode: harness.config.ADMIN_PASSCODE }).expect(200);

    const response = await agent.post("/api/demo/reset").expect(200);
    expect(response.body.bookings).toHaveLength(3);
    expect(response.body.bookings.map((booking: { name: string }) => booking.name)).toEqual(
      expect.arrayContaining(["Alicia Brown", "Mira Kapoor", "Jordan Lee"]),
    );
  });

  test("run demo drives the full automation flow with compressed timings", async () => {
    const harness = await createHarness(
      {
        DEMO_REMINDER_MS: 20,
        DEMO_AUTO_COMPLETE_MS: 50,
        DEMO_FOLLOW_UP_MS: 30,
        DEMO_REENGAGEMENT_MS: 30,
      },
      true,
    );

    const agent = request.agent(harness.app);
    await agent.post("/api/admin/login").send({ passcode: harness.config.ADMIN_PASSCODE }).expect(200);
    const response = await agent.post("/api/demo/run").expect(201);
    const bookingId = response.body.booking.id as string;

    await waitFor(async () => {
      const dashboard = await harness.service.getDashboard();
      const activityKinds = dashboard.activity
        .filter((entry) => entry.bookingId === bookingId)
        .map((entry) => entry.kind);
      const booking = dashboard.bookings.find((entry) => entry.id === bookingId);
      return booking?.status === "completed"
        && activityKinds.includes("confirmation")
        && activityKinds.includes("reminder")
        && activityKinds.includes("follow_up")
        && activityKinds.includes("reengagement");
    }, 2000);
  });

  test("dashboard rejects requests without the admin passcode session", async () => {
    const harness = await createHarness();
    await request(harness.app).get("/api/bookings").expect(401);
  });
});
