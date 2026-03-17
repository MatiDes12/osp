import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">
          Open Surveillance Platform
        </h1>
        <p className="mt-3 text-lg text-[var(--color-muted)]">
          Extensible camera management for every scale
        </p>
      </div>
      <div className="flex gap-4">
        <Link
          href="/(auth)/login"
          className="rounded-lg bg-[var(--color-primary)] px-6 py-3 font-medium text-white hover:opacity-90 transition-opacity"
        >
          Log In
        </Link>
        <Link
          href="/(auth)/register"
          className="rounded-lg border border-[var(--color-border)] px-6 py-3 font-medium hover:bg-[var(--color-card)] transition-colors"
        >
          Get Started
        </Link>
      </div>
    </main>
  );
}
