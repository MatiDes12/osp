import type { JSX } from "react";

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): JSX.Element {
  return <div className="min-h-screen bg-zinc-950">{children}</div>;
}
