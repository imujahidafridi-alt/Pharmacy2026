import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import { StatCard } from '../ui/StatCard';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ThermalReceiptModal } from '../pos/ThermalReceiptModal';
import { useApp } from '../../context/AppContext';
import { Batch, Invoice, Medicine } from '../../types';

export interface DashboardOverviewProps {
  onNavigate: (view: string, options?: { lowStock?: boolean }) => void;
}

interface DrawerSummary {
  session: { id: number; status: string } | null;
  expected_balance: number;
}

export function DashboardOverview({ onNavigate }: DashboardOverviewProps) {
  const { stats, formatCurrency } = useApp();
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
  const [drawer, setDrawer] = useState<DrawerSummary | null>(null);
  const [nearExpiry, setNearExpiry] = useState<Batch[]>([]);
  const [lowStockItems, setLowStockItems] = useState<Medicine[]>([]);
  const [selectedInvoiceForReprint, setSelectedInvoiceForReprint] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(false);

  const dateLabel = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [invoices, drawerStatus, expiring, medicines] = await Promise.all([
        api.getInvoices(10, 0),
        api.getCashDrawerStatus(),
        api.getExpiryWatchlist(30),
        api.getMedicines(),
      ]);
      setRecentInvoices(invoices || []);
      setDrawer(drawerStatus as DrawerSummary);
      setNearExpiry((expiring || []).slice(0, 5));
      setLowStockItems(
        (medicines || [])
          .filter((med) => (med.total_stock ?? 0) <= (med.min_stock_alert ?? 10))
          .slice(0, 5)
      );
    } catch (err) {
      console.error('Dashboard refresh failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  const expired = stats?.expired_batches_count || 0;
  const critical = stats?.critical_batches_count || 0;
  const warning = stats?.warning_batches_count || 0;
  const danger = expired > 0 || critical > 0;
  const drawerOpen = !!drawer?.session;

  const paymentVariant = (mode: string) => {
    if (mode === 'CASH') return 'paid';
    if (mode === 'ONLINE') return 'credit';
    return 'warning'; // CREDIT / legacy KHATA
  };

  return (
    <div className="d-flex flex-column gap-3">
      {/* Welcome banner — uses theme tokens so light and dark both look right */}
      <div
        className="card shadow-sm border-0 text-white p-3"
        style={{ background: 'var(--nav-bg)', borderRadius: '12px' }}
      >
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
          <div>
            <h2 className="fs-4 fw-bold mb-1 text-white">Pharmacy Control &amp; POS Center</h2>
            <p className="mb-0 text-white-50 small">
              Today · {dateLabel} — sales, stock and accounts at a glance.
            </p>
          </div>
          <Button variant="light" onClick={() => onNavigate('pos')} className="fw-bold shadow-sm d-flex align-items-center">
            <i className="bi bi-cart3 me-2"></i> Open POS Terminal
          </Button>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="row g-3">
        <div className="col-12 col-sm-6 col-lg-4 col-xl-2">
          <StatCard
            title="Today's Sales"
            value={formatCurrency(stats?.today_sales || 0)}
            subtext={`${stats?.today_bills_count || 0} bills today · ${dateLabel}`}
            badge={<span className="small text-success">Cash {formatCurrency(stats?.today_cash_collected || 0)}</span>}
            icon={<i className="bi bi-graph-up-arrow text-success"></i>}
            onClick={() => onNavigate('pos')}
          />
        </div>

        <div className="col-12 col-sm-6 col-lg-4 col-xl-2">
          <StatCard
            title="Cash Drawer"
            value={formatCurrency(drawer?.expected_balance || 0)}
            subtext={drawerOpen ? `OPEN · Session #${drawer?.session?.id}` : 'Closed — open a drawer to track cash'}
            icon={<i className={`bi bi-cash-stack ${drawerOpen ? 'text-success' : 'text-muted'}`}></i>}
            onClick={() => onNavigate('drawer')}
          />
        </div>

        <div className="col-12 col-sm-6 col-lg-4 col-xl-2">
          <StatCard
            title="Customer Khata"
            value={formatCurrency(stats?.total_receivable || 0)}
            subtext={`${stats?.active_khata_customers || 0} customers with dues`}
            icon={<i className="bi bi-people-fill text-primary"></i>}
            onClick={() => onNavigate('customers')}
          />
        </div>

        <div className="col-12 col-sm-6 col-lg-4 col-xl-2">
          <StatCard
            title="Supplier Payables"
            value={formatCurrency(stats?.total_payable || 0)}
            subtext="Pending distributor debt"
            icon={<i className="bi bi-truck text-warning"></i>}
            onClick={() => onNavigate('suppliers')}
          />
        </div>

        <div className="col-12 col-sm-6 col-lg-4 col-xl-2">
          <StatCard
            title="Expiry Alert"
            value={
              <span style={{ color: danger ? 'var(--bs-danger, #dc3545)' : 'var(--brand-teal)' }}>
                {critical} Critical
              </span>
            }
            subtext={`${expired} expired · ${warning} within 90 days`}
            icon={<i className={`bi ${danger ? 'bi-exclamation-triangle-fill text-danger' : 'bi-shield-check text-success'}`}></i>}
            onClick={() => onNavigate('expiry')}
          />
        </div>

        <div className="col-12 col-sm-6 col-lg-4 col-xl-2">
          <StatCard
            title="Low Stock"
            value={`${stats?.low_stock_count || 0} Items`}
            subtext="Below safety stock level"
            icon={<i className="bi bi-boxes text-info"></i>}
            onClick={() => onNavigate('items', { lowStock: true })}
          />
        </div>
      </div>

      {/* Quick actions */}
      <div className="d-flex flex-wrap align-items-center gap-2">
        <span className="small fw-bold text-uppercase text-secondary" style={{ fontSize: '10.5px', letterSpacing: '0.08em' }}>
          Quick actions
        </span>
        <Button variant="secondary" size="sm" className="secondaryBtn" onClick={() => onNavigate('drawer')}>
          <i className="bi bi-cash-stack me-1"></i> Cash Drawer
        </Button>
        <Button variant="secondary" size="sm" className="secondaryBtn" onClick={() => onNavigate('items')}>
          <i className="bi bi-plus-circle me-1"></i> Add Item
        </Button>
        <Button variant="secondary" size="sm" className="secondaryBtn" onClick={() => onNavigate('expiry')}>
          <i className="bi bi-hourglass-split me-1"></i> Check Expiry
        </Button>
        <Button variant="secondary" size="sm" className="secondaryBtn" onClick={() => onNavigate('reports')}>
          <i className="bi bi-journal-text me-1"></i> Daybook
        </Button>
      </div>

      {/* Watchlists */}
      <div className="row g-3">
        <div className="col-md-6">
          <div className="card shadow-sm border h-100">
            <div className="card-header bg-body-tertiary d-flex justify-content-between align-items-center py-2 px-3 border-bottom">
              <span className="fw-bold small text-uppercase">Near Expiry (next 30 days)</span>
              <button type="button" className="btn btn-sm btn-link p-0 text-decoration-none" onClick={() => onNavigate('expiry')}>
                View all
              </button>
            </div>
            <div className="table-responsive">
              <table className="table table-sm mb-0 align-middle">
                <tbody>
                  {nearExpiry.length === 0 ? (
                    <tr><td className="text-center py-3 text-secondary small">Nothing expiring in the next 30 days.</td></tr>
                  ) : (
                    nearExpiry.map((batch) => (
                      <tr key={batch.id}>
                        <td className="small fw-semibold">{batch.medicine_name || `Batch ${batch.batch_number}`}</td>
                        <td className="small text-secondary font-monospace">{batch.batch_number}</td>
                        <td className="text-end small"><Badge variant={batch.expiry_status === 'expired' ? 'expired' : 'critical'}>{batch.days_until_expiry}d</Badge></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="card shadow-sm border h-100">
            <div className="card-header bg-body-tertiary d-flex justify-content-between align-items-center py-2 px-3 border-bottom">
              <span className="fw-bold small text-uppercase">Low Stock Items</span>
              <button type="button" className="btn btn-sm btn-link p-0 text-decoration-none" onClick={() => onNavigate('items', { lowStock: true })}>
                View all
              </button>
            </div>
            <div className="table-responsive">
              <table className="table table-sm mb-0 align-middle">
                <tbody>
                  {lowStockItems.length === 0 ? (
                    <tr><td className="text-center py-3 text-secondary small">All items are above their safety level.</td></tr>
                  ) : (
                    lowStockItems.map((med) => (
                      <tr key={med.id}>
                        <td className="small fw-semibold">{med.name}</td>
                        <td className="text-end small font-monospace">
                          {med.total_stock ?? 0} / {med.min_stock_alert ?? 10}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Invoices Table */}
      <div className="card shadow-sm border overflow-hidden">
        <div className="card-header bg-body-tertiary d-flex justify-content-between align-items-center py-2 px-3 border-bottom">
          <span className="fw-bold fs-6">Recent Sales Invoices</span>
          <Button variant="ghost" size="sm" onClick={() => onNavigate('pos')}>New Sale</Button>
        </div>

        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th>Invoice #</th>
                <th>Date &amp; Time</th>
                <th>Customer Name</th>
                <th>Payment Mode</th>
                <th className="text-end">Total Amount</th>
                <th className="text-end">Paid Amount</th>
                <th className="text-center">Status</th>
                <th className="text-end">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-4 text-secondary">Loading invoices...</td></tr>
              ) : recentInvoices.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-4 text-secondary">No sales invoices found yet.</td></tr>
              ) : (
                recentInvoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="fw-bold font-monospace">{inv.invoice_number}</td>
                    <td className="small text-secondary">{inv.date}</td>
                    <td>{inv.customer_name || 'Walk-in'}</td>
                    <td><Badge variant={paymentVariant(inv.payment_mode)}>{inv.payment_mode}</Badge></td>
                    <td className="text-end fw-bold">{formatCurrency(inv.total_amount)}</td>
                    <td className="text-end">{formatCurrency(inv.paid_amount)}</td>
                    <td className="text-center">
                      <Badge variant={inv.status === 'COMPLETED' ? 'healthy' : 'expired'}>{inv.status}</Badge>
                    </td>
                    <td className="text-end">
                      <Button variant="secondary" size="sm" className="secondaryBtn d-inline-flex align-items-center" onClick={() => setSelectedInvoiceForReprint(inv)}>
                        <i className="bi bi-printer me-1"></i> Reprint
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ThermalReceiptModal
        isOpen={!!selectedInvoiceForReprint}
        onClose={() => setSelectedInvoiceForReprint(null)}
        invoice={selectedInvoiceForReprint}
      />
    </div>
  );
}
