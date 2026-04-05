import { describe, expect, it } from "vitest";
import { describeNgrokErrorPage } from "./ngrok-error-page.js";

describe("describeNgrokErrorPage", () => {
  it("returns null for empty or non-ngrok body", () => {
    expect(describeNgrokErrorPage("")).toBeNull();
    expect(describeNgrokErrorPage("not html")).toBeNull();
  });

  it("detects ERR_NGROK_725 bandwidth limit", () => {
    const html = `<noscript>(ERR_NGROK_725)</noscript><html>ngrok</html>`;
    const msg = describeNgrokErrorPage(html);
    expect(msg).toContain("ERR_NGROK_725");
    expect(msg).toContain("bandwidth");
  });

  it("detects generic ERR_NGROK codes", () => {
    const msg = describeNgrokErrorPage(`<body>ERR_NGROK_103 something</body>`);
    expect(msg).toContain("ERR_NGROK_103");
  });
});
