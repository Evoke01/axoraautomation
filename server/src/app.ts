import {
  bookingSchema,
  bookingStatusSchema,
  businessCreateInputSchema,
  businessCreateResultSchema,
  dashboardSchema,
  leadInputSchema,
  leadSchema,
  publicConfigSchema,
} from "@business-automation/shared";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { ZodError } from "zod";
import type { AppConfig } from "./config.js";
import type { BookingService } from "./service.js";

const SESSION_COOKIE = "axora_admin";

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const businessSlug = Array.isArray(req.params.businessSlug) ? req.params.businessSlug[0] : req.params.businessSlug;
  if (businessSlug && req.signedCookies?.[SESSION_COOKIE] === businessSlug) {
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

  const statusCode =
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof (error as { statusCode?: unknown }).statusCode === "number"
      ? ((error as { statusCode: number }).statusCode)
      : 500;

  const message = error instanceof Error ? error.message : "Unexpected server error.";
  res.status(statusCode).json({ error: message });
}

export function createApp(config: AppConfig, bookingService: BookingService) {
  const app = express();

  app.use(cors({ origin: config.CLIENT_ORIGIN, credentials: true }));
  app.use(express.json());
  app.use(cookieParser(config.SESSION_SECRET));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, app: "business-automation-mvp", emailMode: config.EMAIL_MODE });
  });

  app.post("/api/businesses", async (req, res) => {
    try {
      const input = businessCreateInputSchema.parse(req.body);
      const result = await bookingService.createBusiness(input);
      res.status(201).json(businessCreateResultSchema.parse(result));
    } catch (error) {
      handleError(error, res);
    }
  });

  app.get("/api/public-config/:businessSlug", async (req, res) => {
    try {
      const businessSlug = Array.isArray(req.params.businessSlug) ? req.params.businessSlug[0] : req.params.businessSlug;
      const payload = await bookingService.getPublicConfig(businessSlug);
      res.json(publicConfigSchema.parse(payload));
    } catch (error) {
      handleError(error, res);
    }
  });

  app.post("/api/leads/:businessSlug", async (req, res) => {
    try {
      const businessSlug = Array.isArray(req.params.businessSlug) ? req.params.businessSlug[0] : req.params.businessSlug;
      const input = leadInputSchema.parse(req.body);
      const lead = await bookingService.createLead(businessSlug, input);
      res.status(201).json({ lead: leadSchema.parse(lead) });
    } catch (error) {
      handleError(error, res);
    }
  });

  app.post("/api/bookings/:businessSlug", async (req, res) => {
    try {
      const businessSlug = Array.isArray(req.params.businessSlug) ? req.params.businessSlug[0] : req.params.businessSlug;
      const booking = await bookingService.createBooking(businessSlug, req.body);
      res.status(201).json({ booking: bookingSchema.parse(booking) });
    } catch (error) {
      handleError(error, res);
    }
  });

  app.post("/api/admin/:businessSlug/login", async (req, res) => {
    try {
      const businessSlug = Array.isArray(req.params.businessSlug) ? req.params.businessSlug[0] : req.params.businessSlug;
      const authenticatedSlug = await bookingService.loginBusinessAdmin(businessSlug, req.body?.passcode ?? "");

      res.cookie(SESSION_COOKIE, authenticatedSlug, {
        httpOnly: true,
        sameSite: "lax",
        signed: true,
        secure: config.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 8,
      });

      res.json({ ok: true });
    } catch (error) {
      handleError(error, res);
    }
  });

  app.post("/api/admin/:businessSlug/logout", (_req, res) => {
    res.clearCookie(SESSION_COOKIE);
    res.json({ ok: true });
  });

  app.get("/api/admin/:businessSlug/dashboard", requireAdmin, async (req, res) => {
    try {
      const businessSlug = Array.isArray(req.params.businessSlug) ? req.params.businessSlug[0] : req.params.businessSlug;
      const dashboard = await bookingService.getDashboard(businessSlug);
      res.json(dashboardSchema.parse(dashboard));
    } catch (error) {
      handleError(error, res);
    }
  });

  app.patch("/api/admin/:businessSlug/bookings/:bookingId/status", requireAdmin, async (req, res) => {
    try {
      const businessSlug = Array.isArray(req.params.businessSlug) ? req.params.businessSlug[0] : req.params.businessSlug;
      const bookingId = Array.isArray(req.params.bookingId) ? req.params.bookingId[0] : req.params.bookingId;
      const status = bookingStatusSchema.parse(req.body.status);
      const booking = await bookingService.updateStatus(businessSlug, bookingId, status);
      if (!booking) {
        res.status(404).json({ error: "Booking not found." });
        return;
      }
      res.json({ booking: bookingSchema.parse(booking) });
    } catch (error) {
      handleError(error, res);
    }
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    handleError(error, res);
  });

  return app;
}
