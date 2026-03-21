import { createLogger } from "./logger.js";
import { get } from "./config.js";

const logger = createLogger("email");

const SENDGRID_API = "https://api.sendgrid.com/v3/mail/send";

export interface SendEmailParams {
  readonly to: readonly string[];
  readonly subject: string;
  readonly html: string;
}

export async function sendEmail(params: SendEmailParams): Promise<void> {
  const apiKey = get("SENDGRID_API_KEY");

  if (!apiKey) {
    logger.info("[email] no SENDGRID_API_KEY — logging instead", {
      subject: params.subject,
      to: params.to.join(", "),
    });
    return;
  }

  const from = get("EMAIL_FROM") ?? "OSP Alerts <alerts@osp.dev>";

  const body = {
    personalizations: [
      {
        to: params.to.map((email) => ({ email })),
      },
    ],
    from: {
      email: from.includes("<") ? (from.match(/<(.+)>/)?.[1] ?? from) : from,
      name: "OSP",
    },
    subject: params.subject,
    content: [{ type: "text/html", value: params.html }],
  };

  try {
    const res = await fetch(SENDGRID_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      logger.error("SendGrid rejected email", {
        status: String(res.status),
        body: errText.slice(0, 300),
        subject: params.subject,
      });
      return;
    }

    logger.info("Email sent via SendGrid", {
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
