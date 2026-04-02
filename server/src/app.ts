import { adminLoginSchema, bookingInputSchema, bookingStatusSchema, dashboardSchema, demoBusiness, planCatalog } from "@business-automation/shared";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { ZodError } from "zod";
import type { AppConfig } from "./config.js";
import type { BookingService } from "./service.js";

const SESSION_COOKIE = "demo_salon_admin";

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.signedCookies?.[SESSION_COOKIE] === demoBusiness.slug) {
    next();
    return;
  }

  res.status(401).json({ error: "Admin session required." });
}

function handleError(error: unknown, res: express.Response) {
  if (error instanceof ZodError) {
    res.status(400).json({ error: "Validation failed.", issues: error.flatten() });
    return;
  }

  const message = error instanceof Error ? error.message : "Unexpected server error.";
  res.status(500).json({ error: message });
}

export function createApp(config: AppConfig, bookingService: BookingService) {
  const app = express();

  app.use(cors({ origin: config.CLIENT_ORIGIN, credentials: true }));
  app.use(express.json());
  app.use(cookieParser(config.SESSION_SECRET));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, business: demoBusiness.name, emailMode: config.EMAIL_MODE });
  });

  app.get("/api/public-config", (_req, res) => {
    res.json({
      business: {
        ...demoBusiness,
        supportEmail: config.SUPPORT_EMAIL
      },
      plans: planCatalog
    });
  });

  app.post("/api/admin/login", async (req, res) => {
    try {
      const input = adminLoginSchema.parse(req.body);
      if (input.passcode !== config.ADMIN_PASSCODE) {
        res.status(401).json({ error: "Invalid admin passcode." });
        return;
      }

      res.cookie(SESSION_COOKIE, demoBusiness.slug, {
        httpOnly: true,
        sameSite: "lax",
        signed: true,
        secure: config.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 8
      });
      res.json({ ok: true });
    } catch (error) {
      handleError(error, res);
    }
  });

  app.post("/api/admin/logout", (_req, res) => {
    res.clearCookie(SESSION_COOKIE);
    res.json({ ok: true });
  });

  app.post("/api/bookings", async (req, res) => {
    try {
      const input = bookingInputSchema.parse(req.body);
      const booking = await bookingService.createBooking(input);
      res.status(201).json({ booking });
    } catch (error) {
      handleError(error, res);
    }
  });

  app.get("/api/bookings", requireAdmin, async (_req, res) => {
    const dashboard = await bookingService.getDashboard();
    res.json(dashboardSchema.parse(dashboard));
  });

  app.patch("/api/bookings/:id/status", requireAdmin, async (req, res) => {
    try {
      const status = bookingStatusSchema.parse(req.body.status);
      const bookingId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const booking = await bookingService.updateStatus(bookingId, status);
      if (!booking) {
        res.status(404).json({ error: "Booking not found." });
        return;
      }
      res.json({ booking });
    } catch (error) {
      handleError(error, res);
    }
  });

  app.post("/api/demo/reset", requireAdmin, async (_req, res) => {
    await bookingService.seedDemoData();
    res.json(dashboardSchema.parse(await bookingService.getDashboard()));
  });

  app.post("/api/demo/run", requireAdmin, async (_req, res) => {
    const booking = await bookingService.runDemoFlow();
    res.status(201).json({ booking });
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    handleError(error, res);
  });

  return app;
}
