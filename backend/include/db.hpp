#pragma once

#include <string>
#include <vector>
#include <memory>
#include <mutex>
#include <sqlite3.h>
#include "json.hpp"

using json = nlohmann::json;

class Database {
public:
    static Database& getInstance();
    
    bool initialize(const std::string& dbPath = "pharmacy.db");
    void close();

    // Query execution
    bool execute(const std::string& sql);
    json query(const std::string& sql);
    int64_t lastInsertRowId();
    int changes();

    // Safe transaction wrappers
    bool beginTransaction();
    bool commit();
    bool rollback();

    // High-level Domain Operations
    // Medicines
    json getMedicines(const std::string& search = "", const std::string& category = "", const std::string& status = "");
    json getMedicineById(int id);
    json validateMedicine(const json& med, int excludeId = 0);
    int64_t createMedicine(const json& med);
    bool updateMedicine(int id, const json& med);
    bool deleteMedicine(int id);
    json canDeleteMedicine(int id);
    json adjustStock(int medicineId, int batchId, int delta, const std::string& reason);

    // Batches
    json getBatches(int medicineId = -1);
    json getBatchById(int id);
    int64_t createBatch(const json& batch);
    bool updateBatch(int id, const json& batch);
    bool deleteBatch(int id);
    json getExpiryWatchlist(int daysThreshold = 90);

    // POS & Invoicing
    json createInvoice(const json& invoiceData);
    json getInvoices(int limit = 50, int offset = 0, const std::string& date = "");
    json getInvoiceById(int id);
    json returnInvoice(int invoiceId, const std::string& reason, const std::string& refundMode = "CASH");

    // Parked / Suspended Bills
    json parkInvoice(const json& cartData);
    json getParkedInvoices();
    bool deleteParkedInvoice(int id);

    // Customers & Customer Khata (Ledger)
    json getCustomers(const std::string& search = "");
    json getCustomerById(int id);
    int64_t createCustomer(const json& cust);
    bool updateCustomer(int id, const json& cust);
    json getCustomerLedger(int customerId);
    json recordCustomerPayment(int customerId, double amount, const std::string& paymentMode, const std::string& notes);

    // Suppliers & Supplier Khata (Ledger)
    json getSuppliers(const std::string& search = "");
    json getSupplierById(int id);
    int64_t createSupplier(const json& supp);
    bool updateSupplier(int id, const json& supp);
    json getSupplierLedger(int supplierId);
    json recordSupplierPayment(int supplierId, double amount, const std::string& paymentMode, const std::string& notes);

    // Purchases (GRN)
    json createPurchase(const json& purchaseData);
    json getPurchases(int limit = 50);

    // Daybook & Cash Drawer
    json getDaybook(const std::string& date = "");
    json addDaybookEntry(const std::string& entryType, double amount, const std::string& direction, const std::string& notes);

    json openCashDrawer(double openingFloat, const std::string& notes);
    json closeCashDrawer(double countedAmount, const std::string& notes);
    json getCashDrawerStatus();
    json getCashDrawerHistory(int limit = 20);
    json addCashDrawerMovement(const std::string& entryType, double amount, const std::string& direction, const std::string& notes);

    // Reports & Dashboard KPIs
    json getDashboardStats();

    // Settings
    json getSettings();
    bool updateSetting(const std::string& key, const std::string& value);

    // Seed Data
    void seedInitialDataIfNeeded();

private:
    Database() = default;
    ~Database();
    Database(const Database&) = delete;
    Database& operator=(const Database&) = delete;

    sqlite3* db = nullptr;
    std::mutex dbMutex;
    bool createTables();
    json getInvoiceByIdInternal(int id); // called with dbMutex already held
    int currentSessionId();              // called with dbMutex already held
    json getCashDrawerStatusInternal();  // called with dbMutex already held
};
