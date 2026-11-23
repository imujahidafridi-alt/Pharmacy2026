import React, { useState, useEffect } from 'react';
import { useApp } from './context/AppContext';
import { POSTerminal } from './components/pos/POSTerminal';
import { CustomerKhataView } from './components/khata/CustomerKhataView';
import { SupplierKhataView } from './components/khata/SupplierKhataView';
import { MedicineMaster } from './components/inventory/MedicineMaster';
import { ExpiryWatchlist } from './components/inventory/ExpiryWatchlist';
import { PurchaseEntry } from './components/purchases/PurchaseEntry';
import { DaybookReconciliation } from './components/reports/DaybookReconciliation';
import { CashDrawerView } from './components/reports/CashDrawerView';
import { DashboardOverview } from './components/reports/DashboardOverview';
import { SettingsView } from './components/reports/SettingsView';
import { ReturnBillModal } from './components/pos/ReturnBillModal';

export function App() {
  const { theme, toggleTheme, settings, serverOnline, stats } = useApp();
  const [activeTab, setActiveTab] = useState<string>('pos');
  const [currentTime, setCurrentTime] = useState<string>(() => new Date().toLocaleTimeString());
  const [isReturnModalOpen, setIsReturnModalOpen] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => !!document.fullscreenElement);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  // Set Desktop Window Title from the configured store name
  useEffect(() => {
    document.title = `${settings.pharmacy_name || 'A1 Pharmacy'} — Counter Terminal`;
  }, [settings.pharmacy_name]);

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

  // Menu bar: close on outside click or Escape
  useEffect(() => {
    if (!openMenu) return;
    const dismiss = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === 'Escape') setOpenMenu(null);
        return;
      }
      if (!(event.target as HTMLElement)?.closest('.app-menu-bar')) setOpenMenu(null);
    };
    document.addEventListener('mousedown', dismiss);
    document.addEventListener('keydown', dismiss);
    return () => {
      document.removeEventListener('mousedown', dismiss);
      document.removeEventListener('keydown', dismiss);
    };
  }, [openMenu]);

  // Grouped desktop menu bar
  type MenuItem = { id: string; label: string; icon: string; shortcut?: string };
  type MenuGroup = { id: string; label: string; items: MenuItem[] };

  const MENUS: MenuGroup[] = [
    {
      id: 'sale',
      label: 'Sale',
      items: [
        { id: 'pos', label: 'Sale Terminal', icon: 'bi-cash-coin', shortcut: 'F9' },
        { id: 'returns', label: 'Sales Return / Wapsi', icon: 'bi-arrow-return-left', shortcut: 'Alt+W' },
      ],
    },
    {
      id: 'inventory',
      label: 'Inventory',
      items: [
        { id: 'items', label: 'Items & Pricing', icon: 'bi-capsule' },
        { id: 'stock', label: 'Stock Overview', icon: 'bi-boxes' },
        { id: 'expiry', label: 'Expiry Watchlist', icon: 'bi-hourglass-split' },
        { id: 'purchases', label: 'Purchases / GRN', icon: 'bi-truck' },
      ],
    },
    {
      id: 'accounts',
      label: 'Accounts',
      items: [
        { id: 'customers', label: 'Customers / Khata', icon: 'bi-people' },
        { id: 'suppliers', label: 'Suppliers / Payables', icon: 'bi-building' },
        { id: 'drawer', label: 'Cash Drawer', icon: 'bi-cash-stack' },
      ],
    },
    {
      id: 'system',
      label: 'System',
      items: [
        { id: 'reports', label: 'Daybook & Reports', icon: 'bi-journal-text' },
        { id: 'settings', label: 'Settings', icon: 'bi-gear' },
      ],
    },
  ];

  const activeMenuId = MENUS.find((menu) => menu.items.some((item) => item.id === activeTab))?.id;

  const handleTabClick = (tabId: string) => {
    if (tabId === 'returns') {
      setIsReturnModalOpen(true);
    } else {
      setActiveTab(tabId);
    }
  };

  const renderMenuItems = (items: MenuItem[]) =>
    items.map((item) => (
      <button
        key={item.id}
        type="button"
        className={`app-menu-item ${activeTab === item.id ? 'is-active' : ''}`}
        onClick={() => {
          handleTabClick(item.id);
          setOpenMenu(null);
        }}
      >
        <i className={`bi ${item.icon}`}></i>
        <span>{item.label}</span>
        {item.shortcut && <kbd>{item.shortcut}</kbd>}
      </button>
    ));

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
      {/* Compact grouped desktop menu bar */}
      <header id="navBar" className="app-menu-bar flex-shrink-0">
        <div className="app-menu-brand">
          <span className="app-menu-mark">℞</span>
          <span className="app-menu-brand-text">{settings.pharmacy_name || 'Pharmacy POS'}</span>
        </div>

        <nav className="app-menu-groups">
          {MENUS.map((menu) => (
            <div
              key={menu.id}
              className="app-menu-group"
              onMouseEnter={() => {
                if (openMenu && openMenu !== 'all') setOpenMenu(menu.id);
              }}
            >
              <button
                type="button"
                className={`app-menu-trigger ${activeMenuId === menu.id ? 'is-active' : ''} ${
                  openMenu === menu.id ? 'is-open' : ''
                }`}
                onClick={() => setOpenMenu(openMenu === menu.id ? null : menu.id)}
                aria-expanded={openMenu === menu.id}
              >
                {menu.label}
                <i className="bi bi-chevron-down app-menu-caret"></i>
              </button>
              {openMenu === menu.id && (
                <div className="app-menu-dropdown">{renderMenuItems(menu.items)}</div>
              )}
            </div>
          ))}
        </nav>

        <div className="app-menu-mobile">
          <button
            type="button"
            className={`app-menu-mobile-trigger ${openMenu === 'all' ? 'is-open' : ''}`}
            onClick={() => setOpenMenu(openMenu === 'all' ? null : 'all')}
          >
            <i className="bi bi-list"></i>
            <span>Menu</span>
          </button>
          {openMenu === 'all' && (
            <div className="app-menu-dropdown app-menu-dropdown-mobile">
              {MENUS.map((menu) => (
                <div key={menu.id} className="app-menu-mobile-group">
                  <div className="app-menu-mobile-title">{menu.label}</div>
                  {renderMenuItems(menu.items)}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="app-menu-meta">
          <span
            title={serverOnline ? 'Backend online' : 'Backend offline — check pharmacy_server.exe'}
            className="app-menu-status"
          >
            <span className={`pulse-dot ${serverOnline ? '' : 'offline'}`}></span>
          </span>
          <span className="app-menu-chip" title="Counter">C01</span>
          <span className="app-menu-chip app-meta-optional" title="Operator">admin</span>
          <span className="app-menu-clock app-meta-optional">{currentTime}</span>
          <button
            type="button"
            className="app-menu-icon-btn"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? (
              <i className="bi bi-sun-fill text-warning"></i>
            ) : (
              <i className="bi bi-moon-stars"></i>
            )}
          </button>
          <button
            type="button"
            className="app-menu-icon-btn"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen (F11)' : 'Desktop Fullscreen Mode (F11)'}
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
          height: 'calc(100vh - 38px)',
          maxHeight: 'calc(100vh - 38px)',
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
        {activeTab === 'drawer' && (
          <div className="h-100 p-2 overflow-hidden">
            <CashDrawerView />
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
