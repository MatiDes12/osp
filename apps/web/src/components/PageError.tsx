"use client";

import { AlertCircle, RefreshCw } from "lucide-react";

interface PageErrorProps {
  readonly message: string;
  readonly onRetry?: () => void;
}

export function PageError({ message, onRetry }: PageErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 mb-4">
        <AlertCircle className="h-6 w-6 text-red-400" />
      </div>
      <p className="text-sm font-medium text-zinc-300 mb-1">
        Something went wrong
      </p>
      <p className="text-xs text-zinc-500 mb-4 text-center max-w-sm">
        {message}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-700 transition-colors duration-150 cursor-pointer"
        >
          <RefreshCw className="h-4 w-4" />
          Try Again
        </button>
      )}
    </div>
  );
}
