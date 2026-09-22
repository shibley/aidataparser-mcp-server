/**
 * Ask registry.modelcontextprotocol.io what version of this server is already
 * published, and print PUBLISH or SKIP.
 *
 * Why this exists: the sibling repos publish on a version TAG, but nothing in
 * `scripts/deploy-batch.sh` pushes tags (`git push origin "$branch"`, no
 * --follow-tags), so a tag-only trigger would never fire from the batch that
 * actually ships this repo. This repo therefore publishes on a push to main —
 * which means the workflow runs on every commit, including README edits, and
 * the registry rejects a republish of an existing version. Making the workflow
 * idempotent here keeps those runs green instead of red-on-noise.
 *
 * Exit code is always 0; the decision is on stdout as `decision=PUBLISH|SKIP`
 * so a workflow step can read it. A registry that is unreachable resolves to
 * PUBLISH — publishing is itself idempotent-checked server-side (it 409s), and
 * a flaky read must not silently skip a real release.
 */
import { readServerJson } from "./validate-server-json.mjs";

const server = readServerJson();
const endpoint = `https://registry.modelcontextprotocol.io/v0/servers?search=${encodeURIComponent(
  server.name
)}`;

let published = null;
try {
  const res = await fetch(endpoint, { signal: AbortSignal.timeout(20_000) });
  if (res.ok) {
    const body = await res.json();
    const mine = (body.servers ?? []).filter((s) => s.server?.name === server.name);
    // The registry keeps every version; only one carries isLatest.
    const latest =
      mine.find((s) => s._meta?.["io.modelcontextprotocol.registry/official"]?.isLatest) ??
      mine.at(-1);
    published = latest?.server?.version ?? null;
  } else {
    console.log(`registry read failed: HTTP ${res.status}`);
  }
} catch (e) {
  console.log(`registry read failed: ${e.message}`);
}

console.log(`local=${server.version} published=${published ?? "(none)"}`);
const decision = published === server.version ? "SKIP" : "PUBLISH";
console.log(`decision=${decision}`);
