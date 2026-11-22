import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { useApp } from '../../context/AppContext';
import { useToast } from '../../context/ToastContext';
import { Batch } from '../../types';

export function ExpiryWatchlist() {
  const { formatCurrency, refreshStats } = useApp();
  const toast = useToast();

  const [watchlist, setWatchlist] = useState<Batch[]>([]);
  const [filterTier, setFilterTier] = useState<string>('ALL');
  const [loading, setLoading] = useState(false);

  const loadExpiry = async () => {
    setLoading(true);
    try {
      const data = await api.getExpiryWatchlist(90);
      setWatchlist(data || []);
    } catch (err: any) {
      toast.error('Failed to load expiry watchlist: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExpiry();
  }, []);

  const handleQuarantine = async (batch: Batch) => {
    const isQuarantined = Number(batch.is_quarantined) === 1;
    const confirmMsg = isQuarantined
      ? `Release Batch #${batch.batch_number} from quarantine?`
      : `Quarantine Batch #${batch.batch_number}? It will be locked from sales.`;

    if (!window.confirm(confirmMsg)) return;

    try {
      await api.updateBatch(batch.id, {
        batch_number: batch.batch_number,
        expiry_date: batch.expiry_date,
        purchase_rate: batch.purchase_rate,
        sale_rate: batch.sale_rate,
        quantity: batch.quantity,
        is_quarantined: isQuarantined ? 0 : 1,
      });
      toast.success(`Batch ${batch.batch_number} status updated!`);
      refreshStats();
      loadExpiry();
    } catch (err: any) {
      toast.error('Failed to update batch: ' + err.message);
    }
  };

  const expiredCount = watchlist.filter((b) => b.expiry_status === 'expired').length;
  const criticalCount = watchlist.filter((b) => b.expiry_status === 'critical').length;
  const warningCount = watchlist.filter((b) => b.expiry_status === 'warning').length;

  const filtered = watchlist.filter((b) => {
    if (filterTier === 'EXPIRED') return b.expiry_status === 'expired';
    if (filterTier === 'CRITICAL') return b.expiry_status === 'critical';
    if (filterTier === 'WARNING') return b.expiry_status === 'warning';
    return true;
  });

  return (
    <div className="d-flex flex-column gap-3">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div>
          <h2 className="fs-4 fw-bold mb-0">Expiry Watchlist & Quality Control</h2>
          <p className="small text-secondary mb-0">
            Monitor expired and near-expiry batches across all racks with automated FEFO alerts.
          </p>
        </div>

        <Button variant="secondary" onClick={loadExpiry} loading={loading} className="d-inline-flex align-items-center">
          <i className="bi bi-arrow-clockwise me-1"></i> Refresh
        </Button>
      </div>

      {/* Summary KPI Tier Bar */}
      <div className="row g-3">
        <div className="col-12 col-sm-6 col-lg-3">
          <div
            className={`card shadow-sm border h-100 stat-card-clickable ${
              filterTier === 'EXPIRED' ? 'border-danger bg-danger-subtle' : 'border-start border-danger border-4'
            }`}
            onClick={() => setFilterTier('EXPIRED')}
          >
            <div className="card-body p-3">
              <div className="d-flex justify-content-between align-items-center mb-1">
                <span className="small fw-bold text-danger text-uppercase">Expired Stock</span>
                <i className="bi bi-x-octagon-fill text-danger fs-5"></i>
              </div>
              <div className="fs-3 fw-bold text-danger">{expiredCount}</div>
              <div className="small text-secondary">Hard locked from billing</div>
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-lg-3">
          <div
            className={`card shadow-sm border h-100 stat-card-clickable ${
              filterTier === 'CRITICAL' ? 'border-warning bg-warning-subtle' : 'border-start border-warning border-4'
            }`}
            onClick={() => setFilterTier('CRITICAL')}
          >
            <div className="card-body p-3">
              <div className="d-flex justify-content-between align-items-center mb-1">
                <span className="small fw-bold text-warning-emphasis text-uppercase">Critical (&lt; 30d)</span>
                <i className="bi bi-exclamation-triangle-fill text-warning-emphasis fs-5"></i>
              </div>
              <div className="fs-3 fw-bold text-warning-emphasis">{criticalCount}</div>
              <div className="small text-secondary">Immediate clearance required</div>
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-lg-3">
          <div
            className={`card shadow-sm border h-100 stat-card-clickable ${
              filterTier === 'WARNING' ? 'border-info bg-info-subtle' : 'border-start border-info border-4'
            }`}
            onClick={() => setFilterTier('WARNING')}
          >
            <div className="card-body p-3">
              <div className="d-flex justify-content-between align-items-center mb-1">
                <span className="small fw-bold text-info-emphasis text-uppercase">Warning (31-90d)</span>
                <i className="bi bi-bell-fill text-info fs-5"></i>
              </div>
              <div className="fs-3 fw-bold text-info-emphasis">{warningCount}</div>
              <div className="small text-secondary">Monitor & prioritize sales</div>
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-lg-3">
          <div
            className={`card shadow-sm border h-100 stat-card-clickable ${
              filterTier === 'ALL' ? 'border-primary bg-primary-subtle' : 'border-start border-primary border-4'
            }`}
            onClick={() => setFilterTier('ALL')}
          >
            <div className="card-body p-3">
              <div className="d-flex justify-content-between align-items-center mb-1">
                <span className="small fw-bold text-primary text-uppercase">All Watchlist</span>
                <i className="bi bi-clipboard2-check-fill text-primary fs-5"></i>
              </div>
              <div className="fs-3 fw-bold text-primary">{watchlist.length}</div>
              <div className="small text-secondary">Total tracked batches</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="d-flex gap-2 border-bottom pb-2">
        {[
          { id: 'ALL', label: `All Batches (${watchlist.length})` },
          { id: 'EXPIRED', label: `Expired (${expiredCount})` },
          { id: 'CRITICAL', label: `Critical <30d (${criticalCount})` },
          { id: 'WARNING', label: `Warning <90d (${warningCount})` },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`btn btn-sm ${filterTier === tab.id ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => setFilterTier(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Watchlist Table */}
      <div className="table-responsive border rounded shadow-sm bg-body">
        <table className="table table-hover align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th>Medicine Name</th>
              <th>Generic / Salt</th>
              <th>Batch Number</th>
              <th>Expiry Date</th>
              <th>Days Remaining</th>
              <th className="text-center">Units in Stock</th>
              <th className="text-center">Rack Location</th>
              <th>Status</th>
              <th className="text-end">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="text-center py-5 text-secondary">
                  Checking expiry dates...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-5 text-secondary">
                  <div className="d-flex flex-column align-items-center py-2">
                    <i className="bi bi-shield-check text-success fs-1 mb-2"></i>
                    <span className="fw-semibold">No batches found in this expiry tier.</span>
                    <span className="small text-secondary">Your pharmacy inventory in this range is safe and healthy.</span>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((b) => {
                const isExpired = b.expiry_status === 'expired';
                const isQuarantined = Number(b.is_quarantined) === 1;

                return (
                  <tr key={b.id} className={isExpired ? 'table-danger' : undefined}>
                    <td>
                      <div className="fw-bold text-body">{b.medicine_name}</div>
                      <div className="small text-secondary">{b.category}</div>
                    </td>
                    <td className="small text-secondary">{b.generic_name}</td>
                    <td className="fw-semibold font-monospace">{b.batch_number}</td>
                    <td className="fw-bold">{b.expiry_date}</td>
                    <td className={`fw-bold ${isExpired ? 'text-danger' : 'text-warning-emphasis'}`}>
                      {isExpired
                        ? `Expired ${Math.abs(b.days_until_expiry || 0)} days ago`
                        : `${b.days_until_expiry} days left`}
                    </td>
                    <td className="text-center fw-bold">{b.quantity}</td>
                    <td className="text-center">
                      <span className="badge bg-body-secondary text-secondary border d-inline-flex align-items-center">
                        <i className="bi bi-geo-alt-fill me-1 text-muted"></i>
                        {b.rack_location || 'Rack N/A'}
                      </span>
                    </td>
                    <td>
                      {isQuarantined ? (
                        <Badge variant="expired">Quarantined</Badge>
                      ) : (
                        <Badge variant={b.expiry_status}>
                          {isExpired
                            ? 'Expired'
                            : b.expiry_status === 'critical'
                            ? 'Critical'
                            : 'Near Expiry'}
                        </Badge>
                      )}
                    </td>
                    <td className="text-end">
                      <Button
                        variant={isQuarantined ? 'secondary' : 'danger'}
                        size="sm"
                        onClick={() => handleQuarantine(b)}
                      >
                        {isQuarantined ? 'Release' : 'Quarantine'}
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
