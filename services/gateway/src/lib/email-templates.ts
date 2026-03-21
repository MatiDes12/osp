// ---------------------------------------------------------------------------
//  Email HTML Templates
//  All styles are inline for maximum email-client compatibility.
// ---------------------------------------------------------------------------

const BRAND_COLOR = "#3b82f6";
const BG_COLOR = "#f4f4f5";
const CARD_BG = "#ffffff";
const TEXT_COLOR = "#18181b";
const MUTED_COLOR = "#71717a";

function layout(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BG_COLOR};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:${CARD_BG};border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
        <!-- Header -->
        <tr>
          <td style="background:${BRAND_COLOR};padding:24px 32px;">
            <span style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">OSP</span>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;color:${TEXT_COLOR};font-size:15px;line-height:1.6;">
            ${content}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #e4e4e7;color:${MUTED_COLOR};font-size:12px;">
            Open Surveillance Platform &mdash; Sent automatically. Do not reply.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Alert/event email template.
 */
export function alertEmailTemplate(params: {
  readonly eventType: string;
  readonly cameraName: string;
  readonly timestamp: string;
  readonly snapshotUrl?: string | null;
  readonly ruleName?: string;
  readonly severity?: string;
}): string {
  const severityBadge = params.severity
    ? `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;background:${
        params.severity === "critical"
          ? "#fecaca;color:#991b1b"
          : params.severity === "high"
            ? "#fed7aa;color:#9a3412"
            : "#e0e7ff;color:#3730a3"
      };">${params.severity.toUpperCase()}</span>`
    : "";

  const snapshot = params.snapshotUrl
    ? `<div style="margin:16px 0;"><img src="${params.snapshotUrl}" alt="Snapshot" style="max-width:100%;border-radius:6px;border:1px solid #e4e4e7;" /></div>`
    : "";

  const content = `
    <h2 style="margin:0 0 16px;font-size:18px;font-weight:600;">Alert: ${params.eventType} ${severityBadge}</h2>
    ${params.ruleName ? `<p style="margin:0 0 8px;"><strong>Rule:</strong> ${params.ruleName}</p>` : ""}
    <p style="margin:0 0 8px;"><strong>Camera:</strong> ${params.cameraName}</p>
    <p style="margin:0 0 8px;"><strong>Time:</strong> ${params.timestamp}</p>
    ${snapshot}
    <p style="margin:16px 0 0;color:${MUTED_COLOR};font-size:13px;">
      Log in to your dashboard for full event details and live view.
    </p>
  `;

  return layout(content);
}

/**
 * User invitation email template.
 */
export function inviteEmailTemplate(params: {
  readonly inviterName: string;
  readonly tenantName: string;
  readonly inviteUrl: string;
  readonly role?: string;
  readonly message?: string | null;
}): string {
  const roleText = params.role ? ` as <strong>${params.role}</strong>` : "";
  const personalMessage = params.message
    ? `<div style="margin:16px 0;padding:12px 16px;background:#f4f4f5;border-radius:6px;color:${MUTED_COLOR};font-style:italic;">"${params.message}"</div>`
    : "";

  const content = `
    <h2 style="margin:0 0 16px;font-size:18px;font-weight:600;">You're invited!</h2>
    <p style="margin:0 0 8px;">
      <strong>${params.inviterName}</strong> has invited you to join
      <strong>${params.tenantName}</strong>${roleText} on OSP.
    </p>
    ${personalMessage}
    <div style="margin:24px 0;text-align:center;">
      <a href="${params.inviteUrl}" style="display:inline-block;padding:12px 32px;background:${BRAND_COLOR};color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">
        Accept Invitation
      </a>
    </div>
    <p style="margin:0;color:${MUTED_COLOR};font-size:13px;">
      This invitation expires in 7 days. If you didn't expect this, you can ignore it.
    </p>
  `;

  return layout(content);
}

/**
 * Daily/weekly event digest email template.
 */
