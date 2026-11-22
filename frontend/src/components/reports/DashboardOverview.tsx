import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { StatCard } from '../ui/StatCard';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ThermalReceiptModal } from '../pos/ThermalReceiptModal';
import { useApp } from '../../context/AppContext';
import { Invoice } from '../../types';

export interface DashboardOverviewProps {
  onNavigate: (view: string) => void;
}

export function DashboardOverview({ onNavigate }: DashboardOverviewProps) {
  const { stats, formatCurrency } = useApp();
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
  const [selectedInvoiceForReprint, setSelectedInvoiceForReprint] = useState<Invoice | null>(null);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  useEffect(() => {
    setLoadingInvoices(true);
    api.getInvoices(10, 0)
      .then((invs) => setRecentInvoices(invs || []))
      .catch((err) => console.error(err))
      .finally(() => setLoadingInvoices(false));
  }, []);

  return (
    <div className="d-flex flex-column gap-3">
      {/* Welcome Banner */}
      <div
        className="card shadow-sm border-0 text-white p-4"
        style={{
          background: 'linear-gradient(135deg, #059669, #0d9488)',
          borderRadius: '12px',
        }}
      >
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
          <div>
            <h2 className="fs-3 fw-bold mb-1 text-white">Pharmacy Control & POS Center</h2>
            <p className="mb-0 text-white-50 small">
              Point of Sale Billing, Automated Batch & Expiry Management, and Financial Ledgers.
            </p>
          </div>

          <Button
            variant="light"
            onClick={() => onNavigate('pos')}
            className="fw-bold shadow-sm d-flex align-items-center"
          >
            <i className="bi bi-cart3 me-2"></i> Open POS Terminal (F1)
          </Button>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="row g-3">
        <div className="col-12 col-sm-6 col-lg-4 col-xl-2">
          <StatCard
            title="Today's Sales"
            value={formatCurrency(stats?.today_sales || 0)}
            subtext={`${stats?.today_bills_count || 0} bills today`}
            icon={<i className="bi bi-graph-up-arrow text-success"></i>}
            onClick={() => onNavigate('pos')}
          />
        </div>

        <div className="col-12 col-sm-6 col-lg-4 col-xl-2">
          <StatCard
            title="Cash Drawer"
            value={formatCurrency(stats?.cash_in_drawer || 0)}
            subtext="Net physical drawer float"
            icon={<i className="bi bi-cash-stack text-success"></i>}
            onClick={() => onNavigate('daybook')}
          />
        </div>

        <div className="col-12 col-sm-6 col-lg-4 col-xl-2">
          <StatCard
            title="Customer Khata"
            value={formatCurrency(stats?.total_receivable || 0)}
            subtext={`${stats?.active_khata_customers || 0} active credit accounts`}
            icon={<i className="bi bi-people-fill text-primary"></i>}
            onClick={() => onNavigate('customer_khata')}
          />
        </div>

        <div className="col-12 col-sm-6 col-lg-4 col-xl-2">
          <StatCard
            title="Supplier Payables"
            value={formatCurrency(stats?.total_payable || 0)}
            subtext="Pending distributor debt"
            icon={<i className="bi bi-truck text-warning"></i>}
            onClick={() => onNavigate('supplier_khata')}
          />
        </div>

        <div className="col-12 col-sm-6 col-lg-4 col-xl-2">
          <StatCard
            title="Expiry Alert"
            value={`${stats?.expired_batches_count || 0} Expired`}
            subtext={`${stats?.critical_batches_count || 0} critical near-expiry`}
            icon={<i className="bi bi-exclamation-triangle-fill text-danger"></i>}
            onClick={() => onNavigate('expiry')}
          />
        </div>

        <div className="col-12 col-sm-6 col-lg-4 col-xl-2">
          <StatCard
            title="Low Stock"
            value={`${stats?.low_stock_count || 0} Items`}
            subtext="Below safety stock level"
            icon={<i className="bi bi-boxes text-info"></i>}
            onClick={() => onNavigate('inventory')}
          />
        </div>
      </div>

      {/* Recent Invoices Table */}
      <div className="card shadow-sm border overflow-hidden">
        <div className="card-header bg-body-tertiary d-flex justify-content-between align-items-center py-2 px-3 border-bottom">
          <span className="fw-bold fs-6">Recent Sales Invoices</span>
          <Button variant="ghost" size="sm" onClick={() => onNavigate('pos')}>
            View POS
          </Button>
        </div>

        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th>Invoice #</th>
                <th>Date & Time</th>
                <th>Customer Name</th>
                <th>Payment Mode</th>
                <th className="text-end">Total Amount</th>
                <th className="text-end">Paid Amount</th>
                <th className="text-center">Status</th>
                <th className="text-end">Action</th>
              </tr>
            </thead>
            <tbody>
              {loadingInvoices ? (
                <tr>
                  <td colSpan={8} className="text-center py-4 text-secondary">
                    Loading invoices...
                  </td>
                </tr>
              ) : recentInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-4 text-secondary">
                    No sales invoices found yet.
                  </td>
                </tr>
              ) : (
                recentInvoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="fw-bold font-monospace">{inv.invoice_number}</td>
                    <td className="small text-secondary">{inv.date}</td>
                    <td>{inv.customer_name || 'Walk-in'}</td>
                    <td>
                      <Badge variant="paid">{inv.payment_mode}</Badge>
                    </td>
                    <td className="text-end fw-bold">{formatCurrency(inv.total_amount)}</td>
                    <td className="text-end">{formatCurrency(inv.paid_amount)}</td>
                    <td className="text-center">
                      <Badge variant={inv.status === 'COMPLETED' ? 'healthy' : 'expired'}>
                        {inv.status}
                      </Badge>
                    </td>
                    <td className="text-end">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setSelectedInvoiceForReprint(inv)}
                        className="d-inline-flex align-items-center"
                      >
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
