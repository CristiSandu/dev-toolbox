# Test Plans MCP server

## Connect an installed app

Install Dev Toolbox, then open **Test Plans → MCP settings**. All fifteen tools,
including full-case and codes-only PDF export, are included in the installation.
You do not need Node, Rust, npm, or the source checkout.

Use **Check connection** to verify a temporary server, then **Copy** its client
configuration and paste it into your MCP client. The client starts the server
automatically. The app can be closed while agents use its saved Test Plans.
No port or HTTP server needs to be started.

For a standard macOS installation, the configuration is:

```json
{
  "mcpServers": {
    "dev-toolbox": {
      "command": "/Applications/dev-toolbox.app/Contents/MacOS/dev-toolbox-mcp",
      "args": []
    }
  }
}
```

On Windows, use the `dev-toolbox-mcp.exe` path copied by the installed app.
If a client presents separate fields, choose STDIO, put the executable path in
Command, leave Arguments and Environment variables empty, and leave Working
directory empty. No system PATH configuration is required.

The status reports the last check, not active agent connections. Stdio processes
are owned by the clients that launch them. App updates replace the bundled MCP
server, private runtime, and PDF renderer together. Keep the app at the same
installation path and reconnect your MCP client after an update. If you move the
app, copy the new configuration. Existing connections pointing to a source
checkout continue to use that checkout; replace them once with the installed
configuration to follow app updates.

## Development and packaging

Developers need the usual app prerequisites and Node 22.12+. After `npm ci`, run:

```sh
npm run build:mcp
```

This builds the native helper and stages its matching private runtime and bundled
renderer. Development MCP settings can then use those staged files. The source
entrypoint remains usable with system Node:

```sh
node --experimental-strip-types scripts/test-plans-mcp.mjs /absolute/path/to/dev-toolbox-mcp
```

`dev-toolbox-mcp --native` is the internal fourteen-tool backend used by the PDF
bridge; the public command without arguments always requires the complete bundled
runtime and exposes fifteen tools. It fails clearly if components are missing.

Build installers through `npm run tauri build -- ...`. The npm wrapper prepares
the matching native sidecars, bundles all PDF JavaScript dependencies and fonts,
and applies `src-tauri/tauri.mcp.conf.json` to package them. Build on a native
runner for each supported target; the script refuses to copy a runtime with the
wrong architecture. A direct `npx tauri build` bypasses this packaging step.
Third-party notices and the runtime version are included under the app's `mcp`
resources. Keep private runtime security updates part of the regular app release
process; changing a system Node installation does not change the bundled runtime.

CI runs `scripts/smoke-installed-mcp.mjs` against the packaged macOS helper and the
Windows staging layout. It relocates components to a directory containing spaces,
clears Node from PATH, uses an isolated database, and checks discovery, all barcode
formats, PNG product images, both PDF modes, revisions/conflicts, and JSON transfer.
For an explicit isolated MCP profile, set `DEV_TOOLBOX_MCP_DATABASE` to a database
file path; omit it for the normal app database. Tests never write to installed data.

The server negotiates MCP 2024-11-05 through 2025-11-25 and writes only protocol
messages to stdout.

## Tools

- Projects: `list_test_projects`, `save_test_project`, `delete_test_project`.
- Cases: `list_test_cases`, `save_test_case`, `delete_test_case`.
- History: `get_test_case_revisions`.
- Portable JSON: `export_test_project`, `export_test_case`, `read_test_plan_import`, `import_test_plan`.
- Assets: `generate_barcode`, `fetch_test_product_image`, `save_test_case_pdf`.
- PDF rendering: `export_test_case_pdf` with `caseId`, `filePath`, and optional `codesOnly`.

Tool discovery supplies complete input schemas. `save_test_case` accepts the complete
case document, including Markdown, ordered lists, and ordered products with IDs,
titles, barcode types and values, image URLs, and descriptions. Use it to add,
remove, reorder, or duplicate lists and products. To duplicate a case, omit its
case ID and use revision 0. To restore a revision, save its snapshot using the
current case revision. JSON/line product input can be converted by the agent to
the product array in the schema.

Example case creation after creating project 1:

```json
{
  "name": "save_test_case",
  "arguments": {
    "projectId": 1,
    "expectedRevision": 0,
    "content": {
      "schemaVersion": 1,
      "title": "Checkout scanning",
      "descriptionMarkdown": "- [ ] Scan each product",
      "lists": [{
        "id": "checkout",
        "name": "Products",
        "products": [{
          "id": "sample",
          "title": "Sample QR",
          "text": "sample-001",
          "type": "QR Code",
          "imageUrl": "",
          "description": "Verify the scanned value"
        }]
      }]
    }
  }
}
```

## Data and limits

The server uses the same `tasks.db` in the platform's application data directory
under `com.sanduilie-cristian.dev-toolbox`. It preserves the app's validation,
transactions, revision history, and optimistic concurrency checks. Before editing,
read the latest saved case and pass its revision as `expectedRevision`. A stale
write fails without overwriting the newer version. Reload saved cases in the GUI
to see agent edits; unsaved UI drafts are not exposed.

Connecting a client grants it permission to modify and permanently delete saved
test plans, read import files, write export files at supplied paths, and fetch
HTTP(S) product images using this machine's access. Use trusted clients.

`export_test_case_pdf` uses the shared app renderer for full-case and codes-only
PDFs. Its result reports the saved revision, failed barcodes, and omitted images.
PNG and JPEG product images are embedded; WebP/GIF are counted as unavailable.
`save_test_case_pdf` alternatively saves PDF bytes supplied by the client.
Preview, clipboard, file dialogs, drafts, and selection remain GUI features.
This server provides backend feature access, not GUI automation.

Protocol reference: [MCP tools specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).
