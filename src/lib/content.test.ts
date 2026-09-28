import { describe, expect, it } from "vitest";
import { safeJsonLd } from "./content";

describe("safeJsonLd", () => {
  it("escapes closing script tags so stored content cannot break out of JSON-LD blocks", () => {
    const out = safeJsonLd({ text: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(out).toContain("\\u003c/script>");
    // Still parses as valid JSON with the original content intact.
    expect(JSON.parse(out)).toEqual({ text: "</script><script>alert(1)</script>" });
  });
});
