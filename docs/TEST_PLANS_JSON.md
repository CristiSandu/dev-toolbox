# Sharing Test Plans as JSON

Use a project's **… → Export project JSON** to share all its saved cases. The app asks you to resolve any unsaved case changes first. Use **Export case** in an open case, or its explorer menu, to share just that case. An open case exports its current content, including unsaved edits, without saving a revision.

Choose **Import JSON**, review the title/count, and import as new copies. Project files create a new project. Single-case files can be added to an existing project or a new named project. Existing cases and history are never replaced; each imported case starts at revision 1. Validation or database errors roll back the entire import.

Image URLs are preserved as URLs, not downloaded attachments. Generated codes regenerate on the destination device. Revision history and database IDs are local and excluded.

## Version 1 format

Every file has `format: "dev-toolbox-test-plans"`, `version: 1`, and exactly one of `project` or `testCase`.

A single-case file:

```json
{
  "format": "dev-toolbox-test-plans",
  "version": 1,
  "testCase": {
    "schemaVersion": 1,
    "title": "Scan a package",
    "descriptionMarkdown": "# Package scan\n\n- [ ] Verify the product",
    "lists": [
      {
        "id": "products",
        "name": "Products",
        "products": [
          {
            "id": "package-1",
            "title": "Package",
            "text": "000123",
            "type": "Code128",
            "imageUrl": "https://example.com/product.png",
            "description": "Verify this package"
          }
        ]
      }
    ]
  }
}
```

A project file replaces `testCase` with `project: { "name": "Project name", "cases": [ /* case contents as above */ ] }`. Empty projects use `cases: []`.

All case fields shown above are required. Empty strings are allowed for Markdown and optional product metadata. Keep encoded values as strings to preserve leading zeroes. Supported types: `QR Code`, `EAN-13`, `DataMatrix`, `Code128`. List and product IDs must be nonempty and unique within each case; the same source IDs may appear in different copied cases.

Limits: 20 MB per file, 1,000 cases per project, 2 MB per case, 1–100 lists per case, 5,000 products per case, 500 KB Markdown, 32 KB encoded values/product descriptions, and 200 characters for case titles/list names/project names/product titles. Image URLs must be absolute HTTP(S), at most 8,192 bytes, and contain no credentials. Unsupported versions, unknown fields, malformed types, duplicate IDs, and invalid URLs are rejected before import. Invalid barcode values are allowed as test fixtures and display generation errors when selected.
