/**
 * Browser-only storage for PC Docker agent setup (ngrok). Never sent to OSP servers.
 * Used to pre-fill the web setup wizard and let users rotate tokens from Settings.
 */
export const NGROK_AUTHTOKEN_MIN_LEN = 20;

export const OSP_LOCAL_NGROK_AUTHTOKEN_KEY = "osp_local_ngrok_authtoken";

export const NGROK_AUTHTOKEN_DASHBOARD_URL =
  "https://dashboard.ngrok.com/get-started/your-authtoken";

export function getLocalNgrokAuthtoken(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(OSP_LOCAL_NGROK_AUTHTOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setLocalNgrokAuthtoken(token: string): void {
  if (typeof window === "undefined") return;
  const t = token.trim();
  if (t.length === 0) {
    localStorage.removeItem(OSP_LOCAL_NGROK_AUTHTOKEN_KEY);
    return;
  }
  localStorage.setItem(OSP_LOCAL_NGROK_AUTHTOKEN_KEY, t);
}

export function clearLocalNgrokAuthtoken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(OSP_LOCAL_NGROK_AUTHTOKEN_KEY);
}
