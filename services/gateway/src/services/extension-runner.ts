import { mkdirSync } from "fs";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("extension-runner");

interface HookResult {
  success: boolean;
  result?: unknown;
  error?: string;
  durationMs: number;
}

/**
 * Extension hook runner.
 * Phase 2 MVP: logs hook invocations and returns success.
 * Phase 3: will execute extensions in a Wasm/V8 sandbox.
 */
export class ExtensionRunner {
  private sandboxDir: string;

  constructor() {
    this.sandboxDir = process.env["EXTENSION_SANDBOX_DIR"] ?? "./extension_sandbox";
    mkdirSync(this.sandboxDir, { recursive: true });
  }

  /**
   * Execute a named hook on an extension with event data.
   * Returns success/failure and any result from the extension.
   */
  async executeHook(
    extensionId: string,
    hookName: string,
    eventData: unknown,
    config: Record<string, unknown>,
    timeoutMs = 5000,
  ): Promise<HookResult> {
    const start = Date.now();

    logger.info("Extension hook invoked", {
      extensionId,
      hookName,
      eventType: (eventData as Record<string, unknown>)?.type ?? "unknown",
    });

    // TODO Phase 3: Load the extension's Wasm bundle from the marketplace,
    // instantiate it in an isolated sandbox with resource limits,
    // inject the host API (cameras, events, notifications, storage),
    // call the hook function with eventData, and return its result.

    // Phase 2: Placeholder success response
    void timeoutMs; // acknowledged, will be used in Phase 3
    void config;

    return {
      success: true,
      result: null,
      durationMs: Date.now() - start,
    };
  }
}

let instance: ExtensionRunner | null = null;

export function getExtensionRunner(): ExtensionRunner {
  if (!instance) {
    instance = new ExtensionRunner();
  }
  return instance;
}
