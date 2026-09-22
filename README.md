# AIDataParser MCP server

The official [Model Context Protocol](https://modelcontextprotocol.io) registry
record for **AIDataParser** — a credit-based data-extraction API that turns
PDFs, images and messy text into schema-guaranteed JSON.

There is no server code in this repo. The MCP server is **hosted**: it lives at
`https://aidataparser.com/v1/mcp` and speaks JSON-RPC 2.0 over Streamable HTTP.
This repo holds the `server.json` that is the source of our record in
[registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io),
the canonical upstream every downstream MCP catalog syncs from.

## Add it to your client

```json
{
  "mcpServers": {
    "aidataparser": {
      "type": "http",
      "url": "https://aidataparser.com/v1/mcp",
      "headers": { "Authorization": "Bearer adp_live_..." }
    }
  }
}
```

Get a key (50 free credits, no card):

```bash
curl -X POST https://aidataparser.com/v1/keys \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com"}'
```

`list_schemas` and `validate` are free and need **no key**, so a client can add
the server and get something useful back before signing up.

## Tools

| Tool | Cost | What it does |
| --- | --- | --- |
| `parse_document` | 1 credit | PDF or image (`url` or `base64`) → JSON matching your schema |
| `parse_text` | 1 credit | Raw/messy text → JSON matching your schema |
| `infer_schema` | 1 credit | One sample → a reusable JSON Schema |
| `validate` | free, no key | Check a JSON value against a schema |
| `check_credits` | free | Credits remaining on the key |
| `list_schemas` | free, no key | Built-in templates (invoice, receipt, resume, …) |

Credit packs: <https://aidataparser.com/pricing>

## Publishing

`.github/workflows/publish-mcp.yml` publishes on a push to `main` using GitHub
OIDC — no secrets. Bump `version` in `server.json` to cut a release; a push that
does not change the version is a no-op.

Before it publishes, the workflow runs two gates:

- `npm test` — static checks on `server.json` (`validate-server-json.mjs`). Each
  rule maps to a real failure from a sibling repo, e.g. the registry's 100-char
  description cap that 422'd `aisotools-mcp-server` v0.1.0.
- `npm run check:remote` — a live `initialize` + `tools/list` handshake against
  the URL about to be advertised. A registry record pointing at a dead endpoint
  is worse than no record.

Both are runnable locally.
