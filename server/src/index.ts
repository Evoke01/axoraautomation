import express from "express";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "./config.js";
import { createPool, applySchema } from "./db.js";
import { EmailService } from "./email.js";
import { Repository } from "./repository.js";
import { Scheduler } from "./scheduler.js";
import { BookingService } from "./service.js";
import { createApp } from "./app.js";

async function main() {
  if (!config.DATABASE_URL) {
    throw new Error("DATABASE_URL is required.");
  }

  const pool = createPool(config.DATABASE_URL);
  await applySchema(pool);

  const repository = new Repository(pool);
  const emailService = new EmailService(config);
  const bookingService = new BookingService(repository, emailService, config);
  const scheduler = new Scheduler(repository, (job) => bookingService.handleJob(job));
  bookingService.attachScheduler(scheduler);
  await bookingService.ensureSeedData();
  await scheduler.start();

  const app = createApp(config, bookingService);
  const clientDist = resolve(process.cwd(), "../client/dist");

  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/")) {
        next();
        return;
      }
      res.sendFile(resolve(clientDist, "index.html"));
    });
  }

  const server = app.listen(config.PORT, () => {
    console.log(`Business automation MVP running on http://localhost:${config.PORT}`);
  });

  const shutdown = async () => {
    await scheduler.stop();
    await pool.end();
    server.close();
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });
}

void main();
