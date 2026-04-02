import type { Booking, EmailMode, MessageKind } from "@business-automation/shared";
import { Resend } from "resend";
import type { AppConfig } from "./config.js";

export type EmailDeliveryResult = {
  deliveryMode: EmailMode;
  status: "sent" | "failed" | "skipped";
  subject: string;
  providerMessageId?: string | null;
  error?: string | null;
};

function formatDate(dateString: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(dateString));
}

function buildEmail(kind: MessageKind, booking: Booking) {
  const when = formatDate(booking.scheduledAt);
  const subjects: Record<MessageKind, string> = {
    confirmation: `${booking.service} booked at Demo Salon for ${when}`,
    reminder: `Reminder: your ${booking.service} is coming up at Demo Salon`,
    follow_up: `How was your ${booking.service} at Demo Salon?`,
    reengagement: `Ready for your next Demo Salon visit?`
  };

  const bodies: Record<MessageKind, string> = {
    confirmation: `Hi ${booking.name}, your ${booking.service} is confirmed for ${when}. We will keep you posted automatically.`,
    reminder: `Hi ${booking.name}, this is your reminder for the ${booking.service} scheduled at ${when}.`,
    follow_up: `Hi ${booking.name}, thanks for visiting Demo Salon. We would love to see you again soon.`,
    reengagement: `Hi ${booking.name}, it might be time for your next ${booking.service}. Reply to this email to book your next slot.`
  };

  return {
    subject: subjects[kind],
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>${subjects[kind]}</h2><p>${bodies[kind]}</p></div>`
  };
}

export class EmailService {
  private readonly resend: Resend | null;

  constructor(private readonly appConfig: AppConfig) {
    this.resend = appConfig.RESEND_API_KEY ? new Resend(appConfig.RESEND_API_KEY) : null;
  }

  async send(kind: MessageKind, booking: Booking): Promise<EmailDeliveryResult> {
    const payload = buildEmail(kind, booking);

    if (this.appConfig.EMAIL_MODE === "demo") {
      return {
        deliveryMode: "demo",
        status: "sent",
        subject: payload.subject,
        providerMessageId: `demo-${kind}-${booking.id}`
      };
    }

    if (!this.resend) {
      return {
        deliveryMode: "live",
        status: "failed",
        subject: payload.subject,
        error: "RESEND_API_KEY is required in live email mode."
      };
    }

    try {
      const response = await this.resend.emails.send({
        from: this.appConfig.RESEND_FROM_EMAIL,
        to: booking.email,
        subject: payload.subject,
        html: payload.html
      });

      if (response.error) {
        return {
          deliveryMode: "live",
          status: "failed",
          subject: payload.subject,
          error: response.error.message
        };
      }

      return {
        deliveryMode: "live",
        status: "sent",
        subject: payload.subject,
        providerMessageId: response.data?.id ?? null
      };
    } catch (error) {
      return {
        deliveryMode: "live",
        status: "failed",
        subject: payload.subject,
        error: error instanceof Error ? error.message : "Unexpected email delivery failure."
      };
    }
  }
}
