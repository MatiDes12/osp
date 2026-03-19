/**
 * Environment variable validation.
 * Call validateEnv() at gateway startup before anything else.
 */

const REQUIRED = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
];

const DEFAULTS: Record<string, string> = {
  GATEWAY_PORT: "3000",
  WS_PORT: "3002",
  REDIS_URL: "redis://localhost:6379",
  GO2RTC_URL: "http://localhost:1984",
  GO2RTC_API_URL: "http://localhost:1984",
  NODE_ENV: "development",
  RECORDINGS_DIR: "./recordings",
  AI_PROVIDER: "none",
};

export function validateEnv(): void {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}\n` +
        "Copy .env.example to .env and fill in your Supabase credentials.",
    );
  }

  // Apply defaults for unset optional vars
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }

  const env = process.env["NODE_ENV"] ?? "development";
  const redacted = (s: string) => s.slice(0, 8) + "...";

  console.log("[env] Environment validated:");
  console.log(`  NODE_ENV       = ${env}`);
  console.log(`  SUPABASE_URL   = ${process.env["SUPABASE_URL"]}`);
  console.log(`  REDIS_URL      = ${process.env["REDIS_URL"]}`);
  console.log(`  GO2RTC_URL     = ${process.env["GO2RTC_URL"]}`);
  console.log(`  AI_PROVIDER    = ${process.env["AI_PROVIDER"]}`);
  if (process.env["SENTRY_DSN"]) {
    console.log(`  SENTRY_DSN     = ${redacted(process.env["SENTRY_DSN"])}`);
  }
}
