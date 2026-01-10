# Dev Toolbox

Dev Toolbox is a desktop helper application built with **Tauri 2 + React 19** that bundles a set of small productivity tools for developers.

---

## Getting started

### Prerequisites

- **Node.js** (18+ recommended)
- **Rust** (stable toolchain installed via `rustup`)
- Tauri prerequisites for your OS:
  - **macOS**: Xcode Command Line Tools
  - **Windows**: Microsoft Visual C++ Build Tools
  - **Linux**: System dependencies (see [Tauri prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites))

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

### Debug on macOS (quarantine)

If macOS flags the app as coming from an unidentified developer:

1. Locate the installed app bundle path (for example, `/Applications/Dev Toolbox.app` or `~/Applications/Dev Toolbox.app`).
2. Remove the quarantine attribute so Gatekeeper stops blocking it:
   ```bash
   sudo xattr -r -d com.apple.quarantine "/Applications/Dev Toolbox.app"
   ```
3. Launch the app again and approve the prompt if macOS asks for confirmation.

---

## Current Tools

### 1. Task Generator
A comprehensive task management tool for developers working with Git workflows:
- **Store tasks** in a local SQLite database
- **Generate consistent Git branch names** from task metadata (supports `feature`, `bugfix`, `hotfix` types)
- **Generate PR titles** automatically from task number and name
- **View task history** with search and filter capabilities
- **Sort tasks** by creation date (newest/oldest)
- **Delete tasks** from the database
- **View task details** in read-only mode
- **Export/Import tasks** - Export all tasks to JSON file or import tasks from a previously exported JSON file
- Responsive design with resizable panels for desktop and stacked layout for mobile

### 2. XAML Formatter
A powerful XAML/XML formatting tool with syntax highlighting:
- **Format XAML/XML** code with proper indentation
- **Ace Editor** integration with syntax highlighting (Monokai theme)
- **Split-view editor** with input and output panels
- **Keyboard shortcuts**:
  - `Ctrl+Shift+F` - Format the code
  - `Ctrl+F` - Open search in editor
- **Resizable panels** for desktop, stacked layout for mobile
- Built with `vkbeautify` for XML formatting

### 3. Code Generator (Barcode & QR Code)
A versatile barcode and QR code generation tool:
- **Supported code types**:
  - **QR Code** - Standard QR codes
  - **EAN-13** - European Article Number with automatic check digit calculation
  - **DataMatrix** - 2D barcode format
  - **Code128** - Linear barcode format
- **Export formats**: SVG and PNG
- **Two generation modes**:
  - **Single mode**: Generate one code at a time
  - **Multi mode**: Batch generation with two input formats:
    - **Lines mode**: One value per line, shared code type
    - **JSON mode**: JSON array with individual `text` + `type` per item
- **History management**:
  - Local SQLite storage of all generation actions
  - Searchable history list
  - View-only JSON payload preview
  - Duplicate past states back into the editor
  - Delete history entries
  - **Export/Import history** - Export all history entries to JSON file or import history from a previously exported JSON file
- Adjustable preview size for better readability

The app is designed as a personal, offline‑first toolbox that runs as a native desktop app using Tauri's lightweight Rust backend.

---

## Tech Stack

### Frontend
- **React 19** + **TypeScript**
- **Tauri 2** React template
- **Tailwind CSS 4** & **shadcn/ui** components
- **React Router DOM** for navigation
- **Ace Editor** (react-ace) for code editing
- **Sonner** for toast notifications
- **Lucide React** for icons
- **Barcode Libraries**:
  - `jsbarcode` for Code128 generation
  - `qr-code-styling` for QR code styling
  - `@barcode-bakery/barcode-datamatrix` for DataMatrix
- `@tauri-apps/api` for invoking Rust commands
- `@tauri-apps/plugin-dialog` for file save/open dialogs
- `vkbeautify` for XML/XAML formatting

### Backend (Tauri)
- **Rust** (2021 edition)
- **Tauri 2** framework
- **rusqlite** (with bundled feature) for local SQLite databases
- **tauri-plugin-dialog** for file dialog functionality
- **Barcode Generation**:
  - `quickcodes` for QR Code & EAN‑13 generation
  - `datamatrix` crate for DataMatrix generation
  - `barcoders` crate for Code128 (with SVG and image features)
- **Utilities**:
  - `serde` & `serde_json` for serialization
  - `chrono` for timestamp handling
  - `base64` for image encoding
  - `urlencoding` for URL encoding
- **Custom Modules**:
  - `db.rs` – SQLite connection + table creation helpers
  - `commands.rs` – Task save/load/delete commands
  - `barcodes.rs` – Barcode generation logic (all formats)
  - `codegen_history.rs` – History persistence for the code generator
  - `print_queue.rs` – Local print queue storage and state management
  - `server.rs` – Lightweight local HTTP endpoint for queuing print jobs (`/print`)

### Print Queue endpoint

