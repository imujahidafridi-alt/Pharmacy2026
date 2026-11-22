#define CPPHTTPLIB_OPENSSL_SUPPORT 0
#include "../include/httplib.h"
#include "../include/json.hpp"
#include "../include/db.hpp"
#include "../include/utils.hpp"

#include <iostream>
#include <string>
#include <thread>
#include <chrono>
#include <filesystem>

#if defined(_WIN32)
#include <windows.h>
#include <shellapi.h>
#endif

using json = nlohmann::json;
namespace fs = std::filesystem;

void addCorsHeaders(httplib::Response& res) {
    res.set_header("Access-Control-Allow-Origin", "*");
    res.set_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.set_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
}

int main(int argc, char* argv[]) {
    bool launchWindow = true;
    for (int i = 1; i < argc; i++) {
        std::string arg = argv[i];
        if (arg == "--server-only" || arg == "--no-window" || arg == "-s") {
            launchWindow = false;
        }
    }

    std::cout << "=======================================================" << std::endl;
    std::cout << "  PHARMACY POS & KHATA ERP SYSTEM (C++ Backend v1.0)  " << std::endl;
    std::cout << "=======================================================" << std::endl;

    // 1. Initialize SQLite Database
    Database& db = Database::getInstance();
    if (!db.initialize("pharmacy.db")) {
        std::cerr << "[Error] Failed to initialize SQLite database!" << std::endl;
        return 1;
    }
    std::cout << "[DB] Connected to SQLite database (WAL mode enabled)." << std::endl;

    // Seed realistic data if DB is empty
    db.seedInitialDataIfNeeded();

    // 2. Setup HTTP Server
    httplib::Server svr;

    // Global OPTIONS handler for CORS preflight
    svr.Options(".*", [](const httplib::Request&, httplib::Response& res) {
        addCorsHeaders(res);
        res.status = 200;
    });

    // Logging & CORS middleware
    svr.set_post_routing_handler([](const httplib::Request& req, httplib::Response& res) {
        addCorsHeaders(res);
    });

    // ---------------- REST API ROUTES ----------------

    // Status / Health Check
    svr.Get("/api/status", [](const httplib::Request&, httplib::Response& res) {
        json reply = {
            {"status", "online"},
            {"engine", "C++20 / SQLite3"},
            {"server_time", Utils::getCurrentDateTime()},
            {"version", "1.0.0"}
        };
        res.set_content(reply.dump(), "application/json");
    });

    // --- Medicines ---
    svr.Get("/api/medicines", [&db](const httplib::Request& req, httplib::Response& res) {
        std::string search = req.has_param("q") ? req.get_param_value("q") : "";
        std::string category = req.has_param("category") ? req.get_param_value("category") : "";
        std::string status = req.has_param("status") ? req.get_param_value("status") : "";
        json meds = db.getMedicines(search, category, status);
        res.set_content(meds.dump(), "application/json");
    });

    svr.Get(R"(/api/medicines/(\d+))", [&db](const httplib::Request& req, httplib::Response& res) {
        int id = std::stoi(req.matches[1]);
        json med = db.getMedicineById(id);
        if (med.is_null()) {
            res.status = 404;
            res.set_content("{\"error\":\"Medicine not found\"}", "application/json");
            return;
        }
        res.set_content(med.dump(), "application/json");
    });

    svr.Post("/api/medicines", [&db](const httplib::Request& req, httplib::Response& res) {
        try {
            json body = json::parse(req.body);
            int64_t id = db.createMedicine(body);
            if (id > 0) {
                res.status = 201;
                res.set_content(json({{"success", true}, {"id", id}}).dump(), "application/json");
            } else {
                res.status = 400;
                res.set_content("{\"error\":\"Failed to create medicine\"}", "application/json");
            }
        } catch (const std::exception& e) {
            res.status = 400;
            res.set_content(json({{"error", e.what()}}).dump(), "application/json");
        }
    });

    svr.Put(R"(/api/medicines/(\d+))", [&db](const httplib::Request& req, httplib::Response& res) {
        try {
            int id = std::stoi(req.matches[1]);
            json body = json::parse(req.body);
            if (db.updateMedicine(id, body)) {
                res.set_content("{\"success\":true}", "application/json");
            } else {
                res.status = 400;
                res.set_content("{\"error\":\"Failed to update medicine\"}", "application/json");
            }
        } catch (const std::exception& e) {
            res.status = 400;
            res.set_content(json({{"error", e.what()}}).dump(), "application/json");
        }
    });

    svr.Post(R"(/api/medicines/(\d+)/toggle-status)", [&db](const httplib::Request& req, httplib::Response& res) {
        try {
            int id = std::stoi(req.matches[1]);
            json cur = db.getMedicineById(id);
            if (cur.is_null()) {
                res.status = 404;
                res.set_content("{\"error\":\"Medicine not found\"}", "application/json");
                return;
            }
            int curStatus = cur.value("is_active", 1);
            int newStatus = (curStatus == 1) ? 0 : 1;
            db.execute("UPDATE medicines SET is_active = " + std::to_string(newStatus) + " WHERE id = " + std::to_string(id) + ";");
            res.set_content(json({{"success", true}, {"is_active", newStatus}}).dump(), "application/json");
        } catch (const std::exception& e) {
            res.status = 400;
            res.set_content(json({{"error", e.what()}}).dump(), "application/json");
        }
    });

    svr.Delete(R"(/api/medicines/(\d+))", [&db](const httplib::Request& req, httplib::Response& res) {
        int id = std::stoi(req.matches[1]);
        if (db.deleteMedicine(id)) {
            res.set_content("{\"success\":true}", "application/json");
        } else {
            res.status = 400;
            res.set_content("{\"error\":\"Failed to delete medicine\"}", "application/json");
        }
    });

    // --- Batches & Expiry ---
    svr.Get("/api/batches", [&db](const httplib::Request& req, httplib::Response& res) {
        int medId = req.has_param("medicine_id") ? std::stoi(req.get_param_value("medicine_id")) : -1;
        json batches = db.getBatches(medId);
        res.set_content(batches.dump(), "application/json");
    });

    svr.Get("/api/batches/expiry", [&db](const httplib::Request& req, httplib::Response& res) {
        int days = req.has_param("days") ? std::stoi(req.get_param_value("days")) : 90;
        json watchlist = db.getExpiryWatchlist(days);
        res.set_content(watchlist.dump(), "application/json");
    });

    svr.Post("/api/batches", [&db](const httplib::Request& req, httplib::Response& res) {
        try {
            json body = json::parse(req.body);
            int64_t id = db.createBatch(body);
            if (id > 0) {
                res.status = 201;
                res.set_content(json({{"success", true}, {"id", id}}).dump(), "application/json");
            } else {
                res.status = 400;
                res.set_content("{\"error\":\"Failed to create batch\"}", "application/json");
            }
        } catch (const std::exception& e) {
            res.status = 400;
            res.set_content(json({{"error", e.what()}}).dump(), "application/json");
        }
    });

    svr.Put(R"(/api/batches/(\d+))", [&db](const httplib::Request& req, httplib::Response& res) {
        try {
            int id = std::stoi(req.matches[1]);
            json body = json::parse(req.body);
            if (db.updateBatch(id, body)) {
                res.set_content("{\"success\":true}", "application/json");
            } else {
                res.status = 400;
                res.set_content("{\"error\":\"Failed to update batch\"}", "application/json");
            }
        } catch (const std::exception& e) {
            res.status = 400;
            res.set_content(json({{"error", e.what()}}).dump(), "application/json");
        }
    });

    svr.Delete(R"(/api/batches/(\d+))", [&db](const httplib::Request& req, httplib::Response& res) {
        int id = std::stoi(req.matches[1]);
        if (db.deleteBatch(id)) {
            res.set_content("{\"success\":true}", "application/json");
        } else {
            res.status = 400;
            res.set_content("{\"error\":\"Failed to delete batch\"}", "application/json");
        }
    });

    // --- POS & Invoicing ---
    svr.Post("/api/pos/checkout", [&db](const httplib::Request& req, httplib::Response& res) {
        try {
            json body = json::parse(req.body);
            json result = db.createInvoice(body);
            if (result.contains("error")) {
                res.status = 400;
                res.set_content(result.dump(), "application/json");
            } else {
                res.status = 201;
                res.set_content(result.dump(), "application/json");
            }
        } catch (const std::exception& e) {
            res.status = 400;
            res.set_content(json({{"error", e.what()}}).dump(), "application/json");
        }
    });

    svr.Get("/api/invoices", [&db](const httplib::Request& req, httplib::Response& res) {
        int limit = req.has_param("limit") ? std::stoi(req.get_param_value("limit")) : 50;
        int offset = req.has_param("offset") ? std::stoi(req.get_param_value("offset")) : 0;
        std::string date = req.has_param("date") ? req.get_param_value("date") : "";
        json invs = db.getInvoices(limit, offset, date);
        res.set_content(invs.dump(), "application/json");
    });

    svr.Get(R"(/api/invoices/(\d+))", [&db](const httplib::Request& req, httplib::Response& res) {
        int id = std::stoi(req.matches[1]);
        json inv = db.getInvoiceById(id);
        if (inv.is_null()) {
            res.status = 404;
            res.set_content("{\"error\":\"Invoice not found\"}", "application/json");
            return;
        }
        res.set_content(inv.dump(), "application/json");
    });

    svr.Post("/api/pos/return", [&db](const httplib::Request& req, httplib::Response& res) {
        try {
            json body = json::parse(req.body);
            int invId = body.value("invoice_id", 0);
            std::string reason = body.value("reason", "Customer Return");
            json result = db.returnInvoice(invId, reason);
            if (result.contains("error")) {
                res.status = 400;
                res.set_content(result.dump(), "application/json");
            } else {
                res.set_content(result.dump(), "application/json");
            }
        } catch (const std::exception& e) {
            res.status = 400;
            res.set_content(json({{"error", e.what()}}).dump(), "application/json");
        }
    });

    // Parked Bills
    svr.Post("/api/pos/park", [&db](const httplib::Request& req, httplib::Response& res) {
        try {
            json body = json::parse(req.body);
            json result = db.parkInvoice(body);
            res.set_content(result.dump(), "application/json");
        } catch (const std::exception& e) {
            res.status = 400;
            res.set_content(json({{"error", e.what()}}).dump(), "application/json");
        }
    });

    svr.Get("/api/pos/parked", [&db](const httplib::Request&, httplib::Response& res) {
        json parked = db.getParkedInvoices();
        res.set_content(parked.dump(), "application/json");
    });

    svr.Delete(R"(/api/pos/parked/(\d+))", [&db](const httplib::Request& req, httplib::Response& res) {
        int id = std::stoi(req.matches[1]);
        if (db.deleteParkedInvoice(id)) {
            res.set_content("{\"success\":true}", "application/json");
        } else {
            res.status = 400;
            res.set_content("{\"error\":\"Failed to delete parked invoice\"}", "application/json");
        }
    });

    // --- Customers & Khata ---
    svr.Get("/api/customers", [&db](const httplib::Request& req, httplib::Response& res) {
        std::string search = req.has_param("q") ? req.get_param_value("q") : "";
        json custs = db.getCustomers(search);
        res.set_content(custs.dump(), "application/json");
    });

    svr.Get(R"(/api/customers/(\d+))", [&db](const httplib::Request& req, httplib::Response& res) {
        int id = std::stoi(req.matches[1]);
        json cust = db.getCustomerById(id);
        if (cust.is_null()) {
            res.status = 404;
            res.set_content("{\"error\":\"Customer not found\"}", "application/json");
            return;
        }
        res.set_content(cust.dump(), "application/json");
    });

    svr.Post("/api/customers", [&db](const httplib::Request& req, httplib::Response& res) {
        try {
            json body = json::parse(req.body);
            int64_t id = db.createCustomer(body);
            if (id > 0) {
                res.status = 201;
                res.set_content(json({{"success", true}, {"id", id}}).dump(), "application/json");
            } else {
                res.status = 400;
                res.set_content("{\"error\":\"Failed to create customer\"}", "application/json");
            }
        } catch (const std::exception& e) {
            res.status = 400;
            res.set_content(json({{"error", e.what()}}).dump(), "application/json");
        }
    });

    svr.Put(R"(/api/customers/(\d+))", [&db](const httplib::Request& req, httplib::Response& res) {
        try {
            int id = std::stoi(req.matches[1]);
            json body = json::parse(req.body);
            if (db.updateCustomer(id, body)) {
                res.set_content("{\"success\":true}", "application/json");
            } else {
                res.status = 400;
                res.set_content("{\"error\":\"Failed to update customer\"}", "application/json");
            }
        } catch (const std::exception& e) {
            res.status = 400;
            res.set_content(json({{"error", e.what()}}).dump(), "application/json");
        }
    });

    svr.Get(R"(/api/customers/(\d+)/ledger)", [&db](const httplib::Request& req, httplib::Response& res) {
        int id = std::stoi(req.matches[1]);
        json ledger = db.getCustomerLedger(id);
        res.set_content(ledger.dump(), "application/json");
    });

    svr.Post(R"(/api/customers/(\d+)/payment)", [&db](const httplib::Request& req, httplib::Response& res) {
        try {
            int id = std::stoi(req.matches[1]);
            json body = json::parse(req.body);
            double amount = body.value("amount", 0.0);
            std::string mode = body.value("payment_mode", "CASH");
            std::string notes = body.value("notes", "");
            json result = db.recordCustomerPayment(id, amount, mode, notes);
            if (result.contains("error")) {
                res.status = 400;
                res.set_content(result.dump(), "application/json");
            } else {
                res.set_content(result.dump(), "application/json");
            }
        } catch (const std::exception& e) {
            res.status = 400;
            res.set_content(json({{"error", e.what()}}).dump(), "application/json");
        }
    });

    // --- Suppliers & Khata ---
    svr.Get("/api/suppliers", [&db](const httplib::Request& req, httplib::Response& res) {
        std::string search = req.has_param("q") ? req.get_param_value("q") : "";
        json supps = db.getSuppliers(search);
        res.set_content(supps.dump(), "application/json");
    });

    svr.Get(R"(/api/suppliers/(\d+))", [&db](const httplib::Request& req, httplib::Response& res) {
        int id = std::stoi(req.matches[1]);
        json supp = db.getSupplierById(id);
        if (supp.is_null()) {
            res.status = 404;
            res.set_content("{\"error\":\"Supplier not found\"}", "application/json");
            return;
        }
        res.set_content(supp.dump(), "application/json");
    });

    svr.Post("/api/suppliers", [&db](const httplib::Request& req, httplib::Response& res) {
        try {
            json body = json::parse(req.body);
            int64_t id = db.createSupplier(body);
            if (id > 0) {
                res.status = 201;
                res.set_content(json({{"success", true}, {"id", id}}).dump(), "application/json");
            } else {
                res.status = 400;
                res.set_content("{\"error\":\"Failed to create supplier\"}", "application/json");
            }
        } catch (const std::exception& e) {
            res.status = 400;
            res.set_content(json({{"error", e.what()}}).dump(), "application/json");
        }
    });

    svr.Put(R"(/api/suppliers/(\d+))", [&db](const httplib::Request& req, httplib::Response& res) {
        try {
            int id = std::stoi(req.matches[1]);
            json body = json::parse(req.body);
            if (db.updateSupplier(id, body)) {
                res.set_content("{\"success\":true}", "application/json");
            } else {
                res.status = 400;
                res.set_content("{\"error\":\"Failed to update supplier\"}", "application/json");
            }
        } catch (const std::exception& e) {
            res.status = 400;
            res.set_content(json({{"error", e.what()}}).dump(), "application/json");
        }
    });

    svr.Get(R"(/api/suppliers/(\d+)/ledger)", [&db](const httplib::Request& req, httplib::Response& res) {
        int id = std::stoi(req.matches[1]);
        json ledger = db.getSupplierLedger(id);
        res.set_content(ledger.dump(), "application/json");
    });

    svr.Post(R"(/api/suppliers/(\d+)/payment)", [&db](const httplib::Request& req, httplib::Response& res) {
        try {
            int id = std::stoi(req.matches[1]);
            json body = json::parse(req.body);
            double amount = body.value("amount", 0.0);
            std::string mode = body.value("payment_mode", "CASH");
            std::string notes = body.value("notes", "");
            json result = db.recordSupplierPayment(id, amount, mode, notes);
            if (result.contains("error")) {
                res.status = 400;
                res.set_content(result.dump(), "application/json");
            } else {
                res.set_content(result.dump(), "application/json");
            }
        } catch (const std::exception& e) {
            res.status = 400;
            res.set_content(json({{"error", e.what()}}).dump(), "application/json");
        }
    });

    // --- Purchases (GRN) ---
    svr.Post("/api/purchases", [&db](const httplib::Request& req, httplib::Response& res) {
        try {
            json body = json::parse(req.body);
            json result = db.createPurchase(body);
            if (result.contains("error")) {
                res.status = 400;
                res.set_content(result.dump(), "application/json");
            } else {
                res.status = 201;
                res.set_content(result.dump(), "application/json");
            }
        } catch (const std::exception& e) {
            res.status = 400;
            res.set_content(json({{"error", e.what()}}).dump(), "application/json");
        }
    });

    svr.Get("/api/purchases", [&db](const httplib::Request& req, httplib::Response& res) {
        int limit = req.has_param("limit") ? std::stoi(req.get_param_value("limit")) : 50;
        json p = db.getPurchases(limit);
        res.set_content(p.dump(), "application/json");
    });

    // --- Daybook ---
    svr.Get("/api/daybook", [&db](const httplib::Request& req, httplib::Response& res) {
        std::string date = req.has_param("date") ? req.get_param_value("date") : "";
        json dbk = db.getDaybook(date);
        res.set_content(dbk.dump(), "application/json");
    });

    svr.Post("/api/daybook", [&db](const httplib::Request& req, httplib::Response& res) {
        try {
            json body = json::parse(req.body);
            std::string type = body.value("entry_type", "EXPENSE");
            double amount = body.value("amount", 0.0);
            std::string dir = body.value("direction", "OUT");
            std::string notes = body.value("notes", "");
            json result = db.addDaybookEntry(type, amount, dir, notes);
            res.set_content(result.dump(), "application/json");
        } catch (const std::exception& e) {
            res.status = 400;
            res.set_content(json({{"error", e.what()}}).dump(), "application/json");
        }
    });

    // --- Reports & Dashboard ---
    svr.Get("/api/reports/dashboard", [&db](const httplib::Request&, httplib::Response& res) {
        json stats = db.getDashboardStats();
        res.set_content(stats.dump(), "application/json");
    });

    // --- Settings ---
    svr.Get("/api/settings", [&db](const httplib::Request&, httplib::Response& res) {
        json settings = db.getSettings();
        res.set_content(settings.dump(), "application/json");
    });

    svr.Post("/api/settings", [&db](const httplib::Request& req, httplib::Response& res) {
        try {
            json body = json::parse(req.body);
            for (auto& [key, val] : body.items()) {
                db.updateSetting(key, val.is_string() ? val.get<std::string>() : val.dump());
            }
            res.set_content("{\"success\":true}", "application/json");
        } catch (const std::exception& e) {
            res.status = 400;
            res.set_content(json({{"error", e.what()}}).dump(), "application/json");
        }
    });

    // Serve Frontend Static files if available
    std::string distPath = "";
    if (fs::exists("dist") && fs::is_directory("dist")) {
        distPath = "dist";
    } else if (fs::exists("../frontend/dist") && fs::is_directory("../frontend/dist")) {
        distPath = "../frontend/dist";
    } else if (fs::exists("../../frontend/dist") && fs::is_directory("../../frontend/dist")) {
        distPath = "../../frontend/dist";
    }

    if (!distPath.empty()) {
        std::cout << "[Static] Serving React frontend from: " << distPath << std::endl;
        svr.set_mount_point("/", distPath.c_str());

        // Single-Page Application (SPA) fallback to index.html for non-API GET requests
        svr.set_error_handler([distPath](const httplib::Request& req, httplib::Response& res) {
            if (res.status == 404 && req.method == "GET" && req.path.find("/api/") != 0) {
                std::string indexPath = distPath + "/index.html";
                if (fs::exists(indexPath)) {
                    std::ifstream ifs(indexPath);
                    std::string content((std::istreambuf_iterator<char>(ifs)), (std::istreambuf_iterator<char>()));
                    res.status = 200;
                    res.set_content(content, "text/html");
                    addCorsHeaders(res);
                }
            }
        });
    }

    const std::string host = "127.0.0.1";
    int port = 8085;

    // Launch server in background thread so main thread can handle desktop window launch
    std::thread serverThread([&svr, host, port]() {
        std::cout << "[Server] Pharmacy REST API running at http://" << host << ":" << port << std::endl;
        if (!svr.listen(host.c_str(), port)) {
            std::cerr << "[Error] Server failed to bind to " << host << ":" << port << std::endl;
        }
    });

    // Wait a brief moment for the server socket to bind
    std::this_thread::sleep_for(std::chrono::milliseconds(600));

    // Launch Desktop Native Window if requested
    if (launchWindow) {
#if defined(_WIN32)
        std::cout << "[Desktop] Launching dedicated Pharmacy POS application window..." << std::endl;
        std::string appUrl = "http://localhost:" + std::to_string(port);
        std::string edgeCmd = "--app=" + appUrl + " --window-size=1360,860";

        HINSTANCE hInst = ShellExecuteA(
            NULL,
            "open",
            "msedge.exe",
            edgeCmd.c_str(),
            NULL,
            SW_SHOWNORMAL
        );

        if ((intptr_t)hInst <= 32) {
            // Fallback to default browser if edge custom app mode fails
            std::cout << "[Desktop] Opening in default web browser..." << std::endl;
            ShellExecuteA(NULL, "open", appUrl.c_str(), NULL, NULL, SW_SHOWNORMAL);
        }
#endif
    }

    std::cout << "\n[Ready] Application is active. Press Ctrl+C in this console to shut down.\n" << std::endl;

    if (serverThread.joinable()) {
        serverThread.join();
    }

    return 0;
}
