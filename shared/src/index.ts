import { z } from "zod";

export const businessTypeValues = ["salon", "gym"] as const;
export const bookingStatusValues = ["confirmed", "completed", "cancelled", "no_show"] as const;
export const jobTypeValues = ["reminder", "follow_up", "reengagement"] as const;
export const emailModeValues = ["demo", "live"] as const;
export const messageKindValues = ["confirmation", "reminder", "follow_up", "reengagement"] as const;
export const messageStatusValues = ["sent", "failed", "skipped"] as const;
export const bookingSourceValues = ["public", "lead", "seed"] as const;
export const leadStatusValues = ["new", "converted"] as const;
export const leadSourceValues = ["public", "seed"] as const;
export const planTierValues = ["starter", "pro"] as const;

export const businessTypeSchema = z.enum(businessTypeValues);
export const bookingStatusSchema = z.enum(bookingStatusValues);
export const jobTypeSchema = z.enum(jobTypeValues);
export const emailModeSchema = z.enum(emailModeValues);
export const messageKindSchema = z.enum(messageKindValues);
export const messageStatusSchema = z.enum(messageStatusValues);
export const bookingSourceSchema = z.enum(bookingSourceValues);
export const leadStatusSchema = z.enum(leadStatusValues);
export const leadSourceSchema = z.enum(leadSourceValues);
export const planTierSchema = z.enum(planTierValues);

export const businessSettingsSchema = z.object({
  services: z.array(z.string().trim().min(2).max(80)).min(1),
  reminderHours: z.number().nonnegative(),
  followUpHours: z.number().nonnegative(),
  reengagementDays: z.number().nonnegative(),
  leadHeadline: z.string(),
  leadDescription: z.string(),
  bookingHeadline: z.string(),
  bookingDescription: z.string(),
  dashboardCopy: z.string(),
  kpiExample: z.object({
    leads: z.number().int().nonnegative(),
    bookings: z.number().int().nonnegative(),
    conversionLabel: z.string(),
  }),
});

export const businessCreateInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  type: businessTypeSchema,
});

export const leadInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email(),
  phone: z.string().trim().min(8).max(24),
});

export const bookingInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email(),
  phone: z.string().trim().min(8).max(24),
  service: z.string().trim().min(2).max(80),
  scheduledAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date/time"),
});

export const adminLoginSchema = z.object({
  passcode: z.string().trim().min(1),
});

export const businessIdentitySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  type: businessTypeSchema,
  currentPlan: planTierSchema,
  supportEmail: z.string().email(),
  services: z.array(z.string()),
  settings: businessSettingsSchema,
  bookingLink: z.string(),
  leadLink: z.string(),
  adminLink: z.string(),
});

export const businessSchema = businessIdentitySchema.extend({
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const businessCreateResultSchema = z.object({
  business: businessIdentitySchema,
  generatedPasscode: z.string(),
  bookingLink: z.string(),
  leadLink: z.string(),
  adminLink: z.string(),
});

export const leadSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  status: leadStatusSchema,
  source: leadSourceSchema,
  convertedBookingId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const bookingSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  service: z.string(),
  scheduledAt: z.string(),
  status: bookingStatusSchema,
  source: bookingSourceSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
});

