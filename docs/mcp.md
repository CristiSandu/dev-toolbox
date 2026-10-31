# Test Plans MCP server

## Configure from the desktop app

Open **Test Plans → MCP settings**. The panel detects the native server beside the
app executable and the optional PDF bridge in the source checkout. Choose native
tools or PDF support, then use **Check connection** to start a temporary server,
verify its MCP handshake, and close it. **Copy** provides client configuration
with the detected absolute paths. Paste it into your MCP client and reconnect.
For PDF support, you can enter an absolute Node executable path when the desktop
app's PATH does not include Node.

The status is the result of the last check, not a count of connected agents.
Stdio server processes are started and owned by each agent client. The desktop
panel does not keep a background HTTP server running. If the server binary is
missing, the panel shows the expected path and build command. Packaged GUI
releases must include a sibling `dev-toolbox-mcp` executable (with `.exe` on
Windows), or use a separately built server with manual client configuration.

## Manual setup

Run `npm install` first (Node 22.12+ is required). Build the local stdio server (Rust and the platform's Tauri build dependencies are required):

```sh
cargo build --manifest-path src-tauri/Cargo.toml --bin dev-toolbox-mcp
```

Add this entry to any MCP client that supports stdio, replacing the absolute path:

```json
{
  "mcpServers": {
    "dev-toolbox": {
      "command": "node",
      "args": ["--experimental-strip-types", "/absolute/path/dev-toolbox/scripts/test-plans-mcp.mjs"]
    }
  }
}
```

The script defaults to the native debug binary in this checkout. To use a release
binary, build with `--release` and pass its absolute path as the script's next
argument. Use an absolute Node executable path if your client does not inherit PATH.
Keep the checkout and npm dependencies available to the script.

The native binary can also be configured directly as the MCP command with no
arguments, but it omits the additional PDF rendering tool.
No web server, port, credentials, or running app is required. The server negotiates MCP
2024-11-05 through 2025-11-25 and writes only protocol messages to stdout.

## Tools

- Projects: `list_test_projects`, `save_test_project`, `delete_test_project`.
- Cases: `list_test_cases`, `save_test_case`, `delete_test_case`.
- History: `get_test_case_revisions`.
- Portable JSON: `export_test_project`, `export_test_case`, `read_test_plan_import`, `import_test_plan`.
- Assets: `generate_barcode`, `fetch_test_product_image`, `save_test_case_pdf`.
- PDF rendering (Node entrypoint): `export_test_case_pdf` with `caseId`, `filePath`, and optional `codesOnly`.

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
