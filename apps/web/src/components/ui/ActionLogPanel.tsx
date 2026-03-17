"use client";

import { useActionLogStore, type ActionKind } from "@/stores/action-log";
import { useEffect, useRef } from "react";

const KIND_COLORS: Record<ActionKind, string> = {
  navigate: "text-blue-400",
  click: "text-cyan-400",
  api_call: "text-amber-400",
  api_response: "text-green-400",
  api_error: "text-red-400",
  state_change: "text-purple-400",
  event: "text-pink-400",
  websocket: "text-teal-400",
};

const KIND_LABELS: Record<ActionKind, string> = {
  navigate: "NAV",
  click: "ACT",
  api_call: "API",
  api_response: "RES",
  api_error: "ERR",
  state_change: "STATE",
  event: "EVENT",
  websocket: "WS",
};

const STATUS_ICONS: Record<string, string> = {
  ok: "text-green-400",
  error: "text-red-400",
  pending: "text-amber-400",
};

export function ActionLogPanel() {
  const entries = useActionLogStore((s) => s.entries);
  const visible = useActionLogStore((s) => s.visible);
  const toggle = useActionLogStore((s) => s.toggle);
  const clear = useActionLogStore((s) => s.clear);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length]);

  return (
    <>
      {/* Toggle button -- always visible in dev */}
      <button
        onClick={toggle}
        className="fixed bottom-4 right-4 z-[60] flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-xs font-mono text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors cursor-pointer"
        title="Toggle Action Log (dev only)"
      >
        LOG
      </button>

      {visible && (
        <div className="fixed bottom-16 right-4 z-[60] flex w-[520px] max-h-[400px] flex-col rounded-xl border border-zinc-700 bg-zinc-950/95 backdrop-blur-md shadow-2xl shadow-black/40 font-mono text-xs">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
            <span className="text-zinc-300 font-semibold tracking-wide">
              Action Log
            </span>
            <div className="flex items-center gap-2">
              <span className="text-zinc-600">{entries.length} entries</span>
              <button
                onClick={clear}
                className="rounded px-2 py-0.5 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Clear
              </button>
              <button
                onClick={toggle}
                className="rounded px-2 py-0.5 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>

          {/* Log entries */}
          <div className="flex-1 overflow-y-auto px-1 py-1">
            {entries.length === 0 && (
              <div className="flex items-center justify-center py-8 text-zinc-600">
                No actions logged yet. Interact with the app.
              </div>
            )}

            {entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-2 rounded px-2 py-1 hover:bg-zinc-900/50"
              >
                {/* Timestamp */}
                <span className="shrink-0 text-zinc-600 tabular-nums">
                  {entry.timestamp}
                </span>

                {/* Kind badge */}
                <span
                  className={`shrink-0 w-12 text-right font-bold ${KIND_COLORS[entry.kind]}`}
                >
                  {KIND_LABELS[entry.kind]}
                </span>

                {/* Status dot */}
                {entry.status && (
                  <span className={`shrink-0 ${STATUS_ICONS[entry.status]}`}>
                    {entry.status === "ok"
                      ? "+"
                      : entry.status === "error"
                        ? "x"
                        : "~"}
                  </span>
                )}

                {/* Label */}
                <span className="text-zinc-300">{entry.label}</span>

                {/* Detail */}
                {entry.detail && (
                  <span className="text-zinc-500 truncate">{entry.detail}</span>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>
      )}
    </>
  );
}
