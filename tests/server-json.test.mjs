import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  validateServerJson,
  readServerJson,
  DESCRIPTION_MAX,
} from "../validate-server-json.mjs";

const real = readServerJson();

function withOverride(patch) {
  return { ...structuredClone(real), ...patch };
}

test("the committed server.json is publishable as-is", () => {
  assert.deepEqual(validateServerJson(real), []);
});

test("the committed server.json matches this checkout's git remote", () => {
  let remoteUrl = null;
  try {
    remoteUrl = execFileSync("git", ["remote", "get-url", "origin"], {
      encoding: "utf8",
      cwd: new URL("..", import.meta.url),
    }).trim();
  } catch {
    // A fresh clone with no origin yet: nothing to cross-check.
  }
  assert.deepEqual(validateServerJson(real, { remoteUrl }), []);
});

test("a description past the registry cap is rejected (aisotools 422)", () => {
  const long = "x".repeat(DESCRIPTION_MAX + 1);
  const errors = validateServerJson(withOverride({ description: long }));
  assert.ok(
    errors.some((e) => e.includes("422")),
    `expected a cap violation, got ${JSON.stringify(errors)}`
  );
});

test("a description exactly at the cap is allowed", () => {
  const exact = "x".repeat(DESCRIPTION_MAX);
  assert.deepEqual(validateServerJson(withOverride({ description: exact })), []);
});

test("namespace owner must match the repository owner", () => {
  const errors = validateServerJson(
    withOverride({ name: "io.github.someoneelse/aidataparser" })
  );
  assert.ok(
    errors.some((e) => e.includes("OIDC")),
    `expected a namespace mismatch, got ${JSON.stringify(errors)}`
  );
});

test("a remote on a host the record does not own is rejected", () => {
  const errors = validateServerJson(
    withOverride({
      remotes: [{ type: "streamable-http", url: "https://example.com/v1/mcp" }],
    })
  );
  assert.ok(
    errors.some((e) => e.includes("does not own")),
    `expected a host mismatch, got ${JSON.stringify(errors)}`
  );
});

test("a plain-http remote is rejected", () => {
  const errors = validateServerJson(
    withOverride({
      remotes: [{ type: "streamable-http", url: "http://aidataparser.com/v1/mcp" }],
    })
  );
  assert.ok(errors.some((e) => e.includes("https")), JSON.stringify(errors));
});

test("an empty remotes list is rejected", () => {
  const errors = validateServerJson(withOverride({ remotes: [] }));
  assert.ok(errors.some((e) => e.includes("whole record")), JSON.stringify(errors));
});

test("a non-semver version is rejected", () => {
  assert.ok(validateServerJson(withOverride({ version: "v1" })).length > 0);
  assert.ok(validateServerJson(withOverride({ version: "0.1" })).length > 0);
  assert.deepEqual(validateServerJson(withOverride({ version: "1.2.3" })), []);
});

test("an unpinned $schema is rejected", () => {
  const errors = validateServerJson(withOverride({ $schema: "https://example.com/s.json" }));
  assert.ok(errors.some((e) => e.includes("$schema")), JSON.stringify(errors));
});

test("a non-object server.json is rejected without throwing", () => {
  assert.equal(validateServerJson(null).length, 1);
  assert.equal(validateServerJson([]).length, 1);
  assert.equal(validateServerJson("{}").length, 1);
});
