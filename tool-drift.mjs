/**
 * The README's tool table is the human-readable half of this registry record:
 * the registry itself carries only a 100-char description, and every catalog
 * that syncs from it (and every person who clicks through to the repo) reads
 * the tool list HERE. It is hand-written, so it drifts.
 *
 * It already had: aidataparser shipped `create_api_key` (da2a651) and the
 * keyless `try_parse` (aa3854f) — the ONLY tool that extracts anything without
 * a key — and this table listed neither, while telling readers the only no-key
 * tools were list_schemas and validate. The discovery surface was selling the
 * pre-trial product.
 *
 * `toolTableDrift` compares the table to a live `tools/list`, so check-remote
 * refuses to publish a record whose README advertises a different server than
 * the one it points at.
 */

/** Tool names in the first column of the README's `## Tools` table. */
export function readmeToolNames(readme) {
  const text = String(readme ?? "");
  const start = text.search(/^## Tools\s*$/m);
  if (start === -1) return [];
  const rest = text.slice(start).split("\n").slice(1);
  const end = rest.findIndex((l) => l.startsWith("## "));
  const names = [];
  for (const line of end === -1 ? rest : rest.slice(0, end)) {
    const m = /^\|\s*`([a-z_][a-z0-9_]*)`\s*\|/.exec(line.trim());
    if (m) names.push(m[1]);
  }
  return names;
}

/**
 * @param {string} readme README.md text
 * @param {string[]} liveTools names from a live tools/list
 * @returns {string[]} one message per drift; empty means the table matches
 */
export function toolTableDrift(readme, liveTools) {
  const documented = readmeToolNames(readme);
  if (documented.length === 0) return ["README has no `## Tools` table to check."];
  const doc = new Set(documented);
  const live = new Set(liveTools);
  const errors = [];
  for (const t of liveTools) {
    if (!doc.has(t)) errors.push(`live tool \`${t}\` is missing from the README tool table.`);
  }
  for (const t of documented) {
    if (!live.has(t)) errors.push(`README documents \`${t}\`, which the live server does not list.`);
  }
  return errors;
}
