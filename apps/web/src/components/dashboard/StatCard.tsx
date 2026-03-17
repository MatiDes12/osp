"use client";

import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  readonly label: string;
  readonly value: number | string;
  readonly icon: LucideIcon;
  readonly color?: string;
  readonly progress?: number;
  readonly progressColor?: string;
  readonly subtitle?: string;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  color = "text-zinc-50",
  progress,
  progressColor = "bg-blue-500",
  subtitle,
}: StatCardProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 relative overflow-hidden">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs text-zinc-400 uppercase tracking-wider">
            {label}
          </p>
          <p className={`text-2xl font-semibold ${color}`}>{value}</p>
          {subtitle && (
            <p className="text-xs text-zinc-500">{subtitle}</p>
          )}
        </div>
        <Icon className="h-5 w-5 text-zinc-500 shrink-0" />
      </div>
      {progress !== undefined && (
        <div className="mt-3 h-1 w-full rounded-full bg-zinc-800">
          <div
            className={`h-1 rounded-full transition-all duration-500 ${progressColor}`}
            style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-3 w-20 rounded bg-zinc-800 animate-pulse" />
          <div className="h-7 w-14 rounded bg-zinc-800 animate-pulse" />
        </div>
        <div className="h-5 w-5 rounded bg-zinc-800 animate-pulse" />
      </div>
      <div className="mt-3 h-1 w-full rounded-full bg-zinc-800 animate-pulse" />
    </div>
  );
}
