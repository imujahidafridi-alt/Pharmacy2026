#include "../include/db.hpp"
#include "../include/utils.hpp"
#include <iostream>
#include <sstream>

Database& Database::getInstance() {
    static Database instance;
    return instance;
}

Database::~Database() {
    close();
}

void Database::close() {
    std::lock_guard<std::mutex> lock(dbMutex);
    if (db) {
        sqlite3_close(db);
        db = nullptr;
    }
}

// Canonical price basis: purchase cost (TP) and MRP are per pack; batch sale_rate
// and medicine sale_price are per base unit because the POS always sells in base units.
static void normalizePriceBasis(Database& db) {
    // First normalize legacy batch rates (per pack -> per unit) for medicines that
    // never had a per-unit sale price (seeded items), then fill in their master prices.
    db.execute("UPDATE batches SET sale_rate = ROUND(sale_rate / CASE WHEN "
               "(SELECT pack_size FROM medicines WHERE id = batches.medicine_id) > 1 THEN "
               "(SELECT pack_size FROM medicines WHERE id = batches.medicine_id) ELSE 1 END, 2) "
               "WHERE medicine_id IN (SELECT id FROM medicines WHERE COALESCE(sale_price, 0) = 0);");
    db.execute("UPDATE medicines SET "
               "cost_price = COALESCE((SELECT purchase_rate FROM batches WHERE medicine_id = medicines.id ORDER BY id LIMIT 1), 0), "
               "sale_price = COALESCE((SELECT sale_rate FROM batches WHERE medicine_id = medicines.id ORDER BY id LIMIT 1), 0), "
               "mrp = ROUND(COALESCE((SELECT sale_rate FROM batches WHERE medicine_id = medicines.id ORDER BY id LIMIT 1), 0) * "
               "CASE WHEN pack_size > 1 THEN pack_size ELSE 1 END * 1.05, 2) "
               "WHERE COALESCE(sale_price, 0) = 0;");
    db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('price_basis_unit_sale', '1');");
}

// Escape a string for safe inclusion as a SQL single-quoted literal.
// Prepared statements are preferred; this guards the remaining legacy queries.
static std::string sqlQuote(const std::string& value) {
    std::string out;
    out.reserve(value.size() + 2);
    out.push_back('\'');
    for (char c : value) {
        if (c == '\'') out += "''";
        else out.push_back(c);
    }
    out.push_back('\'');
    return out;
}

bool Database::initialize(const std::string& dbPath) {
    std::lock_guard<std::mutex> lock(dbMutex);
    int rc = sqlite3_open(dbPath.c_str(), &db);
    if (rc != SQLITE_OK) {
        std::cerr << "Cannot open database: " << sqlite3_errmsg(db) << std::endl;
        return false;
    }

    // Enable WAL mode and foreign keys for high-performance concurrent reads/writes
    sqlite3_exec(db, "PRAGMA journal_mode=WAL;", nullptr, nullptr, nullptr);
    sqlite3_exec(db, "PRAGMA foreign_keys=ON;", nullptr, nullptr, nullptr);
    sqlite3_exec(db, "PRAGMA busy_timeout=5000;", nullptr, nullptr, nullptr);

    return createTables();
}

bool Database::execute(const std::string& sql) {
    char* errMsg = nullptr;
    int rc = sqlite3_exec(db, sql.c_str(), nullptr, nullptr, &errMsg);
    if (rc != SQLITE_OK) {
        std::cerr << "SQL error: " << (errMsg ? errMsg : "unknown") << " in query: " << sql << std::endl;
        if (errMsg) sqlite3_free(errMsg);
        return false;
    }
    return true;
}

json Database::query(const std::string& sql) {
    sqlite3_stmt* stmt = nullptr;
    json result = json::array();

    int rc = sqlite3_prepare_v2(db, sql.c_str(), -1, &stmt, nullptr);
    if (rc != SQLITE_OK) {
        std::cerr << "Failed to prepare statement: " << sqlite3_errmsg(db) << " SQL: " << sql << std::endl;
        return result;
    }

    int colCount = sqlite3_column_count(stmt);
    while (sqlite3_step(stmt) == SQLITE_ROW) {
        json row = json::object();
        for (int i = 0; i < colCount; i++) {
            const char* colName = sqlite3_column_name(stmt, i);
            int colType = sqlite3_column_type(stmt, i);

            switch (colType) {
                case SQLITE_INTEGER:
                    row[colName] = sqlite3_column_int64(stmt, i);
                    break;
                case SQLITE_FLOAT:
                    row[colName] = sqlite3_column_double(stmt, i);
                    break;
                case SQLITE_TEXT: {
                    const char* textVal = reinterpret_cast<const char*>(sqlite3_column_text(stmt, i));
                    row[colName] = textVal ? std::string(textVal) : "";
                    break;
                }
                case SQLITE_NULL:
                    row[colName] = nullptr;
                    break;
                default:
                    row[colName] = nullptr;
                    break;
            }
        }
        result.push_back(row);
    }

    sqlite3_finalize(stmt);
    return result;
}

int64_t Database::lastInsertRowId() {
    return sqlite3_last_insert_rowid(db);
}

int Database::changes() {
    return sqlite3_changes(db);
}

bool Database::beginTransaction() {
    return execute("BEGIN TRANSACTION;");
}

bool Database::commit() {
    return execute("COMMIT;");
}

bool Database::rollback() {
    return execute("ROLLBACK;");
}

