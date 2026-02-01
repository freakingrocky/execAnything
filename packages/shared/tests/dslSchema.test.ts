import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("DSL schema", () => {
  it("includes web assertion kinds for equality checks", () => {
    const schemaPath = path.resolve(__dirname, "../src/dsl/schema.step.json");
    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
    const kinds: string[] = schema.$defs.Assertion.properties.kind.enum ?? [];

    expect(kinds).toContain("web_text_equals");
    expect(kinds).toContain("web_url_equals");
    expect(kinds).toContain("web_exists");
  });
});
