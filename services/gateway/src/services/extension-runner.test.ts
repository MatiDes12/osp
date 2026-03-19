import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ExtensionRunner } from "./extension-runner.js";

describe("ExtensionRunner", () => {
  let originalInlineEnv: string | undefined;

  beforeEach(() => {
    originalInlineEnv = process.env["EXTENSION_ALLOW_INLINE_SOURCE"];
  });

  afterEach(() => {
    if (originalInlineEnv === undefined) {
      delete process.env["EXTENSION_ALLOW_INLINE_SOURCE"];
    } else {
      process.env["EXTENSION_ALLOW_INLINE_SOURCE"] = originalInlineEnv;
    }
  });

  it("executes CommonJS default function export", async () => {
    process.env["EXTENSION_ALLOW_INLINE_SOURCE"] = "true";
    const runner = new ExtensionRunner();
    const result = await runner.executeHook(
      "ext-1",
      "onRuleTriggered",
      { value: 2 },
      {
        source: `
          module.exports = (event) => ({ doubled: event.value * 2 });
        `,
      },
      1000,
    );

    expect(result.success).toBe(true);
    expect(result.result).toEqual({ doubled: 4 });
  });

  it("executes named handler function from module exports", async () => {
    process.env["EXTENSION_ALLOW_INLINE_SOURCE"] = "true";
    const runner = new ExtensionRunner();
    const result = await runner.executeHook(
      "ext-2",
      "myHook",
      { value: 3 },
      {
        handlerFunction: "myHook",
        source: `
          module.exports = {
            myHook: (event) => ({ tripled: event.value * 3 })
          };
        `,
      },
      1000,
    );

    expect(result.success).toBe(true);
    expect(result.result).toEqual({ tripled: 9 });
  });

  it("returns failure when code is missing", async () => {
    process.env["EXTENSION_ALLOW_INLINE_SOURCE"] = "true";
    const runner = new ExtensionRunner();
    const result = await runner.executeHook(
      "ext-3",
      "onRuleTriggered",
      {},
      {},
      1000,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("No extension code found");
  });

  it("returns failure when handler does not exist", async () => {
    process.env["EXTENSION_ALLOW_INLINE_SOURCE"] = "true";
    const runner = new ExtensionRunner();
    const result = await runner.executeHook(
      "ext-4",
      "missingHook",
      {},
      {
        source: `module.exports = {};`,
      },
      1000,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("supports CommonJS exports.* style handlers", async () => {
    process.env["EXTENSION_ALLOW_INLINE_SOURCE"] = "true";
    const runner = new ExtensionRunner();
    const result = await runner.executeHook(
      "ext-6",
      "myHook",
      { value: 7 },
      {
        source: `
          exports.myHook = (event) => ({ value: event.value });
        `,
      },
      1000,
    );

    expect(result.success).toBe(true);
    expect(result.result).toEqual({ value: 7 });
  });

  it("rejects inline source when not explicitly enabled", async () => {
    process.env["EXTENSION_ALLOW_INLINE_SOURCE"] = "false";
    const runner = new ExtensionRunner();
    const result = await runner.executeHook(
      "ext-5",
      "onRuleTriggered",
      { value: 1 },
      {
        source: "module.exports = () => ({ ok: true });",
      },
      1000,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Inline extension source is disabled");
  });
});