bool Database::createTables() {
    const char* schema = R"(
        CREATE TABLE IF NOT EXISTS medicines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT,
            name TEXT NOT NULL,
            generic_name TEXT NOT NULL,
            category TEXT,
            manufacturer TEXT,
            brand TEXT,
            rack_location TEXT,
            barcode TEXT,
            dosage_form TEXT DEFAULT 'Tablet',
            pack_size INTEGER DEFAULT 10,
            unit_type TEXT DEFAULT 'Strip',
            pieces_per_strip INTEGER DEFAULT 10,
            strips_per_box INTEGER DEFAULT 1,
            cost_price REAL DEFAULT 0.0,
            mrp REAL DEFAULT 0.0,
            sale_price REAL DEFAULT 0.0,
            strip_sale_price REAL DEFAULT 0.0,
            box_sale_price REAL DEFAULT 0.0,
            min_stock_alert INTEGER DEFAULT 10,
            is_prescription_required INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            discount_rule INTEGER DEFAULT 0,
            discount_pct REAL DEFAULT 0.0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_med_name ON medicines(name);
        CREATE INDEX IF NOT EXISTS idx_med_generic ON medicines(generic_name);
        CREATE INDEX IF NOT EXISTS idx_med_barcode ON medicines(barcode);
        CREATE INDEX IF NOT EXISTS idx_med_code ON medicines(code);

        CREATE TABLE IF NOT EXISTS batches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
            batch_number TEXT NOT NULL,
            expiry_date TEXT NOT NULL,
            purchase_rate REAL NOT NULL,
            sale_rate REAL NOT NULL,
            quantity INTEGER NOT NULL DEFAULT 0,
            is_quarantined INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_batches_med ON batches(medicine_id);
        CREATE INDEX IF NOT EXISTS idx_batches_expiry ON batches(expiry_date);

        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT,
            address TEXT,
            credit_limit REAL DEFAULT 10000.0,
            current_balance REAL DEFAULT 0.0,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS customer_ledger (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
            date TEXT NOT NULL,
            transaction_type TEXT NOT NULL,
            reference_id INTEGER,
            debit REAL DEFAULT 0.0,
            credit REAL DEFAULT 0.0,
            balance REAL NOT NULL,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_cust_ledger ON customer_ledger(customer_id);

        CREATE TABLE IF NOT EXISTS suppliers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            contact_person TEXT,
            phone TEXT,
            email TEXT,
            address TEXT,
            current_balance REAL DEFAULT 0.0,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS supplier_ledger (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
            date TEXT NOT NULL,
            transaction_type TEXT NOT NULL,
            reference_id INTEGER,
            debit REAL DEFAULT 0.0,
            credit REAL DEFAULT 0.0,
            balance REAL NOT NULL,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_supp_ledger ON supplier_ledger(supplier_id);

        CREATE TABLE IF NOT EXISTS invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_number TEXT NOT NULL UNIQUE,
            date TEXT NOT NULL,
            customer_id INTEGER REFERENCES customers(id),
            customer_name TEXT,
            subtotal REAL NOT NULL,
            discount_amount REAL DEFAULT 0.0,
            discount_percent REAL DEFAULT 0.0,
            tax_amount REAL DEFAULT 0.0,
            total_amount REAL NOT NULL,
            paid_amount REAL NOT NULL,
            change_amount REAL DEFAULT 0.0,
            payment_mode TEXT NOT NULL,
            status TEXT DEFAULT 'COMPLETED',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS invoice_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
            medicine_id INTEGER NOT NULL REFERENCES medicines(id),
            batch_id INTEGER NOT NULL REFERENCES batches(id),
            medicine_name TEXT NOT NULL,
            batch_number TEXT NOT NULL,
            expiry_date TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            unit_type TEXT NOT NULL,
            pack_size INTEGER DEFAULT 1,
            unit_price REAL NOT NULL,
            discount_percent REAL DEFAULT 0.0,
            total_price REAL NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_inv_items ON invoice_items(invoice_id);

        CREATE TABLE IF NOT EXISTS purchases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_number TEXT NOT NULL,
            supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
            purchase_date TEXT NOT NULL,
            subtotal REAL NOT NULL,
            discount_amount REAL DEFAULT 0.0,
            tax_amount REAL DEFAULT 0.0,
            total_amount REAL NOT NULL,
            paid_amount REAL DEFAULT 0.0,
            payment_status TEXT DEFAULT 'UNPAID',
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS purchase_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
            medicine_id INTEGER NOT NULL REFERENCES medicines(id),
            batch_number TEXT NOT NULL,
            expiry_date TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            bonus_quantity INTEGER DEFAULT 0,
            purchase_rate REAL NOT NULL,
            sale_rate REAL NOT NULL,
            total_amount REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS daybook (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            entry_type TEXT NOT NULL,
            amount REAL NOT NULL,
            direction TEXT NOT NULL,
            reference_id INTEGER,
            session_id INTEGER,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS cash_drawer_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            opened_at TEXT NOT NULL,
            closed_at TEXT,
            opening_float REAL NOT NULL,
            expected_closing REAL,
            counted_closing REAL,
            variance REAL,
            status TEXT DEFAULT 'OPEN',
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS stock_adjustments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            medicine_id INTEGER NOT NULL,
            batch_id INTEGER NOT NULL,
            delta INTEGER NOT NULL,
            reason TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS parked_invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_name TEXT,
            cart_data TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    )";

    bool ok = execute(schema);
    // Safe column migrations for existing databases
    execute("ALTER TABLE medicines ADD COLUMN code TEXT;");
    execute("ALTER TABLE medicines ADD COLUMN brand TEXT;");
    execute("ALTER TABLE medicines ADD COLUMN dosage_form TEXT DEFAULT 'Tablet';");
    execute("ALTER TABLE medicines ADD COLUMN cost_price REAL DEFAULT 0.0;");
    execute("ALTER TABLE medicines ADD COLUMN mrp REAL DEFAULT 0.0;");
    execute("ALTER TABLE medicines ADD COLUMN sale_price REAL DEFAULT 0.0;");
    execute("ALTER TABLE medicines ADD COLUMN pieces_per_strip INTEGER DEFAULT 10;");
    execute("ALTER TABLE medicines ADD COLUMN strips_per_box INTEGER DEFAULT 1;");
    execute("ALTER TABLE medicines ADD COLUMN strip_sale_price REAL DEFAULT 0.0;");
    execute("ALTER TABLE medicines ADD COLUMN box_sale_price REAL DEFAULT 0.0;");
    execute("ALTER TABLE medicines ADD COLUMN is_active INTEGER DEFAULT 1;");
    execute("ALTER TABLE medicines ADD COLUMN discount_rule INTEGER DEFAULT 0;");
    execute("ALTER TABLE medicines ADD COLUMN discount_pct REAL DEFAULT 0.0;");
    execute("ALTER TABLE daybook ADD COLUMN session_id INTEGER;");

    // Drop legacy invoice metadata columns (doctor name / invoice notes)
    auto hasColumn = [&](const std::string& table, const std::string& column) -> bool {
        json cols = query("PRAGMA table_info(" + table + ");");
        for (const auto& col : cols) {
            if (col.value("name", "") == column) return true;
        }
        return false;
    };
    if (hasColumn("invoices", "doctor_name")) execute("ALTER TABLE invoices DROP COLUMN doctor_name;");
    if (hasColumn("invoices", "notes")) execute("ALTER TABLE invoices DROP COLUMN notes;");

    // Migrate an existing database that still stores per-pack batch sale rates.
    json legacy = query("SELECT value FROM settings WHERE key = 'price_basis_unit_sale';");
    json needsNorm = query("SELECT COUNT(*) AS c FROM medicines WHERE COALESCE(sale_price, 0) = 0;");
    if (legacy.empty() && !needsNorm.empty() && needsNorm[0]["c"].get<int>() > 0) {
        normalizePriceBasis(*this);
    }
    return ok;
}

// ---------------- MEDICINES ----------------

json Database::getMedicines(const std::string& search, const std::string& category, const std::string& status) {
    std::lock_guard<std::mutex> lock(dbMutex);
    std::string sql = R"(
        SELECT m.*, 
               COALESCE(SUM(b.quantity), 0) AS total_stock,
               MIN(b.expiry_date) AS nearest_expiry,
               MIN(b.sale_rate) AS min_sale_rate,
               MAX(b.sale_rate) AS max_sale_rate,
               MIN(b.purchase_rate) AS min_purchase_rate
        FROM medicines m
        LEFT JOIN batches b ON m.id = b.medicine_id AND b.is_quarantined = 0 AND b.quantity > 0
    )";

    std::vector<std::string> conditions;
    if (!status.empty() && status != "-1") {
        conditions.push_back("m.is_active = " + status);
    }
    if (!search.empty()) {
        std::string pattern = sqlQuote("%" + search + "%");
        conditions.push_back("(m.name LIKE " + pattern + " OR m.generic_name LIKE " + pattern +
                             " OR m.barcode LIKE " + pattern + " OR m.code LIKE " + pattern +
                             " OR m.brand LIKE " + pattern + " OR m.manufacturer LIKE " + pattern +
                             " OR m.rack_location LIKE " + pattern + ")");
    }
    if (!category.empty() && category != "All Categories") {
        conditions.push_back("m.category = " + sqlQuote(category));
    }

    if (!conditions.empty()) {
        sql += " WHERE ";
        for (size_t i = 0; i < conditions.size(); i++) {
            if (i > 0) sql += " AND ";
            sql += conditions[i];
        }
    }

    sql += " GROUP BY m.id ORDER BY m.is_active DESC, m.name ASC;";
    return query(sql);
}

json Database::getMedicineById(int id) {
    std::lock_guard<std::mutex> lock(dbMutex);
    json res = query("SELECT * FROM medicines WHERE id = " + std::to_string(id));
    if (res.empty()) return nullptr;
    json med = res[0];
    med["batches"] = query("SELECT * FROM batches WHERE medicine_id = " + std::to_string(id) + " ORDER BY expiry_date ASC");
    return med;
}

json Database::validateMedicine(const json& m, int excludeId) {
    std::string name = m.value("name", "");
    while (!name.empty() && name.back() == ' ') name.pop_back();
    if (name.empty()) return {{"error", "Please enter an item name."}};

    int pack = m.value("pack_size", m.value("pieces_per_strip", 1));
    if (pack < 1) return {{"error", "Packing must be 1 or more units."}};

    double cost = m.value("cost_price", 0.0);
    double mrp = m.value("mrp", 0.0);
    double sale = m.value("sale_price", 0.0);
    if (cost < 0 || mrp < 0 || sale < 0) {
        return {{"error", "Prices cannot be less than zero."}};
    }
    if (cost > 0 && sale > 0 && sale < (cost / pack) - 0.001) {
        return {{"error", "Sale rate per unit is lower than the purchase cost per unit."}};
    }
    if (mrp > 0 && sale * pack > mrp + 0.001) {
        return {{"error", "Sale rate for a full pack is higher than the printed MRP."}};
    }

    std::string exclude = excludeId > 0 ? " AND id != " + std::to_string(excludeId) : "";
    std::string barcode = m.value("barcode", "");
    if (!barcode.empty()) {
        json dup = query("SELECT name FROM medicines WHERE barcode = " + sqlQuote(barcode) + exclude + " LIMIT 1;");
        if (!dup.empty()) {
            return {{"error", "This barcode already belongs to " + dup[0].value("name", "another item") + "."}};
        }
    }
    json dupName = query("SELECT id FROM medicines WHERE LOWER(name) = LOWER(" + sqlQuote(name) + ")" + exclude + " LIMIT 1;");
    if (!dupName.empty()) {
        return {{"error", "An item with this name already exists."}};
    }
    return {{"valid", true}};
}

int64_t Database::createMedicine(const json& m) {
    std::lock_guard<std::mutex> lock(dbMutex);
    std::string name = m.value("name", "");
    std::string generic = m.value("generic_name", "");
    std::string cat = m.value("category", "Tablets & Capsules");
    std::string brand = m.value("brand", m.value("manufacturer", ""));
    std::string code = m.value("code", "");
    std::string rack = m.value("rack_location", "");
    std::string barcode = m.value("barcode", "");
    std::string dosageForm = m.value("dosage_form", "Tablet");
    double costPrice = m.value("cost_price", 0.0);
    double mrp = m.value("mrp", 0.0);
    double salePrice = m.value("sale_price", 0.0);
    if (mrp <= 0.0 && salePrice > 0.0) mrp = salePrice;
    if (salePrice <= 0.0 && mrp > 0.0) salePrice = mrp;
    int packSize = m.value("pack_size", m.value("pieces_per_strip", 1));
    int piecesPerStrip = packSize;
    int stripsPerBox = 1;
    double stripPrice = salePrice;
    double boxPrice = salePrice * packSize;
    std::string unitType = m.value("unit_type", "Unit");
    int minStock = m.value("min_stock_alert", 10);
    int isRx = m.value("is_prescription_required", 0);
    int isActive = m.value("is_active", 1);
    int discountRule = m.value("discount_rule", 0);
    double discountPct = m.value("discount_pct", 0.0);

    // If code is empty, generate MED-XXX or RET-XXX
    if (code.empty()) {
        json countQ = query("SELECT MAX(id) as max_id FROM medicines;");
        int nextId = 1;
        if (!countQ.empty() && !countQ[0]["max_id"].is_null()) {
            nextId = countQ[0]["max_id"].get<int>() + 1;
        }
        char buf[32];
        snprintf(buf, sizeof(buf), (cat.find("Retail") != std::string::npos || cat.find("Baby") != std::string::npos || cat.find("Personal") != std::string::npos) ? "RET-%03d" : "MED-%03d", nextId);
        code = buf;
    }

    const char* sql = R"(
        INSERT INTO medicines (
            code, name, generic_name, category, manufacturer, brand, rack_location, barcode,
            dosage_form, pack_size, unit_type, pieces_per_strip, strips_per_box,
            cost_price, mrp, sale_price, strip_sale_price, box_sale_price,
            min_stock_alert, is_prescription_required, is_active, discount_rule, discount_pct
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    )";
    sqlite3_stmt* stmt;
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) != SQLITE_OK) return -1;

    sqlite3_bind_text(stmt, 1, code.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 2, name.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 3, generic.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 4, cat.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 5, brand.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 6, brand.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 7, rack.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 8, barcode.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 9, dosageForm.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_int(stmt, 10, piecesPerStrip);
    sqlite3_bind_text(stmt, 11, unitType.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_int(stmt, 12, piecesPerStrip);
    sqlite3_bind_int(stmt, 13, stripsPerBox);
    sqlite3_bind_double(stmt, 14, costPrice);
    sqlite3_bind_double(stmt, 15, mrp);
    sqlite3_bind_double(stmt, 16, salePrice);
    sqlite3_bind_double(stmt, 17, stripPrice);
    sqlite3_bind_double(stmt, 18, boxPrice);
    sqlite3_bind_int(stmt, 19, minStock);
    sqlite3_bind_int(stmt, 20, isRx);
    sqlite3_bind_int(stmt, 21, isActive);
    sqlite3_bind_int(stmt, 22, discountRule);
    sqlite3_bind_double(stmt, 23, discountPct);

    int rc = sqlite3_step(stmt);
    sqlite3_finalize(stmt);
    if (rc != SQLITE_DONE) return -1;
    int64_t medId = lastInsertRowId();

    // One or many opening batches are accepted. Batch/expiry are optional: a
    // clearly-marked default is created so a busy cashier can sell immediately,
    // and the real details can be filled later from the Batches screen.
    // 2099-12-31 means "expiry unknown" and sorts last in FEFO.
    const char* bSql = "INSERT INTO batches (medicine_id, batch_number, expiry_date, purchase_rate, sale_rate, quantity) VALUES (?, ?, ?, ?, ?, ?);";
    auto defaultExpiry = [&]() {
        json setting = query("SELECT value FROM settings WHERE key = 'default_batch_expiry';");
        return setting.empty() ? std::string("2099-12-31") : setting[0].value("value", "2099-12-31");
    };
    auto insertBatch = [&](const std::string& batchNo, const std::string& expiry, int qty) {
        if (qty <= 0) return;
        std::string finalBatch = batchNo.empty() ? "DEFAULT-" + std::to_string(medId) : batchNo;
        std::string finalExpiry = expiry.size() >= 10 ? expiry : defaultExpiry();
        sqlite3_stmt* bStmt;
        if (sqlite3_prepare_v2(db, bSql, -1, &bStmt, nullptr) == SQLITE_OK) {
            sqlite3_bind_int64(bStmt, 1, medId);
            sqlite3_bind_text(bStmt, 2, finalBatch.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_bind_text(bStmt, 3, finalExpiry.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_bind_double(bStmt, 4, costPrice > 0 ? costPrice : salePrice * 0.8);
            sqlite3_bind_double(bStmt, 5, salePrice);
            sqlite3_bind_int(bStmt, 6, qty);
            sqlite3_step(bStmt);
            sqlite3_finalize(bStmt);
        }
    };

    if (m.contains("opening_batches") && m["opening_batches"].is_array() && !m["opening_batches"].empty()) {
        int index = 1;
        for (const auto& row : m["opening_batches"]) {
            int qty = row.value("quantity", 0);
            if (qty <= 0) continue;
            std::string rowBatch = row.value("batch_number", "");
            if (rowBatch.empty()) {
                rowBatch = "DEFAULT-" + std::to_string(medId) + "-" + std::to_string(index);
            }
            insertBatch(rowBatch, row.value("expiry_date", ""), qty);
            index++;
        }
    } else {
        // Backward-compatible single-batch path for older API callers
        insertBatch(m.value("batch_number", ""), m.value("expiry_date", ""), m.value("initial_stock", 0));
    }

    return medId;
}

bool Database::updateMedicine(int id, const json& m) {
    std::lock_guard<std::mutex> lock(dbMutex);

    std::string name = m.value("name", "");
    std::string generic = m.value("generic_name", "");
    std::string cat = m.value("category", "Tablets & Capsules");
    std::string brand = m.value("brand", m.value("manufacturer", ""));
    std::string code = m.value("code", "");
    std::string rack = m.value("rack_location", "");
    std::string barcode = m.value("barcode", "");
    std::string dosageForm = m.value("dosage_form", "Tablet");
    double costPrice = m.value("cost_price", 0.0);
    double mrp = m.value("mrp", 0.0);
    double salePrice = m.value("sale_price", 0.0);
    if (mrp <= 0.0 && salePrice > 0.0) mrp = salePrice;
    if (salePrice <= 0.0 && mrp > 0.0) salePrice = mrp;
    int packSize = m.value("pack_size", m.value("pieces_per_strip", 1));
    int piecesPerStrip = packSize;
    int stripsPerBox = 1;
    double stripPrice = salePrice;
    double boxPrice = salePrice * packSize;
    std::string unitType = m.value("unit_type", "Unit");
    int minStock = m.value("min_stock_alert", 10);
    int isRx = m.value("is_prescription_required", 0);
    int isActive = m.value("is_active", 1);
    int discountRule = m.value("discount_rule", 0);
    double discountPct = m.value("discount_pct", 0.0);

    const char* sql = R"(
        UPDATE medicines SET
            code=?, name=?, generic_name=?, category=?, manufacturer=?, brand=?,
            rack_location=?, barcode=?, dosage_form=?, pack_size=?, unit_type=?,
            pieces_per_strip=?, strips_per_box=?, cost_price=?, mrp=?, sale_price=?,
            strip_sale_price=?, box_sale_price=?, min_stock_alert=?, is_prescription_required=?,
            is_active=?, discount_rule=?, discount_pct=?
        WHERE id=?;
    )";
    sqlite3_stmt* stmt;
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) != SQLITE_OK) return false;

    sqlite3_bind_text(stmt, 1, code.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 2, name.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 3, generic.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 4, cat.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 5, brand.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 6, brand.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 7, rack.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 8, barcode.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 9, dosageForm.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_int(stmt, 10, piecesPerStrip);
    sqlite3_bind_text(stmt, 11, unitType.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_int(stmt, 12, piecesPerStrip);
    sqlite3_bind_int(stmt, 13, stripsPerBox);
    sqlite3_bind_double(stmt, 14, costPrice);
    sqlite3_bind_double(stmt, 15, mrp);
    sqlite3_bind_double(stmt, 16, salePrice);
    sqlite3_bind_double(stmt, 17, stripPrice);
    sqlite3_bind_double(stmt, 18, boxPrice);
    sqlite3_bind_int(stmt, 19, minStock);
    sqlite3_bind_int(stmt, 20, isRx);
    sqlite3_bind_int(stmt, 21, isActive);
    sqlite3_bind_int(stmt, 22, discountRule);
    sqlite3_bind_double(stmt, 23, discountPct);
    sqlite3_bind_int(stmt, 24, id);

    int rc = sqlite3_step(stmt);
    sqlite3_finalize(stmt);
    if (rc != SQLITE_DONE) return false;

    // NOTE: Batch purchase_rate/sale_rate are owned by GRN and are deliberately NOT
    // overwritten when the medicine master is edited. Each batch can have a different
    // purchase cost; replacing them all used to corrupt the below-cost guard.

    // Stock is NEVER changed from the pricing form. Use the dedicated
    // "Adjust Stock" action (/api/medicines/:id/adjust-stock) so every change
    // targets a real batch and is recorded in stock_adjustments.

    return true;
}

json Database::canDeleteMedicine(int id) {
    std::lock_guard<std::mutex> lock(dbMutex);
    json batches = query("SELECT COALESCE(SUM(quantity), 0) AS qty, COUNT(*) AS lots FROM batches WHERE medicine_id = " + std::to_string(id) + ";");
    if (!batches.empty() && batches[0].value("qty", 0) > 0) {
        return {{"error", "This item still has stock. Adjust or sell the stock before deleting it."}};
    }
    json sold = query("SELECT COUNT(*) AS c FROM invoice_items WHERE medicine_id = " + std::to_string(id) + ";");
    if (!sold.empty() && sold[0]["c"].get<int>() > 0) {
        return {{"error", "This item appears on old bills. Deactivate it instead to keep history correct."}};
    }
    return {{"can_delete", true}};
}

bool Database::deleteMedicine(int id) {
    std::lock_guard<std::mutex> lock(dbMutex);
    return execute("DELETE FROM medicines WHERE id = " + std::to_string(id));
}

json Database::adjustStock(int medicineId, int batchId, int delta, const std::string& reason) {
    std::lock_guard<std::mutex> lock(dbMutex);
    if (delta == 0) return {{"error", "Enter how many units to add or remove."}};
    json batch = query("SELECT id, quantity, batch_number FROM batches WHERE id = " + std::to_string(batchId) +
                       " AND medicine_id = " + std::to_string(medicineId) + ";");
    if (batch.empty()) return {{"error", "This batch no longer exists for the selected item."}};
    int current = batch[0].value("quantity", 0);
    if (current + delta < 0) {
        return {{"error", "Cannot remove " + std::to_string(std::abs(delta)) + " units — this batch only has " +
                          std::to_string(current) + "."}};
    }
    beginTransaction();
    execute("UPDATE batches SET quantity = quantity + " + std::to_string(delta) + " WHERE id = " + std::to_string(batchId) + ";");
    sqlite3_stmt* stmt;
    const char* sql = "INSERT INTO stock_adjustments (medicine_id, batch_id, delta, reason) VALUES (?, ?, ?, ?);";
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) == SQLITE_OK) {
        sqlite3_bind_int(stmt, 1, medicineId);
        sqlite3_bind_int(stmt, 2, batchId);
        sqlite3_bind_int(stmt, 3, delta);
        sqlite3_bind_text(stmt, 4, reason.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_step(stmt);
        sqlite3_finalize(stmt);
    }
    commit();
    return {{"success", true}, {"new_quantity", current + delta},
            {"batch_number", batch[0].value("batch_number", "")}};
}

// ---------------- BATCHES & EXPIRY ----------------

json Database::getBatches(int medicineId) {
    std::lock_guard<std::mutex> lock(dbMutex);
    std::string sql = R"(
        SELECT b.*, m.name as medicine_name, m.generic_name, m.pack_size, m.unit_type
        FROM batches b
        JOIN medicines m ON b.medicine_id = m.id
    )";
    if (medicineId > 0) {
        sql += " WHERE b.medicine_id = " + std::to_string(medicineId);
    }
    sql += " ORDER BY b.expiry_date ASC;";
    
    json batches = query(sql);
    for (auto& b : batches) {
        std::string exp = b.value("expiry_date", "");
        int days = Utils::daysUntilExpiry(exp);
        b["days_until_expiry"] = days;
        if (days <= 0) b["expiry_status"] = "expired";
        else if (days <= 30) b["expiry_status"] = "critical";
        else if (days <= 90) b["expiry_status"] = "warning";
        else b["expiry_status"] = "healthy";
    }
    return batches;
}

