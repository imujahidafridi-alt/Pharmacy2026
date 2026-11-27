# A1 Pharmacy — POS, Inventory, Expiry & Khata ERP System

A production-ready, ultra-fast Pharmacy Management Application combining a high-performance **C++20 backend** with embedded **SQLite3 (WAL mode)** and a modern **React + TypeScript frontend** styled with the latest **Bootstrap 5.3+ framework** and native dark/light color modes.

---

## 🌟 Key Capabilities & Architecture

### 1. C++20 Core Backend Engine
- **Blazing Fast**: Sub-millisecond latency using C++ native multi-threaded server (`cpp-httplib`) and prepared statements.
- **Embedded ACID SQLite3 Database**:
  - Write-Ahead Logging (`PRAGMA journal_mode=WAL`) for high-concurrency read/write transactions.
  - Foreign key constraints, atomic checkout transactions, and automatic rollbacks on errors.
- **Integrated Desktop Window Launcher**:
  - Automatically initializes SQLite, seeds initial data, runs the local server on `http://127.0.0.1:8085`, and launches a standalone native desktop window (`msedge.exe --app`).
  - Supports `--server-only` flag for headless execution.
  - Serves pre-built React static files directly with single-page application (SPA) routing fallbacks.

### 2. POS Billing & First-Expired, First-Out (FEFO) Engine
- **Instant Search**: Look up medicines in real time by **Brand Name**, **Generic / Salt Formula**, **Barcode / EAN**, or **Rack / Shelf Location**.
- **FEFO Batch Resolution**:
  - Automatically picks the nearest non-expired batch for each item.
  - Supports quick interactive batch selection override.
- **Price Basis (Purchase in Pack, Sell in Base)**:
  - Purchase cost (TP), GRN rates and printed MRP are recorded **per pack**; the POS always sells **per base unit** (tablet/capsule).
  - Pack size is the only conversion factor: `cost per unit = TP ÷ pack size`, `pack price = unit sale rate × pack size`.
  - Batch-level purchase/sale rates belong to GRN and are never overwritten when a medicine master is edited.
- **Safety Lock Guardrail**: Expired medicines are strictly barred from being billed.
- **Bill Parking / Holding**: Suspend an active customer cart (`F7`), serve the next customer, and resume (`Parked Bills`, `F8`) at any time without data loss.
- **Sales Return & Restocking**: Full return against invoice number, restocking batches, and refund daybook accounting.
- **Inline Payment Modes**: Cash, Online and Credit (Khata) are selected directly from the POS right-side panel — no separate payment dialog.
- **Thermal Receipt Printing**: Printable 80mm ESC/POS thermal receipt with pharmacy branding, drug license number, and Khata balance summary.

### 3. Customers & Suppliers Khata (Credit & Ledger Accounting)
- **Customer Khata (Udhar Management)**:
  - Account profiles with credit limits and running balances.
  - Credit sales automatically debit the customer ledger.
  - Instant Cash collection recording with daybook integration.
  - Detailed running balance statement (Debit vs. Credit).
  - One-click WhatsApp payment reminder link generator.
- **Supplier Khata (Vendor Payables)**:
  - Track distributors (GSK, Abbott, Getz Pharma, Citi Meds).
  - Receive new stock shipments via Purchase GRN with bonus units (e.g. 10 + 1 free).
  - Outflow payouts (Cash, Bank, Cheque) with ledger debits.

### 4. Three-Tier Expiry Watchlist & Quality Control
- 🟥 **Expired ($\le 0$ days)**: Hard locked. Quarantine status.
- 🟧 **Critical Near-Expiry ($1 - 30$ days)**: High alert banner with remaining day count.
- 🟨 **Warning Near-Expiry ($31 - 90$ days)**: Clearance prioritization.
- 🟩 **Healthy (> 90 days)**: Safe status.

### 5. Cash Drawer & Daybook Reconciliation
- Open a shift with a starting float; track expected cash live as sales, collections, refunds and expenses occur.
- Only **physical cash** touches the drawer — Online/Card sales and khata refunds are excluded.
- Denomination-based closing count with automatic variance and closed-shift history.

### 6. Backup & Recovery
- Consistent SQLite snapshots via the native backup API (safe while the server is running).
- Every backup is integrity-checked and given a SHA-256 checksum before it is listed.
- Manual backups with labels, optional scheduled backups, and configurable retention.
- Download/export a backup file, or restore with a typed `RESTORE` confirmation — a safety copy is always taken first.
- Backups live in `backend/backups/` (gitignored). Copy them to another disk regularly.

### 7. Interface & Navigation
- Compact grouped menu bar: **Sale / Inventory / Accounts / System**, with icon-rich dropdowns.
- Responsive: collapses to a single **Menu** button on narrow windows.
- Keyboard-first workflows, contextual shortcut guide (`?`), scan feedback, light/dark "Rx Pulse" theme.