- The app starts a small HTTP server on `0.0.0.0:3333` (override with env `PRINT_QUEUE_PORT`).
- POST `http://<your-ip>:3333/print` with JSON:
  ```json
  { "batchId": "kitchen-1", "requestedBy": "alice", "payload": "line to print" }
  ```
  or multiple:
  ```json
  { "batchId": "run-42", "requestedBy": "alice", "jobs": ["ticket A", "ticket B"] }
  ```
- Each entry is stored with state `new` and can be sent/reprinted from the **Print Queue** page. The response echoes the queued jobs.

---

## Project Structure

```text
dev-toolbox/
├─ src/                          # React frontend
│  ├─ components/
│  │  ├─ code-generator/         # Code generator UI & types
│  │  │  ├─ CodegenHistory.tsx   # History view component
│  │  │  ├─ MultiCodeTab.tsx     # Multi-mode generation tab
│  │  │  ├─ SingleCodeTab.tsx    # Single-mode generation tab
│  │  │  └─ codegen-types.ts     # TypeScript types
│  │  ├─ ui/                     # shadcn/ui components
│  │  │  ├─ button.tsx
│  │  │  ├─ card.tsx
│  │  │  ├─ dialog.tsx
│  │  │  ├─ input.tsx
│  │  │  ├─ sidebar.tsx
│  │  │  └─ ...                  # Other UI components
│  │  ├─ app-sidebar.tsx         # Main navigation sidebar
│  │  ├─ app-header.tsx          # App header component
│  │  ├─ animated-copy-button.tsx
│  │  └─ animated-action-button.tsx
│  ├─ pages/
│  │  ├─ CodeGenerator.tsx       # Code generator page
│  │  ├─ TaskGenerator.tsx       # Task generator page
│  │  └─ XamlFormatter.tsx       # XAML formatter page
│  ├─ hooks/
│  │  ├─ use-barcode.ts          # Hook that wraps Tauri barcode command
│  │  └─ use-mobile.ts           # Mobile detection hook
│  ├─ lib/
│  │  ├─ types/
│  │  │  └─ task.ts              # Task type definitions
│  │  ├─ barcode-utils.ts        # Barcode utility functions
│  │  └─ utils.ts                # General utilities
│  ├─ App.tsx                    # Main app component
│  ├─ router.tsx                  # React Router configuration
│  └─ main.tsx                   # React entry point
├─ src-tauri/
│  ├─ src/
│  │  ├─ main.rs                 # Tauri entry point
│  │  ├─ lib.rs                  # Library root with command handlers
│  │  ├─ barcodes.rs             # generate_barcode Tauri command
│  │  ├─ db.rs                   # get_db() and table creation
│  │  ├─ commands.rs             # save_task / get_tasks / delete_task
│  │  └─ codegen_history.rs      # save_codegen_state / get_codegen_history / delete
│  ├─ Cargo.toml                 # Rust dependencies
│  ├─ tauri.conf.json            # Tauri configuration
│  └─ tasks.db                   # SQLite database (created at runtime)
├─ package.json                  # Node.js dependencies
├─ tsconfig.json                 # TypeScript configuration
└─ vite.config.ts                # Vite configuration
```

---

## Databases & Persistence

The app uses a **single local SQLite database** (`tasks.db`) stored in the Tauri app data directory, created automatically on first use. Both the tasks and code generator history are stored in the same database file.

### Database Schema

The database contains two tables:

#### Tasks Table

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

#### Code Generator History Table

```sql
CREATE TABLE IF NOT EXISTS codegen_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  mode       TEXT NOT NULL,        -- 'single' or 'multi'
  summary    TEXT NOT NULL,        -- short human-readable description
  payload    TEXT NOT NULL,        -- JSON snapshot of state
  created_at TEXT NOT NULL         -- ISO timestamp
);
```

### Tauri Commands

**Task Management:**
- `save_task(name, number, feature_type, branch, pr_title)` - Save a new task
- `get_tasks()` - Retrieve all tasks (sorted by creation date)
- `delete_task(id)` - Delete a task by ID
- `get_last_task()` - Get the most recently created task
- `export_tasks(file_path)` - Export all tasks to a JSON file
- `import_tasks(file_path)` - Import tasks from a JSON file (returns count of imported tasks)

**Code Generator History:**
- `save_codegen_state(mode, summary, payload)` - Save a generation state
- `get_codegen_history()` - Retrieve all history entries
- `delete_codegen_entry(id)` - Delete a history entry by ID
- `export_codegen_history(file_path)` - Export all history entries to a JSON file
- `import_codegen_history(file_path)` - Import history entries from a JSON file (returns count of imported entries)

The React components consume these commands through `@tauri-apps/api/core`'s `invoke` function.

> **Note**: The database file is stored in the Tauri app data directory (platform-specific). During development, you can safely delete the database file while the app is closed to start with a clean slate. The tables will be recreated automatically on the next run.

### Export/Import Format

Both tasks and code generation history can be exported to and imported from JSON files. The export format includes:

**Tasks Export:**
```json
{
  "tasks": [
    {
      "id": 1,
      "name": "Task name",
      "number": "TASK-123",
      "feature_type": "feature",
      "branch": "feature/TASK-123-task-name",
      "pr_title": "TASK-123: Task name",
      "created_at": "2024-01-01T12:00:00Z"
    }
  ],
  "export_date": "2024-01-01T12:00:00Z",
  "version": "1.0"
}
```