json Database::getBatchById(int id) {
    std::lock_guard<std::mutex> lock(dbMutex);
    json res = query("SELECT * FROM batches WHERE id = " + std::to_string(id));
    if (res.empty()) return nullptr;
    return res[0];
}

int64_t Database::createBatch(const json& b) {
    std::lock_guard<std::mutex> lock(dbMutex);
    sqlite3_stmt* stmt;
    const char* sql = "INSERT INTO batches (medicine_id, batch_number, expiry_date, purchase_rate, sale_rate, quantity, is_quarantined) VALUES (?, ?, ?, ?, ?, ?, ?);";
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) != SQLITE_OK) return -1;

    sqlite3_bind_int(stmt, 1, b.value("medicine_id", 0));
    sqlite3_bind_text(stmt, 2, b.value("batch_number", "").c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 3, b.value("expiry_date", "").c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_double(stmt, 4, b.value("purchase_rate", 0.0));
    sqlite3_bind_double(stmt, 5, b.value("sale_rate", 0.0));
    sqlite3_bind_int(stmt, 6, b.value("quantity", 0));
    sqlite3_bind_int(stmt, 7, b.value("is_quarantined", 0));

    int rc = sqlite3_step(stmt);
    sqlite3_finalize(stmt);
    if (rc != SQLITE_DONE) return -1;
    return lastInsertRowId();
}

bool Database::updateBatch(int id, const json& b) {
    std::lock_guard<std::mutex> lock(dbMutex);
    json existing = query("SELECT * FROM batches WHERE id = " + std::to_string(id) + ";");
    if (existing.empty()) return false;

    // Only overwrite fields the caller actually supplied — editing the batch
    // number or expiry must never wipe rates or stock.
    auto text = [&](const char* key, const std::string& fallback) {
        return b.contains(key) ? b.value(key, fallback) : existing[0].value(key, fallback);
    };
    auto number = [&](const char* key, double fallback) {
        return b.contains(key) ? b.value(key, fallback) : existing[0].value(key, fallback);
    };
    auto integer = [&](const char* key, int fallback) {
        return b.contains(key) ? b.value(key, fallback) : existing[0].value(key, fallback);
    };

    std::string batchNo = text("batch_number", "");
    std::string expiry = text("expiry_date", "");
    double purchaseRate = number("purchase_rate", 0.0);
    double saleRate = number("sale_rate", 0.0);
    int quantity = integer("quantity", 0);
    int quarantined = integer("is_quarantined", 0);

    sqlite3_stmt* stmt;
    const char* sql = "UPDATE batches SET batch_number=?, expiry_date=?, purchase_rate=?, sale_rate=?, quantity=?, is_quarantined=? WHERE id=?;";
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) != SQLITE_OK) return false;

    sqlite3_bind_text(stmt, 1, batchNo.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 2, expiry.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_double(stmt, 3, purchaseRate);
    sqlite3_bind_double(stmt, 4, saleRate);
    sqlite3_bind_int(stmt, 5, quantity);
    sqlite3_bind_int(stmt, 6, quarantined);
    sqlite3_bind_int(stmt, 7, id);

    int rc = sqlite3_step(stmt);
    sqlite3_finalize(stmt);
    return rc == SQLITE_DONE;
}

bool Database::deleteBatch(int id) {
    std::lock_guard<std::mutex> lock(dbMutex);
    return execute("DELETE FROM batches WHERE id = " + std::to_string(id));
}

json Database::getExpiryWatchlist(int daysThreshold) {
    std::lock_guard<std::mutex> lock(dbMutex);
    std::string sql = R"(
        SELECT b.*, m.name as medicine_name, m.generic_name, m.category, m.rack_location, m.pack_size, m.unit_type
        FROM batches b
        JOIN medicines m ON b.medicine_id = m.id
        WHERE b.quantity > 0
        ORDER BY b.expiry_date ASC;
    )";
    json rows = query(sql);
    json result = json::array();

    for (auto& row : rows) {
        std::string exp = row.value("expiry_date", "");
        int days = Utils::daysUntilExpiry(exp);
        row["days_until_expiry"] = days;
        if (days <= 0) {
            row["expiry_status"] = "expired";
            result.push_back(row);
        } else if (days <= 30) {
            row["expiry_status"] = "critical";
            result.push_back(row);
        } else if (days <= daysThreshold) {
            row["expiry_status"] = "warning";
            result.push_back(row);
        }
    }
    return result;
}

// ---------------- POS & INVOICING ----------------

