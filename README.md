# Al-Shifa Pharmacy POS, Inventory, Expiry & Khata ERP System

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
- **Bill Parking / Holding**: Suspend an active customer cart (`F4`), serve the next customer, and resume (`Parked Bills`) at any time without data loss.
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
- Real-time tally of physical drawer cash.
- Opening float, cash sales, khata collections, and store petty expenses.

---

## ⌨️ POS Keyboard Hotkeys

| Hotkey | Action |
|---|---|
| `F1` | Focus & select Medicine / Barcode Search Bar |
| `F2` | Open Customer Khata Accounts View |
| `F3` | Open Expiry Watchlist |
| `F4` | Park / Suspend Current Bill |
| `F9` | Open Complete Sale & Payment Modal |
| `Esc` | Close any active modal dialog |
| `Enter` | Add highlighted search result to bill |

---

## 🚀 Quick Start Guide

### Option 1: One-Click Desktop Application Launch (Recommended)
Simply double-click:
```bat
run_desktop.bat
```
This launches the C++ backend and opens the Pharmacy POS app window.

### Option 2: Live Development Mode
Run the development batch script:
```bat
run_dev.bat
```
- Backend REST API: `http://127.0.0.1:8085`
- Frontend Vite Server: `http://localhost:5173` (with hot reloading)

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
│   │   │   ├── pos/           # POSTerminal.tsx, ItemSearchDropdown.tsx, BatchSelectorModal.tsx, PaymentModal.tsx, etc.
│   │   │   ├── khata/         # CustomerKhataView.tsx, SupplierKhataView.tsx
│   │   │   ├── inventory/     # MedicineMaster.tsx, ExpiryWatchlist.tsx
│   │   │   ├── purchases/     # PurchaseEntry.tsx (GRN)
│   │   │   └── reports/       # DashboardOverview.tsx, DaybookReconciliation.tsx, SettingsView.tsx
│   │   ├── context/           # AppContext.tsx, ToastContext.tsx
│   │   ├── services/          # api.ts REST client
│   │   ├── types/             # index.ts (TypeScript data models & interfaces)
│   │   ├── utils/             # stockFormat.ts (Dual UoM formatter)
│   │   ├── styles/            # pharmacy-bootstrap.css
│   │   ├── App.tsx            # Main app shell & tabs
│   │   └── main.tsx
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── run_desktop.bat            # One-click desktop launcher
├── run_dev.bat                # Dev servers launcher
├── build_all.bat              # Full project compiler script
└── README.md
```

---

## 🗄️ Pre-Seeded Sample Data
The application comes pre-loaded with realistic pharmaceutical stock for immediate testing:
- **Common Medicines**: Panadol 500mg, Panadol Extra, Augmentin 625mg & 1g, Brufen 400mg & DS Suspension, Glucophage 500mg & 850mg, Lipitor 20mg, Risek 20mg & 40mg, Softin 10mg, Flagyl 400mg, Arinac Forte, Disprin, Cac-1000 Plus, Sancos Syrup, Polyfax.
- **Multiple Batches**: Active healthy batches, near-expiry batches (< 30 days), and one expired batch (`RSK-40-OLD`) to test the automated safety lock.
- **Customer Khata Accounts**: Regular chronic patients with opening debit balances and credit limits.
- **Suppliers**: GSK Authorized Distributor, Abbott Healthcare Distribution, Getz Pharma Logistics with payables ledger history.
