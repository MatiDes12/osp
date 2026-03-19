import { mkdirSync } from "node:fs";
import vm from "node:vm";
import { get } from "../lib/config.js";
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
  private readonly sandboxDir: string;
  private readonly allowInlineSource: boolean;

  constructor() {
    this.sandboxDir = get("EXTENSION_SANDBOX_DIR") ?? "./extension_sandbox";
    mkdirSync(this.sandboxDir, { recursive: true });
    this.allowInlineSource = get("EXTENSION_ALLOW_INLINE_SOURCE") === "true";
    if (this.allowInlineSource) {
      const nodeEnv = get("NODE_ENV") ?? "development";
      if (nodeEnv === "production") {
        throw new Error(
          "EXTENSION_ALLOW_INLINE_SOURCE=true is forbidden in production",
        );
      }
      logger.error(
        "Unsafe inline extension source execution enabled. Use only in trusted dev environments.",
      );
    }
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

    const source = this.getSourceCode(config);
    if (!source) {
      return {
        success: false,
        error:
          this.allowInlineSource
            ? "No extension code found. Provide one of config.source, config.code, or config.script."
            : "Inline extension source is disabled. Set EXTENSION_ALLOW_INLINE_SOURCE=true only in trusted environments.",
        durationMs: Date.now() - start,
      };
    }

    const safeTimeout = clampTimeout(timeoutMs);
    const handlerName =
      asString(config["handlerFunction"])
      ?? asString(config["handler"])
      ?? hookName;

    const exportsRef: Record<string, unknown> = {};
    const sandbox: Record<string, unknown> = {
      module: { exports: exportsRef },
      exports: exportsRef,
      // Data-only host surface. Do not expose host callables.
      console: Object.freeze({
        log: () => {},
        warn: () => {},
        error: () => {},
      }),
      host: Object.freeze({
        nowIso: new Date().toISOString(),
      }),
      __eventData: eventData,
      __config: config,
      __handlerName: handlerName,
      __result: null,
    };

    try {
      const context = vm.createContext(sandbox, {
        name: `extension-${extensionId}`,
        codeGeneration: { strings: false, wasm: false },
      });

      const script = new vm.Script(source, {
        filename: `extension-${extensionId}.js`,
      });
      script.runInContext(context, { timeout: safeTimeout });

      const invoke = new vm.Script(
        [
          "const mod = module?.exports;",
          "let fn = null;",
          "if (typeof mod === 'function') fn = mod;",
          "if (!fn && mod && typeof mod === 'object') {",
          "  fn = mod[__handlerName] ?? mod.default ?? null;",
          "}",
          "if (!fn && typeof globalThis[__handlerName] === 'function') {",
          "  fn = globalThis[__handlerName];",
          "}",
          "if (typeof fn !== 'function') {",
          "  throw new Error(`Handler \"${__handlerName}\" not found in extension code`);",
          "}",
          "__result = fn(__eventData, __config);",
        ].join("\n"),
        { filename: `extension-${extensionId}-invoke.js` },
      );
      invoke.runInContext(context, { timeout: safeTimeout });

      const result = (context as unknown as { __result: unknown }).__result;
      if (isPromiseLike(result)) {
        return {
          success: false,
          error:
            "Async extension hooks are not supported in the in-process vm executor. Use sync handlers.",
          durationMs: Date.now() - start,
        };
      }

      return {
        success: true,
        result,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      logger.warn("Extension hook execution failed", {
        extensionId,
        hookName,
        error: String(err),
      });
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      };
    }
  }

  private getSourceCode(config: Record<string, unknown>): string | null {
    if (!this.allowInlineSource) return null;
    const source = asString(config["source"])
      ?? asString(config["code"])
      ?? asString(config["script"]);
    if (!source) return null;
    return source;
  }
}

let instance: ExtensionRunner | null = null;

export function getExtensionRunner(): ExtensionRunner {
  instance ??= new ExtensionRunner();
  return instance;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function clampTimeout(timeoutMs: number): number {
  if (!Number.isFinite(timeoutMs)) return 5000;
  return Math.max(100, Math.min(1000, Math.round(timeoutMs)));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return isObject(value) && typeof value["then"] === "function";
}
