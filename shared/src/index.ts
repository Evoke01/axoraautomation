import { z } from "zod";

export const serviceOptions = ["haircut", "facial"] as const;
export const bookingStatusValues = ["confirmed", "completed", "cancelled", "no_show"] as const;
export const jobTypeValues = ["reminder", "follow_up", "reengagement", "demo_complete"] as const;
export const emailModeValues = ["demo", "live"] as const;
export const messageKindValues = ["confirmation", "reminder", "follow_up", "reengagement"] as const;
export const messageStatusValues = ["sent", "failed", "skipped"] as const;
export const bookingSourceValues = ["live", "demo", "seed"] as const;
export const planTierValues = ["starter", "pro"] as const;

export const serviceSchema = z.enum(serviceOptions);
export const bookingStatusSchema = z.enum(bookingStatusValues);
export const jobTypeSchema = z.enum(jobTypeValues);
export const emailModeSchema = z.enum(emailModeValues);
export const messageKindSchema = z.enum(messageKindValues);
export const messageStatusSchema = z.enum(messageStatusValues);
export const bookingSourceSchema = z.enum(bookingSourceValues);
export const planTierSchema = z.enum(planTierValues);

export const bookingInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email(),
  phone: z.string().trim().min(8).max(24),
  service: serviceSchema,
  scheduledAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date/time"),
});

export const adminLoginSchema = z.object({
  passcode: z.string().trim().min(1),
});

export const bookingSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  service: serviceSchema,
  scheduledAt: z.string(),
  status: bookingStatusSchema,
  source: bookingSourceSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
});

export const messageLogSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  kind: messageKindSchema,
  deliveryMode: emailModeSchema,
  status: messageStatusSchema,
  subject: z.string(),
  toEmail: z.string(),
  sentAt: z.string().nullable(),
  providerMessageId: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
});

export const planSchema = z.object({
  tier: planTierSchema,
  label: z.string(),
  priceLabel: z.string(),
  bookingLimit: z.number(),
  automationLimit: z.number(),
  features: z.array(z.string()),
  lockedFeatures: z.array(z.string()),
  highlight: z.string(),
});

export const metricsSchema = z.object({
  monthlyBookingsUsed: z.number(),
  monthlyBookingsLimit: z.number(),
  activeAutomations: z.number(),
  automationLimit: z.number(),
});

export const dashboardSchema = z.object({
  business: z.object({
    name: z.string(),
    slug: z.string(),
    services: z.array(serviceSchema),
    currentPlan: planTierSchema,
    supportEmail: z.string(),
  }),
  bookings: z.array(bookingSchema),
  activity: z.array(messageLogSchema),
  plans: z.array(planSchema),
  metrics: metricsSchema,
});

export const publicConfigSchema = z.object({
  business: z.object({
    name: z.string(),
    slug: z.string(),
    services: z.array(serviceSchema),
    currentPlan: planTierSchema,
    supportEmail: z.string(),
  }),
  plans: z.array(planSchema),
});

export const demoBusiness = {
  name: "Demo Salon",
  slug: "demo-salon",
  services: serviceOptions,
  currentPlan: "starter" as const,
  supportEmail: "sales@demosalon.app",
};

export const planCatalog = [
  {
    tier: "starter" as const,
    label: "Starter",
    priceLabel: "$29/mo",
    bookingLimit: 150,
    automationLimit: 3,
    features: [
      "Booking form and admin dashboard",
      "Confirmation, reminder, and follow-up emails",
      "Demo mode for sales calls"
    ],
    lockedFeatures: ["Custom branding", "SMS and WhatsApp", "Calendar sync"],
    highlight: "Fastest way to launch a service business workflow."
  },
  {
    tier: "pro" as const,
    label: "Pro",
    priceLabel: "$99/mo",
    bookingLimit: 1000,
    automationLimit: 12,
    features: [
      "Everything in Starter",
      "Higher automation capacity",
      "Priority support and wrapper-site rollout"
    ],
    lockedFeatures: [],
    highlight: "Built for multi-location growth and higher lead volume."
  }
];

export type BookingInput = z.infer<typeof bookingInputSchema>;
export type Booking = z.infer<typeof bookingSchema>;
export type BookingStatus = z.infer<typeof bookingStatusSchema>;
export type JobType = z.infer<typeof jobTypeSchema>;
export type EmailMode = z.infer<typeof emailModeSchema>;
export type MessageKind = z.infer<typeof messageKindSchema>;
export type MessageLog = z.infer<typeof messageLogSchema>;
export type Plan = z.infer<typeof planSchema>;
export type PlanTier = z.infer<typeof planTierSchema>;
export type DashboardPayload = z.infer<typeof dashboardSchema>;
export type PublicConfig = z.infer<typeof publicConfigSchema>;