json Database::createInvoice(const json& inv) {
    std::lock_guard<std::mutex> lock(dbMutex);
    beginTransaction();

    std::string invoiceNum = Utils::generateInvoiceNumber();
    std::string dateStr = Utils::getCurrentDateTime();

    int customerId = inv.value("customer_id", 0);
    std::string customerName = inv.value("customer_name", "Walk-in Customer");
    double subtotal = inv.value("subtotal", 0.0);
    double discountAmount = inv.value("discount_amount", 0.0);
    double discountPercent = inv.value("discount_percent", 0.0);
    double taxAmount = inv.value("tax_amount", 0.0);
    double totalAmount = inv.value("total_amount", 0.0);
    double paidAmount = inv.value("paid_amount", 0.0);
    double changeAmount = inv.value("change_amount", 0.0);
    std::string paymentMode = inv.value("payment_mode", "CASH");

    // 1. Insert Invoice
    sqlite3_stmt* stmt;
    const char* insInvSql = R"(
        INSERT INTO invoices (invoice_number, date, customer_id, customer_name,
                             subtotal, discount_amount, discount_percent, tax_amount, total_amount,
                             paid_amount, change_amount, payment_mode, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED');
    )";
    if (sqlite3_prepare_v2(db, insInvSql, -1, &stmt, nullptr) != SQLITE_OK) {
        rollback();
        return {{"error", "Failed to prepare invoice statement"}};
    }

    sqlite3_bind_text(stmt, 1, invoiceNum.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 2, dateStr.c_str(), -1, SQLITE_TRANSIENT);
    if (customerId > 0) sqlite3_bind_int(stmt, 3, customerId);
    else sqlite3_bind_null(stmt, 3);
    sqlite3_bind_text(stmt, 4, customerName.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_double(stmt, 5, subtotal);
    sqlite3_bind_double(stmt, 6, discountAmount);
    sqlite3_bind_double(stmt, 7, discountPercent);
    sqlite3_bind_double(stmt, 8, taxAmount);
    sqlite3_bind_double(stmt, 9, totalAmount);
    sqlite3_bind_double(stmt, 10, paidAmount);
    sqlite3_bind_double(stmt, 11, changeAmount);
    sqlite3_bind_text(stmt, 12, paymentMode.c_str(), -1, SQLITE_TRANSIENT);

    if (sqlite3_step(stmt) != SQLITE_DONE) {
        sqlite3_finalize(stmt);
        rollback();
        return {{"error", "Failed to insert invoice"}};
    }
    sqlite3_finalize(stmt);
    int64_t invoiceId = lastInsertRowId();

    // 2. Insert items and decrement batch quantities
    if (!inv.contains("items") || !inv["items"].is_array() || inv["items"].empty()) {
        rollback();
        return {{"error", "Invoice must have at least one item"}};
    }

    for (const auto& item : inv["items"]) {
        int medicineId = item.value("medicine_id", 0);
        int batchId = item.value("batch_id", 0);
        std::string medName = item.value("medicine_name", "");
        std::string batchNo = item.value("batch_number", "");
        std::string expiry = item.value("expiry_date", "");
        int qty = item.value("quantity", 1);
        std::string unitType = item.value("unit_type", "Pack");
        int packSize = item.value("pack_size", 1);
        double unitPrice = item.value("unit_price", 0.0);
        double discPercent = item.value("discount_percent", 0.0);
        double totalPrice = item.value("total_price", 0.0);

        // FEFO Auto-resolution if batchId not specified or <= 0
        if (batchId <= 0) {
            std::string fefoSql = "SELECT id, batch_number, expiry_date, quantity, sale_rate FROM batches WHERE medicine_id = " + 
                                  std::to_string(medicineId) + " AND quantity > 0 AND is_quarantined = 0 ORDER BY expiry_date ASC LIMIT 1;";
            json fefoRes = query(fefoSql);
            if (fefoRes.empty()) {
                rollback();
                return {{"error", "Insufficient stock for medicine: " + medName}};
            }
            batchId = fefoRes[0]["id"].get<int>();
            batchNo = fefoRes[0].value("batch_number", "");
            expiry = fefoRes[0].value("expiry_date", "");
        }

        // Verify batch stock and expiry lock
        std::string chkSql = "SELECT quantity, expiry_date, is_quarantined FROM batches WHERE id = " + std::to_string(batchId);
        json chkRes = query(chkSql);
        if (chkRes.empty()) {
            rollback();
            return {{"error", "Batch not found for: " + medName}};
        }
        int curQty = chkRes[0]["quantity"].get<int>();
        std::string expDate = chkRes[0]["expiry_date"].get<std::string>();
        int days = Utils::daysUntilExpiry(expDate);

        if (days <= 0) {
            rollback();
            return {{"error", "Safety Lock: Cannot bill expired medicine (" + medName + ", Exp: " + expDate + ")"}};
        }

        // Calculate exact base units to deduct (Pack vs Loose)
        int baseQtyToDeduct = (unitType == "Pack" && packSize > 1) ? (qty * packSize) : qty;

        if (curQty < baseQtyToDeduct) {
            rollback();
            return {{"error", "Insufficient stock for " + medName + " (Batch " + batchNo + "). Available: " + std::to_string(curQty) + " units, Requested: " + std::to_string(baseQtyToDeduct) + " units"}};
        }

        // Decrement Batch Quantity in Base Units
        std::string decSql = "UPDATE batches SET quantity = quantity - " + std::to_string(baseQtyToDeduct) + " WHERE id = " + std::to_string(batchId);
        if (!execute(decSql)) {
            rollback();
            return {{"error", "Failed to update stock quantity"}};
        }

        // Insert Invoice Item
        const char* insItemSql = R"(
            INSERT INTO invoice_items (invoice_id, medicine_id, batch_id, medicine_name, batch_number, 
                                      expiry_date, quantity, unit_type, pack_size, unit_price, 
                                      discount_percent, total_price)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        )";
        if (sqlite3_prepare_v2(db, insItemSql, -1, &stmt, nullptr) != SQLITE_OK) {
            rollback();
            return {{"error", "Failed to prepare item insert"}};
        }

        sqlite3_bind_int64(stmt, 1, invoiceId);
        sqlite3_bind_int(stmt, 2, medicineId);
        sqlite3_bind_int(stmt, 3, batchId);
        sqlite3_bind_text(stmt, 4, medName.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 5, batchNo.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 6, expiry.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_int(stmt, 7, qty);
        sqlite3_bind_text(stmt, 8, unitType.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_int(stmt, 9, packSize);
        sqlite3_bind_double(stmt, 10, unitPrice);
        sqlite3_bind_double(stmt, 11, discPercent);
        sqlite3_bind_double(stmt, 12, totalPrice);

        if (sqlite3_step(stmt) != SQLITE_DONE) {
            sqlite3_finalize(stmt);
            rollback();
            return {{"error", "Failed to insert invoice item"}};
        }
        sqlite3_finalize(stmt);
    }

    // 3. Khata Accounting: If customer and credit/khata sale
    double unpaidAmount = totalAmount - paidAmount;
    if (customerId > 0 && unpaidAmount > 0.001) {
        // Customer credit ledger debit
        json custRes = query("SELECT current_balance, credit_limit, name FROM customers WHERE id = " + std::to_string(customerId));
        if (!custRes.empty()) {
            double curBal = custRes[0]["current_balance"].get<double>();
            double newBal = curBal + unpaidAmount;

            execute("UPDATE customers SET current_balance = " + std::to_string(newBal) + " WHERE id = " + std::to_string(customerId));

            const char* ledgerSql = "INSERT INTO customer_ledger (customer_id, date, transaction_type, reference_id, debit, credit, balance, notes) VALUES (?, ?, 'SALE', ?, ?, 0.0, ?, ?);";
            if (sqlite3_prepare_v2(db, ledgerSql, -1, &stmt, nullptr) == SQLITE_OK) {
                sqlite3_bind_int(stmt, 1, customerId);
                sqlite3_bind_text(stmt, 2, dateStr.c_str(), -1, SQLITE_TRANSIENT);
                sqlite3_bind_int64(stmt, 3, invoiceId);
                sqlite3_bind_double(stmt, 4, unpaidAmount);
                sqlite3_bind_double(stmt, 5, newBal);
                std::string ledgerNote = "Invoice #" + invoiceNum + " (Total: " + std::to_string(totalAmount) + ", Paid: " + std::to_string(paidAmount) + ")";
                sqlite3_bind_text(stmt, 6, ledgerNote.c_str(), -1, SQLITE_TRANSIENT);
                sqlite3_step(stmt);
                sqlite3_finalize(stmt);
            }
        }
    }

    // 4. Daybook entry — only physical cash touches the drawer. Online/Card do not.
    // A Credit sale with a partial cash payment does place that cash in the drawer.
    bool physicalCash = (paymentMode == "CASH" || paymentMode == "CREDIT");
    if (paidAmount > 0.001 && physicalCash) {
        std::string daybookNote = "Sale Cash: " + invoiceNum;
        if (customerId > 0) daybookNote += " (" + customerName + ")";
        const char* dbkSql = "INSERT INTO daybook (date, entry_type, amount, direction, reference_id, session_id, notes) VALUES (?, 'CASH_SALE', ?, 'IN', ?, ?, ?);";
        if (sqlite3_prepare_v2(db, dbkSql, -1, &stmt, nullptr) == SQLITE_OK) {
            sqlite3_bind_text(stmt, 1, dateStr.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_bind_double(stmt, 2, paidAmount);
            sqlite3_bind_int64(stmt, 3, invoiceId);
            int sid = currentSessionId();
            if (sid > 0) sqlite3_bind_int(stmt, 4, sid); else sqlite3_bind_null(stmt, 4);
            sqlite3_bind_text(stmt, 5, daybookNote.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_step(stmt);
            sqlite3_finalize(stmt);
        }
    }

    commit();

    return getInvoiceByIdInternal(static_cast<int>(invoiceId));
}

json Database::getInvoices(int limit, int offset, const std::string& date) {
    std::lock_guard<std::mutex> lock(dbMutex);
    std::string sql = "SELECT * FROM invoices";
    if (!date.empty()) {
        sql += " WHERE date LIKE " + sqlQuote(date + "%");
    }
    sql += " ORDER BY id DESC LIMIT " + std::to_string(limit) + " OFFSET " + std::to_string(offset) + ";";
    
    json invs = query(sql);
    for (auto& inv : invs) {
        int invId = inv["id"].get<int>();
        inv["items"] = query("SELECT * FROM invoice_items WHERE invoice_id = " + std::to_string(invId));
    }
    return invs;
}

json Database::getInvoiceById(int id) {
    std::lock_guard<std::mutex> lock(dbMutex);
    return getInvoiceByIdInternal(id);
}

json Database::getInvoiceByIdInternal(int id) {
    // Caller must hold dbMutex. Used by createInvoice while its transaction is open.
    json res = query("SELECT * FROM invoices WHERE id = " + std::to_string(id));
    if (res.empty()) return nullptr;
    json inv = res[0];
    inv["items"] = query("SELECT * FROM invoice_items WHERE invoice_id = " + std::to_string(id));
    return inv;
}

json Database::returnInvoice(int invoiceId, const std::string& reason, const std::string& refundMode) {
    std::lock_guard<std::mutex> lock(dbMutex);
    beginTransaction();

    json invRes = query("SELECT * FROM invoices WHERE id = " + std::to_string(invoiceId));
    if (invRes.empty()) {
        rollback();
        return {{"error", "Invoice not found"}};
    }
    json inv = invRes[0];
    if (inv["status"] == "RETURNED") {
        rollback();
        return {{"error", "Invoice is already returned"}};
    }

    // 1. Restock items back into batches in exact base units
    json items = query("SELECT * FROM invoice_items WHERE invoice_id = " + std::to_string(invoiceId));
    for (const auto& it : items) {
        int batchId = (it.contains("batch_id") && !it["batch_id"].is_null()) ? it["batch_id"].get<int>() : 0;
        int qty = (it.contains("quantity") && !it["quantity"].is_null()) ? it["quantity"].get<int>() : 0;
        int packSize = (it.contains("pack_size") && !it["pack_size"].is_null()) ? it["pack_size"].get<int>() : 1;
        std::string unitType = (it.contains("unit_type") && !it["unit_type"].is_null()) ? it["unit_type"].get<std::string>() : "Pack";
        int baseQtyToReturn = (unitType == "Pack" && packSize > 1) ? (qty * packSize) : qty;
        if (batchId > 0) {
            execute("UPDATE batches SET quantity = quantity + " + std::to_string(baseQtyToReturn) + " WHERE id = " + std::to_string(batchId));
        }
    }

    // 2. Reverse Customer Ledger if credit sale
    int customerId = (inv.contains("customer_id") && !inv["customer_id"].is_null()) ? inv["customer_id"].get<int>() : 0;
    double totalAmount = (inv.contains("total_amount") && !inv["total_amount"].is_null()) ? inv["total_amount"].get<double>() : 0.0;
    double paidAmount = (inv.contains("paid_amount") && !inv["paid_amount"].is_null()) ? inv["paid_amount"].get<double>() : 0.0;
    double unpaidAmount = totalAmount - paidAmount;
    std::string dateStr = Utils::getCurrentDateTime();

    if (customerId > 0 && unpaidAmount > 0.001) {
        json custRes = query("SELECT current_balance FROM customers WHERE id = " + std::to_string(customerId));
        if (!custRes.empty()) {
            double curBal = custRes[0]["current_balance"].get<double>();
            double newBal = curBal - unpaidAmount;
            execute("UPDATE customers SET current_balance = " + std::to_string(newBal) + " WHERE id = " + std::to_string(customerId));

            std::string returnNote = "Return of Invoice #" + inv["invoice_number"].get<std::string>();
            execute("INSERT INTO customer_ledger (customer_id, date, transaction_type, reference_id, debit, credit, balance, notes) VALUES (" +
                    std::to_string(customerId) + ", " + sqlQuote(dateStr) + ", 'RETURN', " + std::to_string(invoiceId) + ", 0.0, " +
                    std::to_string(unpaidAmount) + ", " + std::to_string(newBal) + ", " + sqlQuote(returnNote) + ");");
        }
    }

    // 3. Daybook cash outflow only when the refund actually leaves the drawer
    if (paidAmount > 0.001 && refundMode == "CASH") {
        std::string refundNote = "Refund for Returned Invoice #" + inv["invoice_number"].get<std::string>() + ": " + reason;
        int sid = currentSessionId();
        execute("INSERT INTO daybook (date, entry_type, amount, direction, reference_id, session_id, notes) VALUES (" +
                sqlQuote(dateStr) + ", 'SALE_RETURN', " + std::to_string(paidAmount) + ", 'OUT', " + std::to_string(invoiceId) +
                ", " + (sid > 0 ? std::to_string(sid) : "NULL") + ", " + sqlQuote(refundNote) + ");");
    }

    // 4. Update Invoice status
    execute("UPDATE invoices SET status = 'RETURNED' WHERE id = " + std::to_string(invoiceId));

    commit();
    return {{"success", true}, {"message", "Invoice successfully returned and stock replenished."}};
}

// ---------------- PARKED INVOICES ----------------

json Database::parkInvoice(const json& cartData) {
    std::lock_guard<std::mutex> lock(dbMutex);
    std::string custName = cartData.value("customer_name", "Parked Bill");
    std::string cartStr = cartData.dump();

    sqlite3_stmt* stmt;
    const char* sql = "INSERT INTO parked_invoices (customer_name, cart_data) VALUES (?, ?);";
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) != SQLITE_OK) return nullptr;

    sqlite3_bind_text(stmt, 1, custName.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 2, cartStr.c_str(), -1, SQLITE_TRANSIENT);

    sqlite3_step(stmt);
    sqlite3_finalize(stmt);
    int64_t id = lastInsertRowId();

    return {{"id", id}, {"status", "PARKED"}};
}

json Database::getParkedInvoices() {
    std::lock_guard<std::mutex> lock(dbMutex);
    return query("SELECT * FROM parked_invoices ORDER BY id DESC;");
}

bool Database::deleteParkedInvoice(int id) {
    std::lock_guard<std::mutex> lock(dbMutex);
    return execute("DELETE FROM parked_invoices WHERE id = " + std::to_string(id));
}

// ---------------- CUSTOMERS & KHATA ----------------

json Database::getCustomers(const std::string& search) {
    std::lock_guard<std::mutex> lock(dbMutex);
    std::string sql = "SELECT * FROM customers";
    if (!search.empty()) {
        std::string pattern = sqlQuote("%" + search + "%");
        sql += " WHERE name LIKE " + pattern + " OR phone LIKE " + pattern;
    }
    sql += " ORDER BY name ASC;";
    return query(sql);
}

json Database::getCustomerById(int id) {
    std::lock_guard<std::mutex> lock(dbMutex);
    json res = query("SELECT * FROM customers WHERE id = " + std::to_string(id));
    if (res.empty()) return nullptr;
    return res[0];
}

int64_t Database::createCustomer(const json& c) {
    std::lock_guard<std::mutex> lock(dbMutex);
    sqlite3_stmt* stmt;
    const char* sql = "INSERT INTO customers (name, phone, address, credit_limit, current_balance, notes) VALUES (?, ?, ?, ?, ?, ?);";
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) != SQLITE_OK) return -1;

    sqlite3_bind_text(stmt, 1, c.value("name", "").c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 2, c.value("phone", "").c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 3, c.value("address", "").c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_double(stmt, 4, c.value("credit_limit", 10000.0));
    double openingBal = c.value("current_balance", 0.0);
    sqlite3_bind_double(stmt, 5, openingBal);
    sqlite3_bind_text(stmt, 6, c.value("notes", "").c_str(), -1, SQLITE_TRANSIENT);

    int rc = sqlite3_step(stmt);
    sqlite3_finalize(stmt);
    if (rc != SQLITE_DONE) return -1;
    int64_t custId = lastInsertRowId();

    if (openingBal != 0.0) {
        std::string dateStr = Utils::getCurrentDateTime();
        execute("INSERT INTO customer_ledger (customer_id, date, transaction_type, reference_id, debit, credit, balance, notes) VALUES (" +
                std::to_string(custId) + ", '" + dateStr + "', 'OPENING', NULL, " +
                (openingBal > 0 ? std::to_string(openingBal) : "0.0") + ", " +
                (openingBal < 0 ? std::to_string(-openingBal) : "0.0") + ", " +
                std::to_string(openingBal) + ", 'Opening Balance Entry');");
    }
    return custId;
}

bool Database::updateCustomer(int id, const json& c) {
    std::lock_guard<std::mutex> lock(dbMutex);
    sqlite3_stmt* stmt;
    const char* sql = "UPDATE customers SET name=?, phone=?, address=?, credit_limit=?, notes=? WHERE id=?;";
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) != SQLITE_OK) return false;

    sqlite3_bind_text(stmt, 1, c.value("name", "").c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 2, c.value("phone", "").c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 3, c.value("address", "").c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_double(stmt, 4, c.value("credit_limit", 10000.0));
    sqlite3_bind_text(stmt, 5, c.value("notes", "").c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_int(stmt, 6, id);

    int rc = sqlite3_step(stmt);
    sqlite3_finalize(stmt);
    return rc == SQLITE_DONE;
}

json Database::getCustomerLedger(int customerId) {
    std::lock_guard<std::mutex> lock(dbMutex);
    std::string sql = "SELECT * FROM customer_ledger WHERE customer_id = " + std::to_string(customerId) + " ORDER BY id ASC;";
    return query(sql);
}

json Database::recordCustomerPayment(int customerId, double amount, const std::string& paymentMode, const std::string& notes) {
    std::lock_guard<std::mutex> lock(dbMutex);
    beginTransaction();

    json custRes = query("SELECT current_balance, name FROM customers WHERE id = " + std::to_string(customerId));
    if (custRes.empty()) {
        rollback();
        return {{"error", "Customer not found"}};
    }

    double curBal = custRes[0]["current_balance"].get<double>();
    double newBal = curBal - amount;
    std::string custName = custRes[0]["name"].get<std::string>();
    std::string dateStr = Utils::getCurrentDateTime();

    // 1. Update Customer Balance
    execute("UPDATE customers SET current_balance = " + std::to_string(newBal) + " WHERE id = " + std::to_string(customerId));

    // 2. Add Ledger Entry (Credit)
    sqlite3_stmt* stmt;
    const char* ledSql = "INSERT INTO customer_ledger (customer_id, date, transaction_type, reference_id, debit, credit, balance, notes) VALUES (?, ?, 'PAYMENT', NULL, 0.0, ?, ?, ?);";
    if (sqlite3_prepare_v2(db, ledSql, -1, &stmt, nullptr) != SQLITE_OK) {
        rollback();
        return {{"error", "Failed to insert customer ledger record"}};
    }
    sqlite3_bind_int(stmt, 1, customerId);
    sqlite3_bind_text(stmt, 2, dateStr.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_double(stmt, 3, amount);
    sqlite3_bind_double(stmt, 4, newBal);
    std::string fullNote = "Payment Received (" + paymentMode + ")";
    if (!notes.empty()) fullNote += " - " + notes;
    sqlite3_bind_text(stmt, 5, fullNote.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_step(stmt);
    sqlite3_finalize(stmt);

    // 3. Daybook Cash Entry
    if (paymentMode == "CASH") {
        std::string dbkNote = "Khata Collection: " + custName + (notes.empty() ? "" : " (" + notes + ")");
        int sid = currentSessionId();
        execute("INSERT INTO daybook (date, entry_type, amount, direction, session_id, notes) VALUES (" +
                sqlQuote(dateStr) + ", 'KHATA_COLLECTION', " + std::to_string(amount) + ", 'IN', " +
                (sid > 0 ? std::to_string(sid) : "NULL") + ", " + sqlQuote(dbkNote) + ");");
    }

    commit();
    return {{"success", true}, {"new_balance", newBal}};
}

// ---------------- SUPPLIERS & KHATA ----------------

json Database::getSuppliers(const std::string& search) {
    std::lock_guard<std::mutex> lock(dbMutex);
    std::string sql = "SELECT * FROM suppliers";
    if (!search.empty()) {
        std::string pattern = sqlQuote("%" + search + "%");
        sql += " WHERE name LIKE " + pattern + " OR contact_person LIKE " + pattern + " OR phone LIKE " + pattern;
    }
    sql += " ORDER BY name ASC;";
    return query(sql);
}

json Database::getSupplierById(int id) {
    std::lock_guard<std::mutex> lock(dbMutex);
    json res = query("SELECT * FROM suppliers WHERE id = " + std::to_string(id));
    if (res.empty()) return nullptr;
    return res[0];
}

int64_t Database::createSupplier(const json& s) {
    std::lock_guard<std::mutex> lock(dbMutex);
    sqlite3_stmt* stmt;
    const char* sql = "INSERT INTO suppliers (name, contact_person, phone, email, address, current_balance, notes) VALUES (?, ?, ?, ?, ?, ?, ?);";
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) != SQLITE_OK) return -1;

    sqlite3_bind_text(stmt, 1, s.value("name", "").c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 2, s.value("contact_person", "").c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 3, s.value("phone", "").c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 4, s.value("email", "").c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 5, s.value("address", "").c_str(), -1, SQLITE_TRANSIENT);
    double openingBal = s.value("current_balance", 0.0);
    sqlite3_bind_double(stmt, 6, openingBal);
    sqlite3_bind_text(stmt, 7, s.value("notes", "").c_str(), -1, SQLITE_TRANSIENT);

    int rc = sqlite3_step(stmt);
    sqlite3_finalize(stmt);
    if (rc != SQLITE_DONE) return -1;
    int64_t suppId = lastInsertRowId();

    if (openingBal != 0.0) {
        std::string dateStr = Utils::getCurrentDateTime();
        execute("INSERT INTO supplier_ledger (supplier_id, date, transaction_type, reference_id, debit, credit, balance, notes) VALUES (" +
                std::to_string(suppId) + ", '" + dateStr + "', 'OPENING', NULL, 0.0, " +
                std::to_string(openingBal) + ", " + std::to_string(openingBal) + ", 'Opening Balance Entry');");
    }
    return suppId;
}

bool Database::updateSupplier(int id, const json& s) {
    std::lock_guard<std::mutex> lock(dbMutex);
    sqlite3_stmt* stmt;
    const char* sql = "UPDATE suppliers SET name=?, contact_person=?, phone=?, email=?, address=?, notes=? WHERE id=?;";
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) != SQLITE_OK) return false;

    sqlite3_bind_text(stmt, 1, s.value("name", "").c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 2, s.value("contact_person", "").c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 3, s.value("phone", "").c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 4, s.value("email", "").c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 5, s.value("address", "").c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 6, s.value("notes", "").c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_int(stmt, 7, id);

    int rc = sqlite3_step(stmt);
    sqlite3_finalize(stmt);
    return rc == SQLITE_DONE;
}

