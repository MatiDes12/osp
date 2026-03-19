import { Resend } from "resend";
import { createLogger } from "./logger.js";
import { get } from "./config.js";

const logger = createLogger("email");

let resendClient: Resend | null | undefined;

function getResend(): Resend | null {
  if (resendClient === undefined) {
    const key = get("RESEND_API_KEY");
    resendClient = key ? new Resend(key) : null;
  }
  return resendClient;
}

export interface SendEmailParams {
  readonly to: readonly string[];
  readonly subject: string;
  readonly html: string;
}

export async function sendEmail(params: SendEmailParams): Promise<void> {
  const resend = getResend();
  if (!resend) {
    logger.info("[email] (no RESEND_API_KEY, logging instead)", {
      subject: params.subject,
      to: params.to.join(", "),
    });
    return;
  }

  const from = get("EMAIL_FROM") ?? "OSP <alerts@osp.dev>";

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
