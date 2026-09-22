/**
 * Pre-publish liveness gate.
 *
 * The registry record for this server is a POINTER: one `remotes[0].url`. If
 * that endpoint is down, 404ing or not speaking MCP, the record sends every
 * agent that finds us into a dead tool — which is strictly worse than being
 * absent from the registry. So before anything is published, handshake the URL
 * we are about to advertise and require a real `initialize` result back.
 *
 * It also prints the tool list, because the second failure mode is subtler: the
 * endpoint answers `initialize` from an old deploy that does not yet have the
 * tools the description sells.
 *
 * Usage: node check-remote.mjs  (exit 0 = safe to publish)
 */
import { validateServerJson, readServerJson } from "./validate-server-json.mjs";

const TIMEOUT_MS = 30_000;

async function rpc(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      // Our own checks must never land in the agent-arrival numbers the
      // aidataparser repo reads with `npm run report:agents`.
      "x-aidp-probe": "1",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${url} returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  if (json.error) {
    throw new Error(`${url} returned JSON-RPC error: ${JSON.stringify(json.error)}`);
  }
  return json;
}

const server = readServerJson();
const staticErrors = validateServerJson(server);
if (staticErrors.length) {
  console.error("server.json is not publishable:");
  for (const e of staticErrors) console.error("  - " + e);
  process.exit(1);
}

const url = server.remotes[0].url;
console.log(`handshaking ${url}`);

const init = await rpc(url, {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "aidataparser-mcp-server/check-remote", version: "1" },
  },
});
const proto = init?.result?.protocolVersion;
if (!proto) {
  console.error("no protocolVersion in the initialize result:", JSON.stringify(init).slice(0, 400));
  process.exit(1);
}
console.log(`  initialize OK — protocol ${proto}, serverInfo ${JSON.stringify(init.result.serverInfo)}`);

const list = await rpc(url, { jsonrpc: "2.0", id: 2, method: "tools/list" });
const tools = list?.result?.tools;
if (!Array.isArray(tools) || tools.length === 0) {
  console.error("tools/list returned no tools — the record would advertise an empty server.");
  process.exit(1);
}
console.log(`  tools/list OK — ${tools.length} tool(s): ${tools.map((t) => t.name).join(", ")}`);
console.log(`ready to publish ${server.name} v${server.version}`);
