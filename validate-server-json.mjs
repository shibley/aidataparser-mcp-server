/**
 * Static checks on server.json, run by `npm test` and as the first CI step
 * before anything is published to registry.modelcontextprotocol.io.
 *
 * Every rule here exists because one of the sibling *-mcp-server repos hit it
 * for real:
 *
 *  - DESCRIPTION_MAX: aisotools-mcp-server v0.1.0 was REJECTED with a 422 by
 *    the registry because its description ran past 100 characters (fixed in
 *    ccfaf88). The publish step is the last thing in the workflow, so a 422
 *    there costs a whole deploy window; a length check costs nothing.
 *  - The io.github.<owner> namespace is granted by GitHub OIDC from the
 *    workflow's own repository identity. If `name`'s owner and
 *    `repository.url`'s owner ever drift apart, `mcp-publisher publish` fails
 *    with an opaque authorization error rather than a naming error.
 *  - aisotools-mcp-server spent 36h publishing a stale claim from a clone whose
 *    `main` had diverged from origin. Pinning repository.url to the checked-out
 *    remote is the cheap half of not repeating that.
 *  - The whole point of the record is `remotes[0].url`. Advertising a remote on
 *    a host we do not own, or over plain http, is worse than not publishing.
 */
import { readFileSync } from "node:fs";

export const DESCRIPTION_MAX = 100;

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const GITHUB_NAME = /^io\.github\.([A-Za-z0-9-]+)\/([a-z0-9][a-z0-9-]*)$/;

function githubOwner(url) {
  const m = /^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(
    url ?? ""
  );
  return m ? { owner: m[1], repo: m[2] } : null;
}

function origin(url) {
  try {
    const u = new URL(url);
    return { protocol: u.protocol, host: u.host };
  } catch {
    return null;
  }
}

/**
 * @param {unknown} server parsed server.json
 * @param {{ remoteUrl?: string|null }} [ctx] the repo's actual git remote, when known
 * @returns {string[]} one message per violation; empty means valid
 */
export function validateServerJson(server, ctx = {}) {
  const errors = [];
  if (!server || typeof server !== "object" || Array.isArray(server)) {
    return ["server.json must be a JSON object."];
  }

  if (
    typeof server.$schema !== "string" ||
    !server.$schema.startsWith("https://static.modelcontextprotocol.io/schemas/")
  ) {
    errors.push(
      "$schema must pin a https://static.modelcontextprotocol.io/schemas/... server schema."
    );
  }

  const nameMatch = GITHUB_NAME.exec(String(server.name ?? ""));
  if (!nameMatch) {
    errors.push(
      `name must look like io.github.<owner>/<slug> (got ${JSON.stringify(server.name)}).`
    );
  }

  if (typeof server.title !== "string" || !server.title.trim()) {
    errors.push("title must be a non-empty string.");
  }

  if (typeof server.description !== "string" || !server.description.trim()) {
    errors.push("description must be a non-empty string.");
  } else if (server.description.length > DESCRIPTION_MAX) {
    errors.push(
      `description is ${server.description.length} chars; the registry caps it at ${DESCRIPTION_MAX} and returns 422 above that.`
    );
  }

  if (!SEMVER.test(String(server.version ?? ""))) {
    errors.push(`version must be semver (got ${JSON.stringify(server.version)}).`);
  }

  const site = origin(server.websiteUrl);
  if (!site || site.protocol !== "https:") {
    errors.push(`websiteUrl must be an https URL (got ${JSON.stringify(server.websiteUrl)}).`);
  }

  const repo = githubOwner(server.repository?.url);
  if (!repo) {
    errors.push(
      `repository.url must be a https://github.com/<owner>/<repo> URL (got ${JSON.stringify(
        server.repository?.url
      )}).`
    );
  } else if (server.repository?.source !== "github") {
    errors.push('repository.source must be "github".');
  }

  if (nameMatch && repo && nameMatch[1].toLowerCase() !== repo.owner.toLowerCase()) {
    errors.push(
      `name namespace io.github.${nameMatch[1]} does not match repository owner ${repo.owner}; GitHub OIDC grants the namespace from the repository identity, so publish would fail authorization.`
    );
  }

  if (ctx.remoteUrl) {
    const actual = githubOwner(ctx.remoteUrl.replace(/\.git$/, ""));
    if (actual && repo && (actual.owner !== repo.owner || actual.repo !== repo.repo)) {
      errors.push(
        `repository.url points at ${repo.owner}/${repo.repo} but this checkout's origin is ${actual.owner}/${actual.repo}.`
      );
    }
  }

  const remotes = server.remotes;
  if (!Array.isArray(remotes) || remotes.length === 0) {
    errors.push("remotes must list at least one entry — the hosted endpoint is the whole record.");
  } else {
    remotes.forEach((r, i) => {
      if (r?.type !== "streamable-http" && r?.type !== "sse") {
        errors.push(`remotes[${i}].type must be "streamable-http" or "sse" (got ${JSON.stringify(r?.type)}).`);
      }
      const rem = origin(r?.url);
      if (!rem || rem.protocol !== "https:") {
        errors.push(`remotes[${i}].url must be an https URL (got ${JSON.stringify(r?.url)}).`);
      } else if (site && rem.host !== site.host) {
        errors.push(
          `remotes[${i}].url host ${rem.host} is not the websiteUrl host ${site.host} — do not advertise a remote on a host this record does not own.`
        );
      }
    });
  }

  return errors;
}

export function readServerJson(path = new URL("./server.json", import.meta.url)) {
  return JSON.parse(readFileSync(path, "utf8"));
}
