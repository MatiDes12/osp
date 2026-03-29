/**
 * ngrok returns HTML error pages (403) instead of proxying when quotas are hit
 * or policies block traffic. Parse the body so operators see the real reason.
 */
export function describeNgrokErrorPage(body: string): string | null {
  if (!body || body.length < 50) return null;
  const lower = body.toLowerCase();
  if (!lower.includes("ngrok") && !body.includes("ERR_NGROK")) return null;

  if (
    body.includes("ERR_NGROK_725") ||
    lower.includes("network bandwidth limit") ||
    lower.includes("bandwidth limit for the month")
  ) {
    return "Ngrok tunnel quota: monthly bandwidth limit reached (ERR_NGROK_725). Live video uses data quickly on the free tier. Open https://dashboard.ngrok.com/billing to upgrade or add credit, or wait for the limit to reset.";
  }

  if (body.includes("ERR_NGROK_")) {
    const m = body.match(/ERR_NGROK_\d+/);
    return `Ngrok returned an error page (${m?.[0] ?? "unknown code"}) instead of reaching go2rtc. See https://dashboard.ngrok.com for tunnel status.`;
  }

  if (lower.includes("interstitial") || lower.includes("visit site")) {
    return "Ngrok showed a browser warning page instead of proxying. Ensure requests include header ngrok-skip-browser-warning, or use a paid ngrok plan without the interstitial.";
  }

  return "Ngrok returned an HTML error page instead of go2rtc. Check https://dashboard.ngrok.com for this tunnel’s status and limits.";
}
