#pragma once

#include <string>
#include <chrono>
#include <ctime>
#include <iomanip>
#include <sstream>
#include <random>

namespace Utils {

inline std::string getCurrentDateTime() {
    auto now = std::chrono::system_clock::now();
    std::time_t in_time_t = std::chrono::system_clock::to_time_t(now);
    std::tm buf{};
#if defined(_WIN32)
    localtime_s(&buf, &in_time_t);
#else
    localtime_r(&in_time_t, &buf);
#endif
    std::ostringstream ss;
    ss << std::put_time(&buf, "%Y-%m-%d %H:%M:%S");
    return ss.str();
}

inline std::string getCurrentDate() {
    auto now = std::chrono::system_clock::now();
    std::time_t in_time_t = std::chrono::system_clock::to_time_t(now);
    std::tm buf{};
#if defined(_WIN32)
    localtime_s(&buf, &in_time_t);
#else
    localtime_r(&in_time_t, &buf);
#endif
    std::ostringstream ss;
    ss << std::put_time(&buf, "%Y-%m-%d");
    return ss.str();
}

inline std::string generateInvoiceNumber() {
    auto now = std::chrono::system_clock::now();
    std::time_t in_time_t = std::chrono::system_clock::to_time_t(now);
    std::tm buf{};
#if defined(_WIN32)
    localtime_s(&buf, &in_time_t);
#else
    localtime_r(&in_time_t, &buf);
#endif
    
    static std::random_device rd;
    static std::mt19937 gen(rd());
    std::uniform_int_distribution<> dis(1000, 9999);

    std::ostringstream ss;
    ss << "INV-" << std::put_time(&buf, "%Y%m%d-") << dis(gen);
    return ss.str();
}

inline std::string generatePurchaseNumber() {
    auto now = std::chrono::system_clock::now();
    std::time_t in_time_t = std::chrono::system_clock::to_time_t(now);
    std::tm buf{};
#if defined(_WIN32)
    localtime_s(&buf, &in_time_t);
#else
    localtime_r(&in_time_t, &buf);
#endif

    static std::random_device rd;
    static std::mt19937 gen(rd());
    std::uniform_int_distribution<> dis(100, 999);

    std::ostringstream ss;
    ss << "PO-" << std::put_time(&buf, "%Y%m%d-") << dis(gen);
    return ss.str();
}

inline int daysUntilExpiry(const std::string& expiryDateStr) {
    if (expiryDateStr.empty()) return 9999;
    std::tm expTm = {};
    std::istringstream ss(expiryDateStr);
    ss >> std::get_time(&expTm, "%Y-%m-%d");
    if (ss.fail()) return 9999;

    std::time_t expTime = std::mktime(&expTm);
    auto now = std::chrono::system_clock::now();
    std::time_t nowTime = std::chrono::system_clock::to_time_t(now);

    double diffSeconds = std::difftime(expTime, nowTime);
    return static_cast<int>(diffSeconds / (60 * 60 * 24));
}

} // namespace Utils
