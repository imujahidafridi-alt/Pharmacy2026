import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../services/api';

export interface PharmacySettings {
  pharmacy_name: string;
  currency_symbol: string;
  phone: string;
  address: string;
  license_number: string;
  tax_number: string;
  [key: string]: any;
}

export interface AppContextType {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  settings: PharmacySettings;
  setSettings: React.Dispatch<React.SetStateAction<PharmacySettings>>;
  refreshSettings: () => Promise<void>;
  serverOnline: boolean;
  stats: any;
  refreshStats: () => Promise<void>;
  formatCurrency: (val: number | string) => string;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('pharmacy_theme');
    return saved === 'dark' ? 'dark' : 'light';
  });

  const [settings, setSettings] = useState<PharmacySettings>({
    pharmacy_name: 'Al-Shifa Community Pharmacy',
    currency_symbol: 'Rs.',
    phone: '+92 300 1234567',
    address: 'Main Boulevard, Gulberg III, Lahore',
    license_number: 'DL-PB-2026-8891',
    tax_number: 'NTN-7419283-1',
  });
  const [serverOnline, setServerOnline] = useState<boolean>(false);
  const [stats, setStats] = useState<any>(null);

  // Apply Bootstrap 5.3 Color Mode
  useEffect(() => {
    document.documentElement.setAttribute('data-bs-theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('pharmacy_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  // Fetch Settings & Check Connection
  const refreshSettings = async () => {
    try {
      const s = await api.getSettings();
      if (s) setSettings((prev) => ({ ...prev, ...s }));
      setServerOnline(true);
    } catch {
      setServerOnline(false);
    }
  };

  const refreshStats = async () => {
    try {
      const st = await api.getDashboardStats();
      if (st) setStats(st);
      setServerOnline(true);
    } catch {
      setServerOnline(false);
    }
  };

  useEffect(() => {
    refreshSettings();
    refreshStats();
    const interval = setInterval(refreshStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatCurrency = (val: number | string) => {
    const num = Number(val) || 0;
    const sym = (!settings?.currency_symbol || settings.currency_symbol === '₨') ? 'Rs.' : settings.currency_symbol;
    return `${sym} ${num.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  return (
    <AppContext.Provider
      value={{
        theme,
        toggleTheme,
        settings,
        setSettings,
        refreshSettings,
        serverOnline,
        stats,
        refreshStats,
        formatCurrency,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextType {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
