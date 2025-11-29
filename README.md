# Dev Toolbox

Dev Toolbox is a desktop helper application built with **Tauri + React** that bundles a set of small productivity tools for developers.

Current tools include:

- **Task / Branch / PR helper**
  - Store tasks in a local SQLite database.
  - Generate consistent Git branch names and PR titles from task metadata.
  - View the history of created tasks.
- **XML Formatter**
  - format and fix xml soap response
- **Barcode & QR Code generator**
  - Generate **QR Code**, **EAN‑13**, **DataMatrix** and **Code128** barcodes.
  - Export to **SVG** or **PNG**.
  - Adjustable on‑screen preview size for better readability.
  - **Single** mode (one code at a time) and **Multi** mode (batch generation).
  - Multi mode supports:
    - One value per line, with a shared code type.
    - JSON list with individual `text` + `type` per item.
  - Local **history** of generation actions stored in SQLite, with:
    - Searchable list of entries.
    - View‑only payload preview.
    - Duplicate a past state back into the editor.
    - Delete history entries.

The app is designed as a personal, offline‑first toolbox that runs as a native desktop app using Tauri’s lightweight Rust backend.

---

## Tech stack

- **Frontend**
  - React + TypeScript
  - Tauri React template
  - Tailwind CSS & shadcn/ui components
  - `@tauri-apps/api` for invoking Rust commands
- **Backend (Tauri)**
  - Rust
  - `rusqlite` for local SQLite databases
  - `quickcodes` for QR & EAN‑13 generation
  - `datamatrix` crate for DataMatrix generation
  - `barcoders` crate for Code128
  - Custom modules:
    - `db.rs` – SQLite connection + migration helpers
    - `tasks.rs` (or similar) – task save/load commands
    - `barcodes.rs` – barcode generation logic
    - `codegen_history.rs` – history persistence for the code generator

---

## Project structure (high‑level)

```text
dev-toolbox/
├─ src/                      # React frontend
│  ├─ components/
│  │  ├─ code-generator/     # Code generator UI & types
│  │  │  ├─ CodeGenerator.tsx
│  │  │  ├─ CodegenHistory.tsx
│  │  │  └─ codegen-types.ts
│  │  └─ ...                 # Other shared components
│  ├─ hooks/
│  │  └─ use-barcode.ts      # Hook that wraps Tauri barcode command
│  └─ ...
├─ src-tauri/
│  ├─ src/
│  │  ├─ main.rs
│  │  ├─ barcodes.rs         # generate_barcode Tauri command
│  │  ├─ db.rs               # get_db() and DB path helpers
│  │  ├─ tasks.rs            # save_task / get_tasks
│  │  ├─ codegen_history.rs  # save_codegen_state / get_codegen_history / delete
│  │  └─ ...
│  ├─ Cargo.toml
│  └─ tauri.conf.json
└─ package.json
```

_(File names may differ slightly depending on how you organized the modules, but the idea is the same.)_

---

## Getting started

### Prerequisites

- **Node.js** (18+ recommended)
- **Rust** (stable toolchain installed via `rustup`)
- Tauri prerequisites for your OS (see the official Tauri docs).

### Install dependencies

From the project root:

```bash
# Install frontend / JS deps
npm install

# (Rust deps are handled by Cargo automatically on first build)
```

### Run in development

```bash
cargo tauri dev
```

This will:

- Run `npm run dev` for the React frontend (`beforeDevCommand` in `tauri.conf.json`).
- Start the Tauri shell and load the app from `http://localhost:1420`.

### Build a release bundle

```bash
cargo tauri build
```

This produces native binaries / installers in `src-tauri/target/release/` according to your platform (DMG/APP for macOS, MSI/EXE for Windows, etc.).

---

## Databases & persistence

The app uses **local SQLite** files, created on first use.

### Task database

Tasks are stored in a SQLite file (e.g. `tasks.db`) with a schema similar to:

```sql
CREATE TABLE IF NOT EXISTS tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  number       TEXT NOT NULL,
  feature_type TEXT NOT NULL,
  branch       TEXT NOT NULL,
  pr_title     TEXT NOT NULL,
  created_at   TEXT NOT NULL
);
```

Rust side (simplified):

```rust
pub fn get_db() -> Result<Connection> {
    let conn = Connection::open("tasks.db")?;
    conn.execute(/* CREATE TABLE IF NOT EXISTS ... */, [])?;
    Ok(conn)
}
```

### Code generator history database

The code generator history uses a separate table (often in its own DB file) containing:

- `id` – numeric primary key
- `mode` – `"single"` or `"multi"`
- `summary` – short human‑readable description
- `payload` – JSON blob with the original state
- `created_at` – ISO timestamp

Tauri commands exposed:

- `save_codegen_state(mode, summary, payload)`
- `get_codegen_history()`
- `delete_codegen_entry(id)`

The React `CodegenHistory` component consumes these commands to display a searchable history list and a detailed payload viewer, and to load a past state back into the UI.

> **Note**: During development, code changes in the Rust or React side may recreate or migrate the DB. For a clean slate, you can safely delete the local `.db` files while the app is closed.

---

## Barcode generation details

### QR Code & EAN‑13

Handled by [`quickcodes`](https://crates.io/crates/quickcodes):

- QR is generated directly from the input string.
- EAN‑13 is _normalized_:
  - If you enter 12 digits → the check digit is computed automatically.
  - If you enter 13 digits → the check digit is verified; invalid numbers return an error.

### DataMatrix

Handled by the [`datamatrix`](https://crates.io/crates/datamatrix) crate:

- The Rust backend uses `DataMatrix::encode` and draws a crisp SVG manually, adding a quiet zone around the symbol for better scanning.
- SVG is returned as a `data:image/svg+xml;utf8,...` URL to the frontend.

### Code128

Handled by [`barcoders`](https://crates.io/crates/barcoders):

- Backend uses `barcoders::sym::code128::Code128`.
- Input is sanitized on the React side (only printable ASCII, without control characters) before being sent to Rust.
- For PNG, bar width (`xdim`) and height are tuned to be easily scannable by mobile devices and hardware scanners.
- For SVG, a fixed bar height is used; the React UI lets you scale the preview visually without distorting the bars in the exported image.

---

## History view

The **History** tab shows:

- Left side: list of history entries (ID, mode, summary, timestamp).
- Right side: details of the selected entry:
  - Created date
  - JSON payload (pretty‑printed, view‑only)
  - Button to **duplicate** the state into the editor.
  - Buttons to **delete** an entry.

Long payloads are shown inside a scrollable `<pre>` block so they don’t break the layout.

---

## Error handling & debugging

- Errors from the Rust backend are converted to strings and displayed in the UI.
- For deeper debugging, you can run with backtraces enabled:

  ```bash
  RUST_BACKTRACE=1 cargo tauri dev
  ```

- The backend uses `eprintln!` for debug logging in places like barcode generation and history persistence; these logs appear in the terminal where you launched `cargo tauri dev`.

---

## Future ideas

Some possible future additions:

- More helpers in the toolbox (e.g. JSON/YAML formatter, regex tester, UUID generator).
- Export/import of history as JSON files.
- Settings page (default barcode types, default branch/PR templates, theme tweaks).
- Multi‑window support in Tauri (separate window for barcode generation vs. tasks).

---

## License

Personal/internal project. If you plan to reuse parts of this codebase, consider adding a proper license (MIT/Apache‑2.0/etc.) that matches how you want others to use it.