**Code Generation History Export:**
```json
{
  "entries": [
    {
      "id": 1,
      "mode": "single",
      "summary": "QR Code for...",
      "payload": "{\"mode\":\"single\",\"singleText\":\"...\",\"singleType\":\"QR Code\"}",
      "created_at": "2024-01-01T12:00:00Z"
    }
  ],
  "export_date": "2024-01-01T12:00:00Z",
  "version": "1.0"
}
```

When importing, the original timestamps are preserved, and new database IDs are automatically assigned. This allows you to:
- **Backup your data** before making changes
- **Transfer data** between different installations
- **Share task lists** or code generation templates with team members
- **Restore** from a previous backup

---

## Barcode Generation Details

### QR Code & EAN‑13

Handled by the [`quickcodes`](https://crates.io/crates/quickcodes) crate:

- **QR Code**: Generated directly from the input string, supports any text data
- **EAN‑13**: Automatic check digit calculation and validation:
  - If you enter **12 digits** → the check digit is computed automatically
  - If you enter **13 digits** → the check digit is verified; invalid numbers return an error
  - Only numeric input is accepted

### DataMatrix

Handled by the [`datamatrix`](https://crates.io/crates/datamatrix) crate:

- The Rust backend uses `DataMatrix::encode` to generate the symbol
- A crisp SVG is drawn manually with proper quiet zone around the symbol for better scanning
- SVG is returned as a `data:image/svg+xml;utf8,...` URL to the frontend
- Supports various data sizes and error correction levels

### Code128

Handled by the [`barcoders`](https://crates.io/crates/barcoders) crate:

- Backend uses `barcoders::sym::code128::Code128` for encoding
- Input is sanitized on the React side (only printable ASCII, without control characters) before being sent to Rust
- **PNG export**: Bar width (`xdim`) and height are tuned to be easily scannable by mobile devices and hardware scanners
- **SVG export**: Fixed bar height is used; the React UI lets you scale the preview visually without distorting the bars in the exported image
- Supports all Code128 character sets (A, B, C)

### Export Formats

Both SVG and PNG formats are supported for all barcode types:
- **SVG**: Vector format, scalable without quality loss
- **PNG**: Raster format, optimized for printing and scanning

---

## Code Generator History View

The **History** tab in the Code Generator provides:

- **Searchable list** of all history entries showing:
  - Entry ID
  - Generation mode (Single/Multi)
  - Summary (truncated input text)
  - Creation timestamp
- **Detailed view** of the selected entry:
  - Full creation date and time
  - Complete JSON payload (pretty‑printed, view‑only)
  - **Duplicate button** to load the state back into the editor
  - **Delete button** to remove the entry from history
- **Export/Import buttons** in the header:
  - **Export** - Save all history entries to a JSON file
  - **Import** - Load history entries from a JSON file
- Long payloads are displayed in a scrollable container to prevent layout issues
- History persists across app restarts in the SQLite database

---

## Permissions & Security

The app uses Tauri's permission system to control access to system resources. The required permissions are defined in `src-tauri/capabilities/default.json`:

- **core:default** - Basic Tauri core functionality
- **opener:default** - Open external URLs/files
- **dialog:allow-save** - Save file dialogs (for export functionality)
- **dialog:allow-open** - Open file dialogs (for import functionality)
- **dialog:default** - Default dialog functionality

These permissions are automatically granted to the main window. If you need to add additional capabilities, you can modify the capabilities file and restart the app.

---

## Error Handling & Debugging

- **Error Display**: Errors from the Rust backend are converted to strings and displayed in the UI using toast notifications (Sonner)
- **Debug Logging**: The backend uses `eprintln!` for debug logging in barcode generation and database operations; these logs appear in the terminal where you launched `cargo tauri dev`
- **Backtraces**: For deeper debugging, you can run with backtraces enabled:

  ```bash
  RUST_BACKTRACE=1 cargo tauri dev
  ```

- **Frontend Errors**: React errors are logged to the browser console (accessible via DevTools)
- **Database Errors**: SQLite errors are caught and converted to user-friendly error messages

---

## Future Ideas

Some possible future additions:

- **Additional Tools**:
  - JSON/YAML formatter
  - Regex tester
  - UUID generator
  - Base64 encoder/decoder
  - Color picker/converter
- **History Management**:
  - Export/import of history as JSON files (implemented)
  - Bulk delete operations
  - History filtering by date range
- **Settings & Customization**:
  - Settings page for default preferences
  - Default barcode types
  - Custom branch/PR templates
  - Theme customization (dark/light mode toggle)
- **UI Enhancements**:
  - Multi‑window support in Tauri
  - Keyboard shortcuts for all tools
  - Drag-and-drop file support
- **Task Generator**:
  - Task templates
  - Task categories/tags
  - Export tasks to JSON (implemented)

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Built with ❤️ using Tauri 2 and React 19**
