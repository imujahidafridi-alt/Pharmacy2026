import React, { useState, useEffect } from 'react';
import { useApp } from './context/AppContext';
import { POSTerminal } from './components/pos/POSTerminal';
import { CustomerKhataView } from './components/khata/CustomerKhataView';
import { SupplierKhataView } from './components/khata/SupplierKhataView';
import { MedicineMaster } from './components/inventory/MedicineMaster';
import { ExpiryWatchlist } from './components/inventory/ExpiryWatchlist';
import { PurchaseEntry } from './components/purchases/PurchaseEntry';
import { DaybookReconciliation } from './components/reports/DaybookReconciliation';
import { DashboardOverview } from './components/reports/DashboardOverview';
import { SettingsView } from './components/reports/SettingsView';
import { ReturnBillModal } from './components/pos/ReturnBillModal';

export function App() {
  const { theme, toggleTheme, settings, serverOnline, stats } = useApp();
  const [activeTab, setActiveTab] = useState<string>('pos');
  const [currentTime, setCurrentTime] = useState<string>(() => new Date().toLocaleTimeString());
  const [isReturnModalOpen, setIsReturnModalOpen] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => !!document.fullscreenElement);

  // Set Desktop Window Title
  useEffect(() => {
    document.title = "Pak Pharmacy & Retail POS — Counter Terminal";
  }, []);

  // Desktop Native App Event Handlers (Disables web-page behaviors)
  useEffect(() => {
    // 1. Prevent web browser context menu (Inspect, Reload, Save as...)
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return; // Allow standard copy/paste menu inside text inputs
      }
      e.preventDefault();
    };

    // 2. Prevent accidental Ctrl+Scroll zoom distortion
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
      }
    };

    // 3. Intercept destructive browser keyboard shortcuts (F5 reload, F1 help, etc.)
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent browser page reload (F5, Ctrl+R)
      if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R'))) {
        e.preventDefault();
      }
      // Prevent browser help page (F1)
      if (e.key === 'F1') {
        e.preventDefault();
      }
      // Prevent browser address bar focus (F6)
      if (e.key === 'F6') {
        e.preventDefault();
      }
      // Prevent caret browsing prompt (F7)
      if (e.key === 'F7') {
        e.preventDefault();
      }
      // Prevent save webpage HTML (Ctrl+S)
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
      }
      // Prevent view source (Ctrl+U)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'u' || e.key === 'U')) {
        e.preventDefault();
      }
      // Prevent browser print preview (Ctrl+P)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
      }
      // Toggle fullscreen (F11)
      if (e.key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Live Real-Time Clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Top Nav Items matching Blueprint
  const navTabs = [
    { id: 'pos', label: 'Sale (POS)' },
    { id: 'items', label: 'Items' },
    { id: 'stock', label: 'Stock' },
    { id: 'purchases', label: 'Purchases' },
    { id: 'expiry', label: 'Expiry' },
    { id: 'customers', label: 'Customers' },
    { id: 'suppliers', label: 'Suppliers' },
    { id: 'returns', label: 'Returns' },
    { id: 'reports', label: 'Reports' },
    { id: 'settings', label: 'Settings' },
  ];

  const handleTabClick = (tabId: string) => {
    if (tabId === 'returns') {
      setIsReturnModalOpen(true);
    } else {
      setActiveTab(tabId);
    }
  };

  return (
    <div
      className="d-flex flex-column"
      style={{
        height: '100vh',
        maxHeight: '100vh',
        width: '100vw',
        overflow: 'hidden',
        backgroundColor: 'var(--app-bg)',
        color: 'var(--text-primary)',
        fontFamily: "'Inter', 'Roboto', sans-serif",
      }}
    >
      {/* Top Navigation Bar (#navBar) matching Qt reference */}
      <header
        id="navBar"
        className="d-flex align-items-center justify-content-between px-2 flex-shrink-0"
        style={{
          height: '36px',
          minHeight: '36px',
          maxHeight: '36px',
          backgroundColor: 'var(--surface-bg)',
          borderBottom: '1px solid var(--border-color)',
          zIndex: 1030,
        }}
      >
        {/* Left: Window Tabs */}
        <nav className="d-flex align-items-center h-100 gap-1 overflow-x-auto">
          {navTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                className={`navBtn ${isActive ? 'checked' : ''}`}
                onClick={() => handleTabClick(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Right: Connection, Counter Badge, Operator, Clock & Controls */}
        <div className="d-flex align-items-center gap-2 flex-shrink-0">
          {/* Backend connectivity at a glance */}
          <span
            title={serverOnline ? 'Backend online' : 'Backend offline — check pharmacy_server.exe'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            <span className={`pulse-dot ${serverOnline ? '' : 'offline'}`}></span>
          </span>

          {/* Counter ID Badge */}
          <span
            id="navMetaBadge"
            style={{
              backgroundColor: 'var(--badge-bg)',
              color: 'var(--badge-text)',
              border: '1px solid var(--badge-border)',
              borderRadius: '3px',
              padding: '2px 8px',
              fontSize: '11px',
              fontWeight: 700,
            }}
          >
            C01
          </span>

          {/* Logged in User */}
          <span
            id="navMetaBadge"
            style={{
              backgroundColor: 'var(--badge-bg)',
              color: 'var(--badge-text)',
              border: '1px solid var(--badge-border)',
              borderRadius: '3px',
              padding: '2px 8px',
              fontSize: '11px',
              fontWeight: 600,
            }}
          >
            admin
          </span>

          {/* Clock */}
          <span
            className="font-monospace text-secondary"
            style={{ fontSize: '11px', fontWeight: 600, minWidth: '75px', textAlign: 'center', color: 'var(--text-secondary)' }}
          >
            {currentTime}
          </span>

          {/* Theme Toggle */}
          <button
            type="button"
            className="btn btn-sm btn-link p-1 text-decoration-none"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            style={{ fontSize: '14px', lineHeight: 1, color: 'var(--text-secondary)' }}
          >
            {theme === 'dark' ? (
              <i className="bi bi-sun-fill text-warning"></i>
            ) : (
              <i className="bi bi-moon-stars" style={{ color: 'var(--text-secondary)' }}></i>
            )}
          </button>

          {/* Native Desktop Fullscreen Toggle (F11) */}
          <button
            type="button"
            className="btn btn-sm btn-link p-1 text-decoration-none"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen (F11)' : 'Desktop Fullscreen Mode (F11)'}
            style={{ fontSize: '13px', lineHeight: 1, color: 'var(--text-secondary)' }}
          >
            {isFullscreen ? (
              <i className="bi bi-fullscreen-exit" style={{ color: 'var(--brand-teal)' }}></i>
            ) : (
              <i className="bi bi-arrows-fullscreen"></i>
            )}
          </button>
        </div>
      </header>

      {/* Main Full-Width Content Container (100% Counter Viewport) */}
      <main
        className="flex-grow-1 overflow-hidden"
        style={{
          height: 'calc(100vh - 36px)',
          maxHeight: 'calc(100vh - 36px)',
          width: '100vw',
        }}
      >
        {activeTab === 'pos' && <POSTerminal />}
        {activeTab === 'items' && (
          <div className="h-100 w-100 overflow-hidden">
            <MedicineMaster />
          </div>
        )}
        {activeTab === 'stock' && (
          <div className="h-100 p-2 overflow-y-auto">
            <DashboardOverview onNavigate={setActiveTab} />
          </div>
        )}
        {activeTab === 'purchases' && (
          <div className="h-100 p-2 overflow-y-auto">
            <PurchaseEntry />
          </div>
        )}
        {activeTab === 'expiry' && (
          <div className="h-100 p-2 overflow-y-auto">
            <ExpiryWatchlist />
          </div>
        )}
        {activeTab === 'customers' && (
          <div className="h-100 p-2 overflow-y-auto">
            <CustomerKhataView />
          </div>
        )}
        {activeTab === 'suppliers' && (
          <div className="h-100 p-2 overflow-y-auto">
            <SupplierKhataView />
          </div>
        )}
        {activeTab === 'reports' && (
          <div className="h-100 p-2 overflow-y-auto">
            <DaybookReconciliation />
          </div>
        )}
        {activeTab === 'settings' && (
          <div className="h-100 p-2 overflow-y-auto">
            <SettingsView />
          </div>
        )}
      </main>

      {/* Sales Return Modal (Invoked from top bar 'Returns') */}
      <ReturnBillModal
        isOpen={isReturnModalOpen}
        onClose={() => setIsReturnModalOpen(false)}
      />
    </div>
  );
}

export default App;