json Database::getSupplierLedger(int supplierId) {
    std::lock_guard<std::mutex> lock(dbMutex);
    std::string sql = "SELECT * FROM supplier_ledger WHERE supplier_id = " + std::to_string(supplierId) + " ORDER BY id ASC;";
    return query(sql);
}

json Database::recordSupplierPayment(int supplierId, double amount, const std::string& paymentMode, const std::string& notes) {
    std::lock_guard<std::mutex> lock(dbMutex);
    beginTransaction();

    json suppRes = query("SELECT current_balance, name FROM suppliers WHERE id = " + std::to_string(supplierId));
    if (suppRes.empty()) {
        rollback();
        return {{"error", "Supplier not found"}};
    }

    double curBal = suppRes[0]["current_balance"].get<double>();
    double newBal = curBal - amount;
    std::string suppName = suppRes[0]["name"].get<std::string>();
    std::string dateStr = Utils::getCurrentDateTime();

    // 1. Update Supplier Balance
    execute("UPDATE suppliers SET current_balance = " + std::to_string(newBal) + " WHERE id = " + std::to_string(supplierId));

    // 2. Add Supplier Ledger Entry (Debit decreases payable)
    sqlite3_stmt* stmt;
    const char* ledSql = "INSERT INTO supplier_ledger (supplier_id, date, transaction_type, reference_id, debit, credit, balance, notes) VALUES (?, ?, 'PAYMENT', NULL, ?, 0.0, ?, ?);";
    if (sqlite3_prepare_v2(db, ledSql, -1, &stmt, nullptr) != SQLITE_OK) {
        rollback();
        return {{"error", "Failed to insert supplier ledger record"}};
    }
    sqlite3_bind_int(stmt, 1, supplierId);
    sqlite3_bind_text(stmt, 2, dateStr.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_double(stmt, 3, amount);
    sqlite3_bind_double(stmt, 4, newBal);
    std::string fullNote = "Payment Made (" + paymentMode + ")";
    if (!notes.empty()) fullNote += " - " + notes;
    sqlite3_bind_text(stmt, 5, fullNote.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_step(stmt);
    sqlite3_finalize(stmt);

    // 3. Daybook Cash Outflow Entry
    if (paymentMode == "CASH") {
        std::string dbkNote = "Supplier Payment: " + suppName + (notes.empty() ? "" : " (" + notes + ")");
        int sid = currentSessionId();
        execute("INSERT INTO daybook (date, entry_type, amount, direction, session_id, notes) VALUES (" +
                sqlQuote(dateStr) + ", 'SUPPLIER_PAYMENT', " + std::to_string(amount) + ", 'OUT', " +
                (sid > 0 ? std::to_string(sid) : "NULL") + ", " + sqlQuote(dbkNote) + ");");
    }

    commit();
    return {{"success", true}, {"new_balance", newBal}};
}

// ---------------- PURCHASES (GRN) ----------------

json Database::createPurchase(const json& p) {
    std::lock_guard<std::mutex> lock(dbMutex);
    beginTransaction();

    int supplierId = p.value("supplier_id", 0);
    std::string invNum = p.value("invoice_number", Utils::generatePurchaseNumber());
    std::string pDate = p.value("purchase_date", Utils::getCurrentDate());
    double subtotal = p.value("subtotal", 0.0);
    double discount = p.value("discount_amount", 0.0);
    double tax = p.value("tax_amount", 0.0);
    double total = p.value("total_amount", 0.0);
    double paid = p.value("paid_amount", 0.0);
    std::string notes = p.value("notes", "");
    std::string payMode = p.value("payment_mode", "CASH");
    std::string status = (paid >= total) ? "PAID" : ((paid > 0) ? "PARTIAL" : "UNPAID");

    // 1. Insert Purchase
    sqlite3_stmt* stmt;
    const char* insSql = "INSERT INTO purchases (invoice_number, supplier_id, purchase_date, subtotal, discount_amount, tax_amount, total_amount, paid_amount, payment_status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);";
    if (sqlite3_prepare_v2(db, insSql, -1, &stmt, nullptr) != SQLITE_OK) {
        rollback();
        return {{"error", "Failed to prepare purchase insert"}};
    }
    sqlite3_bind_text(stmt, 1, invNum.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_int(stmt, 2, supplierId);
    sqlite3_bind_text(stmt, 3, pDate.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_double(stmt, 4, subtotal);
    sqlite3_bind_double(stmt, 5, discount);
    sqlite3_bind_double(stmt, 6, tax);
    sqlite3_bind_double(stmt, 7, total);
    sqlite3_bind_double(stmt, 8, paid);
    sqlite3_bind_text(stmt, 9, status.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 10, notes.c_str(), -1, SQLITE_TRANSIENT);

    if (sqlite3_step(stmt) != SQLITE_DONE) {
        sqlite3_finalize(stmt);
        rollback();
        return {{"error", "Failed to insert purchase record"}};
    }
    sqlite3_finalize(stmt);
    int64_t purchaseId = lastInsertRowId();

    // 2. Insert items and add/update batches
    if (!p.contains("items") || !p["items"].is_array()) {
        rollback();
        return {{"error", "Purchase must contain items"}};
    }

    for (const auto& item : p["items"]) {
        int medId = item.value("medicine_id", 0);
        std::string batchNo = item.value("batch_number", "");
        std::string expiry = item.value("expiry_date", "");
        int qty = item.value("quantity", 0);
        int bonus = item.value("bonus_quantity", 0);
        double pRate = item.value("purchase_rate", 0.0);
        double sRate = item.value("sale_rate", 0.0);
        double itemTotal = item.value("total_amount", 0.0);

        // Resolve pack size and unit type
        int packSize = item.value("pack_size", 1);
        if (packSize <= 1) {
            json medRes = query("SELECT pack_size FROM medicines WHERE id = " + std::to_string(medId));
            if (!medRes.empty()) {
                packSize = medRes[0].value("pack_size", 1);
            }
        }
        std::string unitType = item.value("unit_type", "Pack"); // "Pack" or "Loose"
        int multiplier = (unitType == "Pack" && packSize > 1) ? packSize : 1;
        int totalBaseQty = (qty + bonus) * multiplier;

        // Purchase cost (purchase_rate) is kept per pack; sale_rate is normalized to
        // one base unit because the POS always sells in base units.
        double batchSaleRate = (unitType == "Pack" && packSize > 1) ? (sRate / packSize) : sRate;

        // Check if batch already exists
        std::string chkSql = "SELECT id FROM batches WHERE medicine_id = " + std::to_string(medId) + " AND batch_number = '" + batchNo + "';";
        json bRes = query(chkSql);
        if (!bRes.empty()) {
            int existingBatchId = bRes[0]["id"].get<int>();
            execute("UPDATE batches SET quantity = quantity + " + std::to_string(totalBaseQty) + ", purchase_rate = " + std::to_string(pRate) +
                    ", sale_rate = " + std::to_string(batchSaleRate) + ", expiry_date = '" + expiry + "' WHERE id = " + std::to_string(existingBatchId));
        } else {
            execute("INSERT INTO batches (medicine_id, batch_number, expiry_date, purchase_rate, sale_rate, quantity) VALUES (" +
                    std::to_string(medId) + ", '" + batchNo + "', '" + expiry + "', " + std::to_string(pRate) + ", " +
                    std::to_string(batchSaleRate) + ", " + std::to_string(totalBaseQty) + ");");
        }

        // Insert Purchase Item
        const char* pItemSql = "INSERT INTO purchase_items (purchase_id, medicine_id, batch_number, expiry_date, quantity, bonus_quantity, purchase_rate, sale_rate, total_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);";
        if (sqlite3_prepare_v2(db, pItemSql, -1, &stmt, nullptr) == SQLITE_OK) {
            sqlite3_bind_int64(stmt, 1, purchaseId);
            sqlite3_bind_int(stmt, 2, medId);
            sqlite3_bind_text(stmt, 3, batchNo.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_bind_text(stmt, 4, expiry.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_bind_int(stmt, 5, qty);
            sqlite3_bind_int(stmt, 6, bonus);
            sqlite3_bind_double(stmt, 7, pRate);
            sqlite3_bind_double(stmt, 8, sRate);
            sqlite3_bind_double(stmt, 9, itemTotal);
            sqlite3_step(stmt);
            sqlite3_finalize(stmt);
        }
    }

    // 3. Update Supplier Khata (Ledger)
    json suppRes = query("SELECT current_balance, name FROM suppliers WHERE id = " + std::to_string(supplierId));
    if (!suppRes.empty()) {
        double curBal = suppRes[0]["current_balance"].get<double>();
        double netPayableIncrease = total - paid;
        double newBal = curBal + netPayableIncrease;
        std::string suppName = suppRes[0]["name"].get<std::string>();
        std::string dt = Utils::getCurrentDateTime();

        execute("UPDATE suppliers SET current_balance = " + std::to_string(newBal) + " WHERE id = " + std::to_string(supplierId));

        // Credit to supplier ledger for total bill
        execute("INSERT INTO supplier_ledger (supplier_id, date, transaction_type, reference_id, debit, credit, balance, notes) VALUES (" +
                std::to_string(supplierId) + ", '" + dt + "', 'PURCHASE', " + std::to_string(purchaseId) + ", 0.0, " +
                std::to_string(total) + ", " + std::to_string(curBal + total) + ", 'Purchase Invoice #" + invNum + "');");

        // If paid immediately, record debit
        if (paid > 0.001) {
            execute("INSERT INTO supplier_ledger (supplier_id, date, transaction_type, reference_id, debit, credit, balance, notes) VALUES (" +
                    std::to_string(supplierId) + ", " + sqlQuote(dt) + ", 'PAYMENT', " + std::to_string(purchaseId) + ", " +
                    std::to_string(paid) + ", 0.0, " + std::to_string(newBal) + ", " +
                    sqlQuote("Cash Paid on Purchase #" + invNum) + ");");

            if (payMode == "CASH") {
                int sid = currentSessionId();
                execute("INSERT INTO daybook (date, entry_type, amount, direction, reference_id, session_id, notes) VALUES (" +
                        sqlQuote(dt) + ", 'PURCHASE_PAYMENT', " + std::to_string(paid) + ", 'OUT', " + std::to_string(purchaseId) +
                        ", " + (sid > 0 ? std::to_string(sid) : "NULL") + ", " +
                        sqlQuote("Purchase Cash Payment to " + suppName) + ");");
            }
        }
    }

    commit();
    return {{"success", true}, {"purchase_id", purchaseId}};
}

json Database::getPurchases(int limit) {
    std::lock_guard<std::mutex> lock(dbMutex);
    std::string sql = R"(
        SELECT p.*, s.name as supplier_name, s.phone as supplier_phone
        FROM purchases p
        JOIN suppliers s ON p.supplier_id = s.id
        ORDER BY p.id DESC LIMIT 
    )" + std::to_string(limit) + ";";

    json rows = query(sql);
    for (auto& row : rows) {
        int pId = row["id"].get<int>();
        std::string itemSql = R"(
            SELECT pi.*, m.name as medicine_name, m.generic_name
            FROM purchase_items pi
            JOIN medicines m ON pi.medicine_id = m.id
            WHERE pi.purchase_id = 
        )" + std::to_string(pId);
        row["items"] = query(itemSql);
    }
    return rows;
}

// ---------------- DAYBOOK & CASH DRAWER ----------------

json Database::getDaybook(const std::string& date) {
    std::lock_guard<std::mutex> lock(dbMutex);
    std::string targetDate = date.empty() ? Utils::getCurrentDate() : date;
    std::string sql = "SELECT * FROM daybook WHERE date LIKE " + sqlQuote(targetDate + "%") + " ORDER BY id ASC;";
    json entries = query(sql);

    double totalIn = 0.0;
    double totalOut = 0.0;
    for (const auto& e : entries) {
        double amt = e.value("amount", 0.0);
        std::string dir = e.value("direction", "IN");
        if (dir == "IN") totalIn += amt;
        else totalOut += amt;
    }

    return {
        {"date", targetDate},
        {"entries", entries},
        {"total_in", totalIn},
        {"total_out", totalOut},
        {"net_cash", totalIn - totalOut}
    };
}

int Database::currentSessionId() {
    // Caller holds dbMutex
    json res = query("SELECT id FROM cash_drawer_sessions WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1;");
    if (res.empty()) return 0;
    return res[0]["id"].get<int>();
}

json Database::addDaybookEntry(const std::string& entryType, double amount, const std::string& direction, const std::string& notes) {
    std::lock_guard<std::mutex> lock(dbMutex);
    if (amount <= 0 || (direction != "IN" && direction != "OUT")) {
        return {{"error", "A positive amount and a valid direction are required"}};
    }
    std::string dt = Utils::getCurrentDateTime();
    sqlite3_stmt* stmt;
    const char* sql = "INSERT INTO daybook (date, entry_type, amount, direction, session_id, notes) VALUES (?, ?, ?, ?, ?, ?);";
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) != SQLITE_OK) return {{"error", "Failed to add entry"}};

    sqlite3_bind_text(stmt, 1, dt.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 2, entryType.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_double(stmt, 3, amount);
    sqlite3_bind_text(stmt, 4, direction.c_str(), -1, SQLITE_TRANSIENT);
    int sid = currentSessionId();
    if (sid > 0) sqlite3_bind_int(stmt, 5, sid); else sqlite3_bind_null(stmt, 5);
    sqlite3_bind_text(stmt, 6, notes.c_str(), -1, SQLITE_TRANSIENT);

    sqlite3_step(stmt);
    sqlite3_finalize(stmt);
    return {{"success", true}};
}

json Database::openCashDrawer(double openingFloat, const std::string& notes) {
    std::lock_guard<std::mutex> lock(dbMutex);
    if (openingFloat < 0) return {{"error", "Opening float cannot be negative"}};
    if (currentSessionId() > 0) return {{"error", "A cash drawer session is already open"}};

    beginTransaction();
    std::string now = Utils::getCurrentDateTime();
    sqlite3_stmt* stmt;
    const char* ins = "INSERT INTO cash_drawer_sessions (opened_at, opening_float, status, notes) VALUES (?, ?, 'OPEN', ?);";
    if (sqlite3_prepare_v2(db, ins, -1, &stmt, nullptr) != SQLITE_OK) {
        rollback();
        return {{"error", "Failed to open cash drawer"}};
    }
    sqlite3_bind_text(stmt, 1, now.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_double(stmt, 2, openingFloat);
    sqlite3_bind_text(stmt, 3, notes.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_step(stmt);
    sqlite3_finalize(stmt);
    int sessionId = static_cast<int>(lastInsertRowId());

    const char* dbk = "INSERT INTO daybook (date, entry_type, amount, direction, session_id, notes) VALUES (?, 'OPENING_FLOAT', ?, 'IN', ?, ?);";
    if (sqlite3_prepare_v2(db, dbk, -1, &stmt, nullptr) == SQLITE_OK) {
        std::string note = "Opening cash float" + (notes.empty() ? std::string() : " — " + notes);
        sqlite3_bind_text(stmt, 1, now.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_double(stmt, 2, openingFloat);
        sqlite3_bind_int(stmt, 3, sessionId);
        sqlite3_bind_text(stmt, 4, note.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_step(stmt);
        sqlite3_finalize(stmt);
    }
    commit();
    return getCashDrawerStatusInternal();
}

json Database::closeCashDrawer(double countedAmount, const std::string& notes) {
    std::lock_guard<std::mutex> lock(dbMutex);
    int sid = currentSessionId();
    if (sid == 0) return {{"error", "No cash drawer session is open"}};
    if (countedAmount < 0) return {{"error", "Counted cash cannot be negative"}};

    json totals = query(
        "SELECT COALESCE(SUM(CASE WHEN direction = 'IN' THEN amount ELSE -amount END), 0) AS expected, "
        "COALESCE(SUM(CASE WHEN direction = 'IN' THEN amount ELSE 0 END), 0) AS total_in, "
        "COALESCE(SUM(CASE WHEN direction = 'OUT' THEN amount ELSE 0 END), 0) AS total_out "
        "FROM daybook WHERE session_id = " + std::to_string(sid) + ";");
    double expected = totals.empty() ? 0.0 : totals[0].value("expected", 0.0);
    double variance = countedAmount - expected;
    std::string now = Utils::getCurrentDateTime();

    std::string finalNotes = notes;
    if (!finalNotes.empty()) {
        json session = query("SELECT notes FROM cash_drawer_sessions WHERE id = " + std::to_string(sid) + ";");
        if (!session.empty() && !session[0]["notes"].is_null() && !session[0]["notes"].get<std::string>().empty()) {
            finalNotes = session[0]["notes"].get<std::string>() + " | " + notes;
        }
    }
    execute("UPDATE cash_drawer_sessions SET closed_at = " + sqlQuote(now) +
            ", expected_closing = " + std::to_string(expected) +
            ", counted_closing = " + std::to_string(countedAmount) +
            ", variance = " + std::to_string(variance) +
            ", status = 'CLOSED', notes = " + sqlQuote(finalNotes) +
            " WHERE id = " + std::to_string(sid) + ";");
    return {{"success", true}, {"session_id", sid}, {"expected_closing", expected},
            {"counted_closing", countedAmount}, {"variance", variance}};
}

json Database::getCashDrawerStatus() {
    std::lock_guard<std::mutex> lock(dbMutex);
    return getCashDrawerStatusInternal();
}

json Database::getCashDrawerStatusInternal() {
    int sid = currentSessionId();
    if (sid == 0) {
        return {{"session", nullptr}, {"expected_balance", 0.0}, {"total_in", 0.0},
                {"total_out", 0.0}, {"movements", json::array()}, {"breakdown", json::object()}};
    }

    json sessionRows = query("SELECT * FROM cash_drawer_sessions WHERE id = " + std::to_string(sid) + ";");
    json movements = query("SELECT * FROM daybook WHERE session_id = " + std::to_string(sid) + " ORDER BY id ASC;");
    json totals = query(
        "SELECT COALESCE(SUM(CASE WHEN direction = 'IN' THEN amount ELSE -amount END), 0) AS expected, "
        "COALESCE(SUM(CASE WHEN direction = 'IN' THEN amount ELSE 0 END), 0) AS total_in, "
        "COALESCE(SUM(CASE WHEN direction = 'OUT' THEN amount ELSE 0 END), 0) AS total_out "
        "FROM daybook WHERE session_id = " + std::to_string(sid) + ";");

    json breakdown = json::object();
    for (const auto& movement : movements) {
        std::string type = movement.value("entry_type", "OTHER");
        double amount = movement.value("amount", 0.0);
        bool cashIn = movement.value("direction", "IN") == "IN";
        if (!breakdown.contains(type)) breakdown[type] = {{"in", 0.0}, {"out", 0.0}};
        breakdown[type][cashIn ? "in" : "out"] = breakdown[type][cashIn ? "in" : "out"].get<double>() + amount;
    }

    double expected = totals.empty() ? 0.0 : totals[0].value("expected", 0.0);
    return {
        {"session", sessionRows.empty() ? json(nullptr) : sessionRows[0]},
        {"expected_balance", expected},
        {"total_in", totals.empty() ? 0.0 : totals[0].value("total_in", 0.0)},
        {"total_out", totals.empty() ? 0.0 : totals[0].value("total_out", 0.0)},
        {"movements", movements},
        {"breakdown", breakdown}
    };
}

json Database::getCashDrawerHistory(int limit) {
    std::lock_guard<std::mutex> lock(dbMutex);
    return query("SELECT * FROM cash_drawer_sessions WHERE status = 'CLOSED' ORDER BY id DESC LIMIT " +
                 std::to_string(limit > 0 ? limit : 20) + ";");
}

json Database::addCashDrawerMovement(const std::string& entryType, double amount, const std::string& direction, const std::string& notes) {
    {
        std::lock_guard<std::mutex> lock(dbMutex);
        if (currentSessionId() == 0) {
            return {{"error", "Open the cash drawer before recording movements"}};
        }
    }
    return addDaybookEntry(entryType, amount, direction, notes);
}

// ---------------- DASHBOARD KPIS ----------------

json Database::getDashboardStats() {
    std::lock_guard<std::mutex> lock(dbMutex);
    std::string today = Utils::getCurrentDate();

    // Today's Sales
    json salesRes = query("SELECT COALESCE(SUM(total_amount), 0) as today_sales, COALESCE(SUM(paid_amount), 0) as today_cash_collected, COUNT(*) as invoice_count FROM invoices WHERE date LIKE " + sqlQuote(today + "%") + " AND status = 'COMPLETED';");
    double todaySales = salesRes.empty() ? 0.0 : salesRes[0]["today_sales"].get<double>();
    double todayCash = salesRes.empty() ? 0.0 : salesRes[0]["today_cash_collected"].get<double>();
    int64_t billCount = salesRes.empty() ? 0 : salesRes[0]["invoice_count"].get<int64_t>();

    // Customers Khata Total Due
    json custRes = query("SELECT COALESCE(SUM(current_balance), 0) as total_receivable, COUNT(*) as total_customers FROM customers WHERE current_balance > 0;");
    double totalReceivable = custRes.empty() ? 0.0 : custRes[0]["total_receivable"].get<double>();
    int64_t activeKhataCustomers = custRes.empty() ? 0 : custRes[0]["total_customers"].get<int64_t>();

    // Suppliers Khata Total Payable
    json suppRes = query("SELECT COALESCE(SUM(current_balance), 0) as total_payable, COUNT(*) as total_suppliers FROM suppliers WHERE current_balance > 0;");
    double totalPayable = suppRes.empty() ? 0.0 : suppRes[0]["total_payable"].get<double>();

    // Low stock count
    json lowStockRes = query(R"(
        SELECT COUNT(*) as low_stock_count FROM (
            SELECT m.id, m.min_stock_alert, COALESCE(SUM(b.quantity), 0) as cur_stock
            FROM medicines m
            LEFT JOIN batches b ON m.id = b.medicine_id AND b.is_quarantined = 0
            GROUP BY m.id
            HAVING cur_stock <= m.min_stock_alert
        );
    )");
    int64_t lowStockCount = lowStockRes.empty() ? 0 : lowStockRes[0]["low_stock_count"].get<int64_t>();

    // Expiry counts
    json batches = query("SELECT expiry_date FROM batches WHERE quantity > 0;");
    int expiredCount = 0;
    int criticalCount = 0;
    int warningCount = 0;

    for (const auto& b : batches) {
        int days = Utils::daysUntilExpiry(b.value("expiry_date", ""));
        if (days <= 0) expiredCount++;
        else if (days <= 30) criticalCount++;
        else if (days <= 90) warningCount++;
    }

    // Daybook cash drawer summary
    json dbkRes = query("SELECT COALESCE(SUM(CASE WHEN direction = 'IN' THEN amount ELSE -amount END), 0) as cash_in_drawer FROM daybook WHERE date LIKE " + sqlQuote(today + "%") + ";");
    double cashInDrawer = dbkRes.empty() ? 0.0 : dbkRes[0]["cash_in_drawer"].get<double>();

    return {
        {"today_sales", todaySales},
        {"today_cash_collected", todayCash},
        {"today_bills_count", billCount},
        {"total_receivable", totalReceivable},
        {"active_khata_customers", activeKhataCustomers},
        {"total_payable", totalPayable},
        {"low_stock_count", lowStockCount},
        {"expired_batches_count", expiredCount},
        {"critical_batches_count", criticalCount},
        {"warning_batches_count", warningCount},
        {"cash_in_drawer", cashInDrawer}
    };
}

// ---------------- SETTINGS ----------------

json Database::getSettings() {
    std::lock_guard<std::mutex> lock(dbMutex);
    json rows = query("SELECT key, value FROM settings;");
    json s = json::object();
    for (const auto& r : rows) {
        s[r["key"].get<std::string>()] = r["value"].get<std::string>();
    }
    return s;
}

bool Database::updateSetting(const std::string& key, const std::string& value) {
    std::lock_guard<std::mutex> lock(dbMutex);
    sqlite3_stmt* stmt;
    const char* sql = "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?);";
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) != SQLITE_OK) return false;

    sqlite3_bind_text(stmt, 1, key.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 2, value.c_str(), -1, SQLITE_TRANSIENT);

    int rc = sqlite3_step(stmt);
    sqlite3_finalize(stmt);
    return rc == SQLITE_DONE;
}

// ---------------- SEED INITIAL DATA ----------------

void Database::seedInitialDataIfNeeded() {
    std::lock_guard<std::mutex> lock(dbMutex);
    json countRes = query("SELECT COUNT(*) as count FROM medicines;");
    if (!countRes.empty() && countRes[0]["count"].get<int64_t>() > 0) {
        return; // Already seeded
    }

    std::cout << "[Seed] Initializing pharmacy database with sample medicines, batches, customers, and suppliers..." << std::endl;

    // Default Settings
    execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('pharmacy_name', 'A1 Pharmacy');");
    execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('phone', '+92 300 1234567');");
    execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('address', 'Main Boulevard, Gulberg III, Lahore');");
    execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('license_number', 'DL-PB-2026-8891');");
    execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('tax_number', 'NTN-7419283-1');");
    execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('currency_symbol', 'Rs.');");
    execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('currency_code', 'PKR');");

    // Medicines List
    struct SeedMed {
        const char* name;
        const char* generic;
        const char* cat;
        const char* mfr;
        const char* rack;
        const char* barcode;
        int packSize;
        const char* unitType;
        int minStock;
        int isRx;
    };

    SeedMed meds[] = {
        {"Panadol 500mg Tablets", "Paracetamol", "Analgesics & Antipyretics", "GSK Pakistan", "Rack A-01", "89640001001", 200, "Pack (10x20)", 50, 0},
        {"Panadol Extra 500mg", "Paracetamol + Caffeine", "Analgesics", "GSK Pakistan", "Rack A-01", "89640001002", 100, "Pack (10x10)", 30, 0},
        {"Augmentin 625mg Tablets", "Amoxicillin + Clavulanic Acid", "Antibiotics", "GSK Pakistan", "Rack B-03", "89640001003", 14, "Pack (2x7)", 15, 1},
        {"Augmentin 1g Tablets", "Amoxicillin + Clavulanic Acid", "Antibiotics", "GSK Pakistan", "Rack B-03", "89640001004", 14, "Pack (2x7)", 15, 1},
        {"Brufen 400mg Tablets", "Ibuprofen", "NSAIDs / Pain Relief", "Abbott Laboratories", "Rack A-02", "89640001005", 200, "Pack (10x20)", 40, 0},
        {"Brufen DS Suspension 120ml", "Ibuprofen 200mg/5ml", "Pediatric Pain & Fever", "Abbott Laboratories", "Rack A-04", "89640001006", 1, "Bottle", 20, 0},
        {"Glucophage 500mg", "Metformin HCl", "Anti-diabetic", "Martin Dow", "Rack C-01", "89640001007", 50, "Pack (5x10)", 25, 1},
        {"Glucophage 850mg", "Metformin HCl", "Anti-diabetic", "Martin Dow", "Rack C-01", "89640001008", 50, "Pack (5x10)", 20, 1},
        {"Lipitor 20mg Tablets", "Atorvastatin Calcium", "Cardiovascular / Lipid Lowering", "Pfizer", "Rack C-03", "89640001009", 30, "Pack (3x10)", 15, 1},
        {"Risek 20mg Capsules", "Omeprazole", "Gastrointestinal / PPI", "Getz Pharma", "Rack D-01", "89640001010", 14, "Pack (2x7)", 30, 0},
        {"Risek 40mg Capsules", "Omeprazole", "Gastrointestinal / PPI", "Getz Pharma", "Rack D-01", "89640001011", 14, "Pack (2x7)", 25, 0},
        {"Softin 10mg Tablets", "Loratadine", "Anti-allergic / Antihistamine", "Barrett Hodgson", "Rack E-02", "89640001012", 10, "Pack (1x10)", 20, 0},
        {"Flagyl 400mg Tablets", "Metronidazole", "Antiprotozoal / Antibacterial", "Sanofi Aventis", "Rack B-05", "89640001013", 200, "Pack (10x20)", 40, 1},
        {"Arinac Forte Tablets", "Ibuprofen + Pseudoephedrine", "Cold & Flu", "Abbott Laboratories", "Rack A-03", "89640001014", 100, "Pack (10x10)", 30, 0},
        {"Disprin 300mg Soluble", "Aspirin", "Analgesic / Antiplatelet", "Reckitt Benckiser", "Rack A-05", "89640001015", 300, "Pack (30x10)", 50, 0},
        {"Cac-1000 Plus Orange", "Calcium + Vitamin C + D3", "Vitamins & Minerals", "GSK Consumer", "Rack F-01", "89640001016", 20, "Tube", 25, 0},
        {"Sancos Syrup 120ml", "Dextromethorphan + Chlorpheniramine", "Cough & Cold", "Novartis / Sandoz", "Rack E-05", "89640001017", 1, "Bottle", 20, 0},
        {"Polyfax Eye Ointment", "Polymyxin B + Bacitracin", "Ophthalmic Antibiotic", "GSK Pakistan", "Rack G-02", "89640001018", 1, "Tube", 15, 0}
    };

    for (const auto& m : meds) {
        std::string sql = "INSERT INTO medicines (name, generic_name, category, manufacturer, rack_location, barcode, pack_size, unit_type, min_stock_alert, is_prescription_required) VALUES ('" +
                          std::string(m.name) + "', '" + std::string(m.generic) + "', '" + std::string(m.cat) + "', '" +
                          std::string(m.mfr) + "', '" + std::string(m.rack) + "', '" + std::string(m.barcode) + "', " +
                          std::to_string(m.packSize) + ", '" + std::string(m.unitType) + "', " + std::to_string(m.minStock) + ", " +
                          std::to_string(m.isRx) + ");";
        execute(sql);
    }

    // Seed Batches (stored in Base Atomic Units: tablets/loose)
    // Panadol (Med ID 1, Pack of 200): Batch 1 has 400 tablets (2 boxes), Batch 2 near expiry has 150 tablets
    execute("INSERT INTO batches (medicine_id, batch_number, expiry_date, purchase_rate, sale_rate, quantity) VALUES (1, 'BN-2024-P01', '2027-08-30', 420.0, 480.0, 400);");
    execute("INSERT INTO batches (medicine_id, batch_number, expiry_date, purchase_rate, sale_rate, quantity) VALUES (1, 'BN-2023-P99', '2026-12-15', 380.0, 450.0, 150);"); // Near Expiry < 30 days!
    
    // Panadol Extra (Med ID 2, Pack of 100)
    execute("INSERT INTO batches (medicine_id, batch_number, expiry_date, purchase_rate, sale_rate, quantity) VALUES (2, 'PX-8812', '2027-10-31', 310.0, 360.0, 250);");

    // Augmentin 625mg (Med ID 3, Pack of 14): FEFO testing
    execute("INSERT INTO batches (medicine_id, batch_number, expiry_date, purchase_rate, sale_rate, quantity) VALUES (3, 'AUG-62-01', '2026-12-05', 310.0, 370.0, 14);"); // Critical near expiry < 30 days
    execute("INSERT INTO batches (medicine_id, batch_number, expiry_date, purchase_rate, sale_rate, quantity) VALUES (3, 'AUG-62-02', '2027-06-30', 315.0, 370.0, 42);"); // Healthy (3 packs)

    // Augmentin 1g (Med ID 4, Pack of 14)
    execute("INSERT INTO batches (medicine_id, batch_number, expiry_date, purchase_rate, sale_rate, quantity) VALUES (4, 'AUG-1G-91', '2027-09-15', 420.0, 495.0, 28);");

    // Brufen 400mg (Med ID 5, Pack of 200)
    execute("INSERT INTO batches (medicine_id, batch_number, expiry_date, purchase_rate, sale_rate, quantity) VALUES (5, 'BRU-400-A', '2027-12-31', 480.0, 560.0, 400);");

    // Brufen Suspension (Med ID 6, Bottle = 1)
    execute("INSERT INTO batches (medicine_id, batch_number, expiry_date, purchase_rate, sale_rate, quantity) VALUES (6, 'BRU-SUS-11', '2027-04-30', 105.0, 125.0, 35);");

    // Glucophage 500mg (Med ID 7, Pack of 50)
    execute("INSERT INTO batches (medicine_id, batch_number, expiry_date, purchase_rate, sale_rate, quantity) VALUES (7, 'GLU-500-X', '2027-11-20', 210.0, 250.0, 150);");

    // Glucophage 850mg (Med ID 8, Pack of 50)
    execute("INSERT INTO batches (medicine_id, batch_number, expiry_date, purchase_rate, sale_rate, quantity) VALUES (8, 'GLU-850-Y', '2027-08-14', 315.0, 375.0, 100);");

    // Lipitor 20mg (Med ID 9, Pack of 30)
    execute("INSERT INTO batches (medicine_id, batch_number, expiry_date, purchase_rate, sale_rate, quantity) VALUES (9, 'LIP-20-801', '2027-07-25', 680.0, 790.0, 60);");

    // Risek 20mg (Med ID 10, Pack of 14)
    execute("INSERT INTO batches (medicine_id, batch_number, expiry_date, purchase_rate, sale_rate, quantity) VALUES (10, 'RSK-20-44', '2027-05-18', 270.0, 320.0, 70);");

    // Risek 40mg (Med ID 11, Pack of 14) - One batch with EXPIRED status to test safety lock!
    execute("INSERT INTO batches (medicine_id, batch_number, expiry_date, purchase_rate, sale_rate, quantity) VALUES (11, 'RSK-40-OLD', '2026-10-01', 410.0, 480.0, 14);"); // EXPIRED!
    execute("INSERT INTO batches (medicine_id, batch_number, expiry_date, purchase_rate, sale_rate, quantity) VALUES (11, 'RSK-40-NEW', '2028-01-30', 430.0, 510.0, 42);");

    // Softin 10mg (Med ID 12, Pack of 10)
    execute("INSERT INTO batches (medicine_id, batch_number, expiry_date, purchase_rate, sale_rate, quantity) VALUES (12, 'SFT-10-12', '2027-03-31', 110.0, 130.0, 50);");

    // Flagyl 400mg (Med ID 13, Pack of 200)
    execute("INSERT INTO batches (medicine_id, batch_number, expiry_date, purchase_rate, sale_rate, quantity) VALUES (13, 'FLG-400-9', '2027-09-01', 340.0, 400.0, 400);");

    // Arinac Forte (Med ID 14, Pack of 100)
    execute("INSERT INTO batches (medicine_id, batch_number, expiry_date, purchase_rate, sale_rate, quantity) VALUES (14, 'ARN-FT-08', '2027-02-28', 280.0, 330.0, 200);");

    // Disprin (Med ID 15, Pack of 300)
    execute("INSERT INTO batches (medicine_id, batch_number, expiry_date, purchase_rate, sale_rate, quantity) VALUES (15, 'DSP-30-7', '2027-12-15', 390.0, 450.0, 600);");

    // Cac-1000 Plus (Med ID 16)
    execute("INSERT INTO batches (medicine_id, batch_number, expiry_date, purchase_rate, sale_rate, quantity) VALUES (16, 'CAC-PLS-5', '2027-04-10', 215.0, 250.0, 30);");

    // Sancos Syrup (Med ID 17) - Near Expiry Warning (< 60 days)
    execute("INSERT INTO batches (medicine_id, batch_number, expiry_date, purchase_rate, sale_rate, quantity) VALUES (17, 'SNC-SYR-03', '2026-12-28', 95.0, 115.0, 18);");

    // Polyfax (Med ID 18)
    execute("INSERT INTO batches (medicine_id, batch_number, expiry_date, purchase_rate, sale_rate, quantity) VALUES (18, 'PFX-EYE-1', '2027-06-20', 65.0, 80.0, 40);");

    // Seed Customers (Khata Accounts)
    execute("INSERT INTO customers (name, phone, address, credit_limit, current_balance, notes) VALUES ('Muhammad Ali Khan (Acc #C-101)', '+92 321 4455667', 'House 42-B, Model Town, Lahore', 15000.0, 3450.0, 'Regular chronic patient (Diabetic & BP meds)');");
    execute("INSERT INTO customers (name, phone, address, credit_limit, current_balance, notes) VALUES ('Dr. Tariq Mahmood (Acc #C-102)', '+92 333 9988776', 'Tariq Clinic, Jail Road, Lahore', 50000.0, 12800.0, 'Local physician clinic purchases');");
    execute("INSERT INTO customers (name, phone, address, credit_limit, current_balance, notes) VALUES ('Haji Abdul Rehman (Acc #C-103)', '+92 300 5544332', 'Shop 15, Commercial Market', 10000.0, 1500.0, 'Clears balance every 1st of month');");
    execute("INSERT INTO customers (name, phone, address, credit_limit, current_balance, notes) VALUES ('Ayesha Bibi (Acc #C-104)', '+92 345 1122334', 'Street 7, Cavalry Ground', 8000.0, 0.0, 'Prompt payer');");

    // Seed Customer Ledgers
    std::string dt = Utils::getCurrentDateTime();
    execute("INSERT INTO customer_ledger (customer_id, date, transaction_type, reference_id, debit, credit, balance, notes) VALUES (1, '" + dt + "', 'OPENING', NULL, 3450.0, 0.0, 3450.0, 'Opening Balance Carry Forward');");
    execute("INSERT INTO customer_ledger (customer_id, date, transaction_type, reference_id, debit, credit, balance, notes) VALUES (2, '" + dt + "', 'OPENING', NULL, 12800.0, 0.0, 12800.0, 'Clinic Monthly Medicine Purchase Balance');");
    execute("INSERT INTO customer_ledger (customer_id, date, transaction_type, reference_id, debit, credit, balance, notes) VALUES (3, '" + dt + "', 'OPENING', NULL, 1500.0, 0.0, 1500.0, 'Opening Balance Carry Forward');");

    // Seed Suppliers (Vendor Khata)
    execute("INSERT INTO suppliers (name, contact_person, phone, email, address, current_balance, notes) VALUES ('GSK Authorized Distributor', 'Salman Farooq (Sales Exec)', '+92 322 8877665', 'salman.gsk@distrib.pk', 'Industrial Area, Kot Lakhpat, Lahore', 48500.0, 'Credit terms: 21 days');");
    execute("INSERT INTO suppliers (name, contact_person, phone, email, address, current_balance, notes) VALUES ('Abbott Healthcare Distribution', 'Kamran Butt', '+92 301 2345678', 'orders@abbott-dist.pk', 'Gulberg Industrial Estate, Lahore', 24200.0, 'Credit terms: 30 days');");
    execute("INSERT INTO suppliers (name, contact_person, phone, email, address, current_balance, notes) VALUES ('Getz Pharma Logistics', 'Imran Rafiq', '+92 334 7766554', 'imran@getz-logistics.com', 'Multan Road Distribution Center', 15800.0, 'Prompt discount 2% on 7-day payment');");

    // Seed Supplier Ledgers
    execute("INSERT INTO supplier_ledger (supplier_id, date, transaction_type, reference_id, debit, credit, balance, notes) VALUES (1, '" + dt + "', 'OPENING', NULL, 0.0, 48500.0, 48500.0, 'Opening Balance for Month');");
    execute("INSERT INTO supplier_ledger (supplier_id, date, transaction_type, reference_id, debit, credit, balance, notes) VALUES (2, '" + dt + "', 'OPENING', NULL, 0.0, 24200.0, 24200.0, 'Opening Balance for Month');");
    execute("INSERT INTO supplier_ledger (supplier_id, date, transaction_type, reference_id, debit, credit, balance, notes) VALUES (3, '" + dt + "', 'OPENING', NULL, 0.0, 15800.0, 15800.0, 'Opening Balance for Month');");

    // Cash drawer floats are opened explicitly through /api/cash-drawer/open,
    // so seeded daybook cash is intentionally omitted.

    // Convert seeded per-pack sale rates into the canonical per-unit basis
    normalizePriceBasis(*this);

    std::cout << "[Seed] Pharmacy database seeded successfully with 18 medicines, 21 batches, customers, suppliers, and ledgers." << std::endl;
}
