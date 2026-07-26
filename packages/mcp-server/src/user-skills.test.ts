import { describe, expect, test } from "bun:test";
import { parseSkillFrontmatter } from "./user-skills.js";

const doc = (fm: string, body = "Do the thing step by step.") => `---\n${fm}\n---\n${body}`;

describe("parseSkillFrontmatter", () => {
  test("parses a full skill", () => {
    const { skill, error } = parseSkillFrontmatter(
      doc("name: gin-furniture\ndescription: Page furniture recipe\nlayer: craft\nprovenance: gin 2026-07")
    );
    expect(error).toBeUndefined();
    expect(skill).toMatchObject({
      name: "gin-furniture",
      description: "Page furniture recipe",
      layer: "craft",
      provenance: "gin 2026-07",
    });
    expect(skill?.text).toContain("step by step");
  });

  test("minimal skill needs only name + description", () => {
    const { skill } = parseSkillFrontmatter(doc("name: quick\ndescription: q"));
    expect(skill?.layer).toBeUndefined();
  });

  test("rejects missing frontmatter", () => {
    expect(parseSkillFrontmatter("just a body").error).toContain("frontmatter");
  });

  test("rejects bad name", () => {
    expect(parseSkillFrontmatter(doc("name: Bad Name\ndescription: x")).error).toContain("name");
  });

  test("rejects unknown layer", () => {
    expect(parseSkillFrontmatter(doc("name: a\ndescription: x\nlayer: vibes")).error).toContain("layer");
  });

  test("rejects empty body", () => {
    expect(parseSkillFrontmatter(doc("name: a\ndescription: x", "  ")).error).toContain("body");
  });

  test("strips quotes around values", () => {
    const { skill } = parseSkillFrontmatter(doc('name: a\ndescription: "quoted words"'));
    expect(skill?.description).toBe("quoted words");
  });
});
