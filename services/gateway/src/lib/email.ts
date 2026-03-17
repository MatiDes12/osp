import { Resend } from "resend";
import { createLogger } from "./logger.js";

const logger = createLogger("email");

const resend = process.env["RESEND_API_KEY"]
  ? new Resend(process.env["RESEND_API_KEY"])
  : null;

export interface SendEmailParams {
  readonly to: readonly string[];
  readonly subject: string;
  readonly html: string;
}

export async function sendEmail(params: SendEmailParams): Promise<void> {
  if (!resend) {
    logger.info("[email] (no RESEND_API_KEY, logging instead)", {
      subject: params.subject,
      to: params.to.join(", "),
    });
    return;
  }

  const from = process.env["EMAIL_FROM"] ?? "OSP <alerts@osp.dev>";

  try {
    const { error } = await resend.emails.send({
      from,
      to: [...params.to],
      subject: params.subject,
      html: params.html,
    });

    if (error) {
      logger.error("Failed to send email via Resend", {
        errorMessage: error.message,
        subject: params.subject,
        to: params.to.join(", "),
      });
      return;
    }

    logger.info("Email sent", {
      subject: params.subject,
      recipientCount: String(params.to.length),
    });
  } catch (err) {
    logger.error("Email send threw an exception", {
      error: err instanceof Error ? err : new Error(String(err)),
      subject: params.subject,
    });
  }
}
