import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readmeToolNames, toolTableDrift } from "../tool-drift.mjs";
import { readServerJson } from "../validate-server-json.mjs";

const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
// Recorded from production's tools/list; check-remote.mjs runs the same
// comparison against the live endpoint before every publish.
const live = JSON.parse(
  readFileSync(new URL("./fixtures/live-tools.json", import.meta.url), "utf8")
).tools;

test("the README tool table matches the recorded live tools/list", () => {
  assert.deepEqual(toolTableDrift(readme, live), []);
});

test("the README leads with the keyless trial, not a key", () => {
  // try_parse is the first live tool and the only one that extracts without a
  // key; a reader who stops at the first table row should see it.
  assert.equal(live[0], "try_parse");
  assert.equal(readmeToolNames(readme)[0], "try_parse");
});

test("the registry description sells the keyless trial", () => {
  // The registry blurb is the only text most catalogs show. "50 free credits"
  // still requires a key; the thing an agent can do in one call is try it.
  assert.match(readServerJson().description, /no key/i);
});

test("a tool missing from the table is reported", () => {
  const errs = toolTableDrift("## Tools\n\n| `parse_text` | x |\n", ["parse_text", "try_parse"]);
  assert.deepEqual(errs, ["live tool `try_parse` is missing from the README tool table."]);
});

test("a documented tool the server dropped is reported", () => {
  const errs = toolTableDrift("## Tools\n\n| `gone` | x |\n| `parse_text` | x |\n", ["parse_text"]);
  assert.deepEqual(errs, ["README documents `gone`, which the live server does not list."]);
});

test("only rows inside the ## Tools section count", () => {
  const md = "## Tools\n\n| Tool | Cost |\n| --- | --- |\n| `a` | x |\n\n## Other\n\n| `b` | x |\n";
  assert.deepEqual(readmeToolNames(md), ["a"]);
});

test("a README with no tool table is a drift, not a pass", () => {
  assert.equal(toolTableDrift("# nothing here", ["a"]).length, 1);
});