---

## ⌨️ POS Keyboard Hotkeys

| Hotkey | Action |
|---|---|
| `F1` | Focus & select Medicine / Barcode Search Bar |
| `Enter` | Add highlighted search result to bill |
| `F2` | Edit quantity of the selected cart row |
| `+` / `-` | Increase / decrease selected quantity |
| `↑` / `↓` | Move between cart rows |
| `Del` | Remove selected cart row |
| `F4` | Bill discount |
| `F5` | Select customer / khata account |
| `F7` | Hold / park current bill |
| `F8` | Open parked bills |
| `F9` | Complete sale and print receipt |
| `Alt+M` | Mutabadil — generic alternatives |
| `Alt+R` | Round bill to nearest Rs. 5 |
| `Alt+W` | Open sales return (Wapsi) |
| `Ctrl+P` | Reprint last invoice |
| `F12` | Sell anyway in the below-cost alert |
| `?` | Show the keyboard shortcut guide |
| `Esc` | Close the active dialog |

Search shortcuts: `5*Item` adds 5 units, `-Item` adds a Wapsi line, `Alt+M` opens substitutes, and any 4+ digit input is treated as a barcode.

---

## 🚀 Quick Start Guide

### Option 1: One-Click Desktop Application Launch (Recommended)
Simply double-click:
```bat
run_desktop.bat
```
This launches the C++ backend and opens the **A1 Pharmacy** app in a dedicated Edge/Chrome app window with its own taskbar identity.

### Option 2: Live Development Mode
Run either development batch script:
```bat
dev.bat
```
opens the Vite build in a standalone taskbar app window, while `run_dev.bat` just starts the servers for browser-based development.
- Backend REST API: `http://127.0.0.1:8085`
- Frontend Vite Server: `http://127.0.0.1:5173` (with hot reloading)

### Option 3: Full Rebuild
To recompile both C++ backend and React frontend:
```bat
build_all.bat
```

---

## 📁 Project Structure

```
Pharmacy_2026/
├── backend/
│   ├── include/
│   │   ├── httplib.h          # Single-header HTTP server
│   │   ├── json.hpp           # Single-header JSON parser
│   │   ├── db.hpp             # SQLite database layer header
│   │   └── utils.hpp          # Timestamp, format & generator helpers
│   ├── src/
│   │   ├── main.cpp           # C++ REST endpoints & desktop window launcher
│   │   └── db.cpp             # Schema creation, seed data & queries
│   ├── dist/                  # Static bundle served directly by C++
│   ├── pharmacy.db            # SQLite database file
│   └── pharmacy_server.exe    # Compiled 64-bit C++ executable
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/            # UI components (Button.tsx, Modal.tsx, Input.tsx, Badge.tsx, Table.tsx, StatCard.tsx)
│   │   │   ├── pos/           # POSTerminal, BatchSelector, Payment/Return/Receipt modals, ShortcutsHelpModal
│   │   │   ├── khata/         # CustomerKhataView.tsx, SupplierKhataView.tsx
│   │   │   ├── inventory/     # MedicineMaster, ItemEditorModal, ExpiryWatchlist
│   │   │   ├── purchases/     # PurchaseEntry.tsx (GRN)
│   │   │   └── reports/       # DashboardOverview, DaybookReconciliation, CashDrawerView, BackupView, SettingsView
│   │   ├── context/           # AppContext.tsx, ToastContext.tsx
│   │   ├── services/          # api.ts REST client
│   │   ├── types/             # index.ts (TypeScript data models & interfaces)
│   │   ├── utils/             # stockFormat.ts, barcode.ts, sound.ts
│   │   ├── styles/            # pharmacy-bootstrap.css (Rx Pulse theme)
│   │   ├── App.tsx            # App shell & grouped menu navigation
│   │   └── main.tsx
│   ├── package.json
│   ├── tsconfig.json          # Strict TypeScript enabled
│   └── vite.config.ts
├── run_desktop.bat            # One-click desktop launcher (dedicated app profile)
├── dev.bat                    # Dev servers + taskbar app window
├── run_dev.bat                # Dev servers only
├── build_all.bat              # Full project compiler script
└── README.md
```

---

## 🗄️ Pre-Seeded Sample Data
The working database ships with a 100-item catalog across 10 categories (analgesics, antibiotics, anti-diabetic, cardiovascular, GI, respiratory and more), with 125 batches including 25 near-expiry lots for FEFO and watchlist testing. Each item carries full master data: generic salt, manufacturer, rack, barcode, pack size, per-pack TP/MRP, per-unit sale rate, stock alert and Rx flag. Store identity and contact details live in the `settings` table (editable from the Settings screen).