export const messageLogSchema = z.object({
  id: z.string(),
  businessId: z.string(),
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

export const impactMetricsSchema = z.object({
  bookingsToday: z.number().int().nonnegative(),
  bookingsThisWeek: z.number().int().nonnegative(),
  noShows: z.number().int().nonnegative(),
  conversionRate: z.number().nonnegative(),
  conversionRateLabel: z.string(),
});

export const leadSummarySchema = z.object({
  totalLeads: z.number().int().nonnegative(),
  convertedLeads: z.number().int().nonnegative(),
  openLeads: z.number().int().nonnegative(),
});

export const dashboardSchema = z.object({
  business: businessIdentitySchema,
  impact: impactMetricsSchema,
  leadSummary: leadSummarySchema,
  bookings: z.array(bookingSchema),
  activity: z.array(messageLogSchema),
  plans: z.array(planSchema),
});

export const publicConfigSchema = z.object({
  business: businessIdentitySchema,
  plans: z.array(planSchema),
});

export const planCatalog = [
  {
    tier: "starter" as const,
    label: "Starter",
    priceLabel: "$29/mo",
    bookingLimit: 150,
    automationLimit: 3,
    features: [
      "Lead capture and booking pages",
      "Impact dashboard with conversion metrics",
      "Confirmation, reminder, and follow-up emails",
    ],
    lockedFeatures: ["Custom branding", "SMS and WhatsApp", "Calendar sync"],
    highlight: "Launch a business funnel that proves revenue impact fast.",
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
      "Priority support and wrapper-site rollout",
    ],
    lockedFeatures: [],
    highlight: "Built for operators who want higher volume and sharper reporting.",
  },
];

export const businessPresets = {
  salon: {
    services: ["haircut", "facial", "hair spa"],
    reminderHours: 24,
    followUpHours: 24,
    reengagementDays: 7,
    leadHeadline: "Turn salon inquiries into booked appointments.",
    leadDescription: "Collect warm leads first, then move them into bookings so the owner can see conversion in plain numbers.",
    bookingHeadline: "Book your next salon visit.",
    bookingDescription: "Choose a service, lock a time, and trigger the automation flow automatically.",
    dashboardCopy: "See how many inquiries turned into appointments this week and where no-shows are costing money.",
    kpiExample: {
      leads: 50,
      bookings: 20,
      conversionLabel: "40%",
    },
  },
  gym: {
    services: ["monthly membership", "personal training", "trial session"],
    reminderHours: 24,
    followUpHours: 24,
    reengagementDays: 14,
    leadHeadline: "Convert gym inquiries into memberships and sessions.",
    leadDescription: "Capture every interested visitor, then measure how many actually become paying bookings.",
    bookingHeadline: "Book your gym session or membership consult.",
    bookingDescription: "Let prospects move from interest to a confirmed slot without losing the trail.",
    dashboardCopy: "Track how many leads became booked sessions, where no-shows happened, and what that means for weekly growth.",
    kpiExample: {
      leads: 50,
      bookings: 20,
      conversionLabel: "40%",
    },
  },
} satisfies Record<BusinessType, BusinessSettings>;

export type BusinessType = z.infer<typeof businessTypeSchema>;
export type BookingStatus = z.infer<typeof bookingStatusSchema>;
export type JobType = z.infer<typeof jobTypeSchema>;
export type EmailMode = z.infer<typeof emailModeSchema>;
export type MessageKind = z.infer<typeof messageKindSchema>;
export type PlanTier = z.infer<typeof planTierSchema>;
export type LeadStatus = z.infer<typeof leadStatusSchema>;
export type LeadSource = z.infer<typeof leadSourceSchema>;
export type BookingSource = z.infer<typeof bookingSourceSchema>;

export type BusinessSettings = z.infer<typeof businessSettingsSchema>;
export type BusinessCreateInput = z.infer<typeof businessCreateInputSchema>;
export type LeadInput = z.infer<typeof leadInputSchema>;
export type BookingInput = z.infer<typeof bookingInputSchema>;
export type Business = z.infer<typeof businessSchema>;
export type BusinessIdentity = z.infer<typeof businessIdentitySchema>;
export type BusinessCreateResult = z.infer<typeof businessCreateResultSchema>;
export type Lead = z.infer<typeof leadSchema>;
export type Booking = z.infer<typeof bookingSchema>;
export type MessageLog = z.infer<typeof messageLogSchema>;
export type Plan = z.infer<typeof planSchema>;
export type ImpactMetrics = z.infer<typeof impactMetricsSchema>;
export type LeadSummary = z.infer<typeof leadSummarySchema>;
export type DashboardPayload = z.infer<typeof dashboardSchema>;
export type PublicConfig = z.infer<typeof publicConfigSchema>;
