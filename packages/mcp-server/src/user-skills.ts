// User-authored skills — personal workflow documents loaded at runtime from
// ~/.figma-relai/skills/*.md and exposed as MCP prompts with a "user:" prefix.
// The frontmatter carries the future sharing format from day one: layer
// declares what stratum of knowhow this is (physical API facts / craft
// patterns / brand voice), provenance says where it was earned.

import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface UserSkill {
  name: string;
  description: string;
  layer?: "physical" | "craft" | "voice";
  provenance?: string;
  text: string;
}

export interface SkillParseResult {
  skill?: UserSkill;
  error?: string;
}

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const LAYERS = new Set(["physical", "craft", "voice"]);

/** Pure frontmatter parser — `--- key: value ---` block, body follows. */
export function parseSkillFrontmatter(raw: string): SkillParseResult {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { error: "missing frontmatter block (--- name/description ---)" };
  }
  const fields: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z_]+)\s*:\s*(.+?)\s*$/);
    if (kv) fields[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
  }
  if (!fields.name || !NAME_RE.test(fields.name)) {
    return { error: `invalid or missing name (kebab-case, got "${fields.name ?? ""}")` };
  }
  if (!fields.description) {
    return { error: "missing description" };
  }
  if (fields.layer && !LAYERS.has(fields.layer)) {
    return { error: `unknown layer "${fields.layer}" (physical | craft | voice)` };
  }
  const body = match[2].trim();
  if (!body) return { error: "empty body" };
  return {
    skill: {
      name: fields.name,
      description: fields.description,
      layer: fields.layer as UserSkill["layer"],
      provenance: fields.provenance,
      text: body,
    },
  };
}

export function userSkillsDir(): string {
  return join(homedir(), ".figma-relai", "skills");
}

export interface LoadedUserSkills {
  skills: UserSkill[];
  errors: Array<{ file: string; error: string }>;
}

export function loadUserSkills(dir: string = userSkillsDir()): LoadedUserSkills {
  const out: LoadedUserSkills = { skills: [], errors: [] };
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  } catch {
    return out; // no directory — user skills are optional
  }
  for (const file of files.sort()) {
    try {
      const { skill, error } = parseSkillFrontmatter(readFileSync(join(dir, file), "utf8"));
      if (skill) out.skills.push(skill);
      else out.errors.push({ file, error: error ?? "unparseable" });
    } catch (e) {
      out.errors.push({ file, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}
