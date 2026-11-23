import React, { useCallback, useEffect, useMemo, useState, FormEvent } from 'react';
import { api } from '../../services/api';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { useApp } from '../../context/AppContext';
import { useToast } from '../../context/ToastContext';

interface DrawerSession {
  id: number;
  opened_at: string;
  closed_at?: string | null;
  opening_float: number;
  expected_closing?: number | null;
  counted_closing?: number | null;
  variance?: number | null;
  status: string;
  notes?: string | null;
}

interface DrawerMovement {
  id: number;
  date: string;
  entry_type: string;
  amount: number;
  direction: 'IN' | 'OUT';
  notes?: string | null;
  reference_id?: number | null;
}

interface DrawerStatus {
  session: DrawerSession | null;
  expected_balance: number;
  total_in: number;
  total_out: number;
  movements: DrawerMovement[];
  breakdown: Record<string, { in: number; out: number }>;
}

const DENOMINATIONS = [5000, 1000, 500, 100, 50, 20, 10];

const INFLOW_TYPES = [
  { value: 'CASH_SALE', label: 'Cash Sale' },
  { value: 'KHATA_COLLECTION', label: 'Khata Collection' },
  { value: 'CASH_DEPOSIT', label: 'Owner Cash Deposit' },
  { value: 'OTHER_INFLOW', label: 'Other Cash In' },
];

const OUTFLOW_TYPES = [
  { value: 'PETTY_CASH', label: 'Petty Expense' },
  { value: 'SUPPLIER_PAYMENT', label: 'Supplier Cash Payment' },
  { value: 'SALE_RETURN', label: 'Cash Refund' },
  { value: 'OWNER_WITHDRAWAL', label: 'Owner Withdrawal' },
];

export function CashDrawerView() {
  const { formatCurrency, refreshStats } = useApp();
  const toast = useToast();

  const [status, setStatus] = useState<DrawerStatus | null>(null);
  const [history, setHistory] = useState<DrawerSession[]>([]);
  const [loading, setLoading] = useState(false);

  const [isOpenModal, setIsOpenModal] = useState(false);
  const [openingFloat, setOpeningFloat] = useState<number | string>('10000');
  const [openNotes, setOpenNotes] = useState('');

  const [isMovementModal, setIsMovementModal] = useState(false);
  const [movementDirection, setMovementDirection] = useState<'IN' | 'OUT'>('OUT');
  const [movementType, setMovementType] = useState('PETTY_CASH');
  const [movementAmount, setMovementAmount] = useState<number | string>('');
  const [movementNotes, setMovementNotes] = useState('');

  const [isCloseModal, setIsCloseModal] = useState(false);
  const [counts, setCounts] = useState<Record<number, string>>(() =>
    Object.fromEntries(DENOMINATIONS.map((d) => [d, '0']))
  );
  const [closeNotes, setCloseNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [current, past] = await Promise.all([
        api.getCashDrawerStatus(),
        api.getCashDrawerHistory(20),
      ]);
      setStatus(current as DrawerStatus);
      setHistory((past?.sessions as DrawerSession[]) || []);
    } catch (err: any) {
      toast.error('Failed to load cash drawer: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [load]);

  const countedTotal = useMemo(
    () =>
      DENOMINATIONS.reduce((sum, denomination) => {
        const count = Number(counts[denomination]) || 0;
        return sum + count * denomination;
      }, 0),
    [counts]
  );

  const expected = status?.expected_balance || 0;
  const variance = countedTotal - expected;
  const isOpen = !!status?.session;

  const handleOpenDrawer = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.openCashDrawer(openingFloat, openNotes);
      toast.success('Cash drawer opened. Float recorded.');
      refreshStats();
      setIsOpenModal(false);
      setOpenNotes('');
      await load();
    } catch (err: any) {
      toast.error(err.message || 'Failed to open drawer');
    }
  };

  const handleMovement = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.addCashDrawerMovement(movementType, movementAmount, movementDirection, movementNotes);
      toast.success('Cash movement recorded.');
      refreshStats();
      setIsMovementModal(false);
      setMovementAmount('');
      setMovementNotes('');
      await load();
    } catch (err: any) {
      toast.error(err.message || 'Failed to record cash movement');
    }
  };

  const handleCloseDrawer = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const result = await api.closeCashDrawer(countedTotal, closeNotes);
      const diff = Number((result as any)?.variance || 0);
      toast.success(
        Math.abs(diff) < 0.01
          ? 'Drawer reconciled — cash count matches.'
          : `Drawer closed with a variance of ${formatCurrency(diff)}.`
      );
      refreshStats();
      setIsCloseModal(false);
      setCloseNotes('');
      setCounts(Object.fromEntries(DENOMINATIONS.map((d) => [d, '0'])));
      await load();
    } catch (err: any) {
      toast.error(err.message || 'Failed to close drawer');
    }
  };

  return (
    <div className="d-flex flex-column h-100 overflow-hidden" style={{ gap: '10px' }}>
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 flex-shrink-0">
        <div>
          <h2 className="fs-4 fw-bold mb-0">Cash Drawer</h2>
          <p className="small text-secondary mb-0">
            Open a shift, track every physical cash movement, and reconcile the till at close.
          </p>
        </div>
        <div className="d-flex gap-2">
          <Button variant="secondary" onClick={load} disabled={loading}>
            <i className="bi bi-arrow-clockwise me-1"></i> Refresh
          </Button>
          {isOpen ? (
            <>
              <Button variant="primary" onClick={() => setIsMovementModal(true)}>
                <i className="bi bi-plus-circle me-1"></i> Cash Movement
              </Button>
              <Button variant="secondary" onClick={() => setIsCloseModal(true)}>
                <i className="bi bi-cash-coin me-1"></i> Close &amp; Reconcile
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={() => setIsOpenModal(true)}>
              <i className="bi bi-door-open me-1"></i> Open Drawer
            </Button>
          )}
        </div>
      </div>

      {/* Status Cards */}
      <div className="row g-2 flex-shrink-0">
        <div className="col-md-4">
          <div className="card h-100 border-start border-4 border-success shadow-sm">
            <div className="card-body p-3">
              <div className="d-flex justify-content-between align-items-center">
                <span className="small fw-bold text-success text-uppercase">Expected Cash in Drawer</span>
                <i className="bi bi-cash-stack fs-5 text-success"></i>
              </div>
              <div className="fs-3 fw-bold" style={{ color: 'var(--brand-teal)' }}>
                {formatCurrency(expected)}
              </div>
              <div className="small text-secondary">
                {isOpen ? `Session #${status?.session?.id} · opened ${status?.session?.opened_at}` : 'No active session'}
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card h-100 border-start border-4 border-primary shadow-sm">
            <div className="card-body p-3">
              <div className="small fw-bold text-uppercase" style={{ color: 'var(--text-secondary)' }}>
                Cash In This Shift
              </div>
              <div className="fs-3 fw-bold text-primary">{formatCurrency(status?.total_in || 0)}</div>
              <div className="small text-secondary">Sales, collections, deposits</div>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card h-100 border-start border-4 border-danger shadow-sm">
            <div className="small fw-bold text-danger text-uppercase pt-3 px-3">Cash Out This Shift</div>
            <div className="fs-3 fw-bold text-danger px-3">{formatCurrency(status?.total_out || 0)}</div>
            <div className="small text-secondary px-3 pb-3">Expenses, refunds, payouts</div>
          </div>
        </div>
      </div>

      <div className="flex-grow-1 overflow-auto" style={{ minHeight: 0 }}>
        {!isOpen && (
          <div className="alert alert-info py-3 text-center">
            <i className="bi bi-info-circle me-1"></i>
            The drawer is closed. Open it with a starting float before taking cash sales.
          </div>
        )}

        {/* Movement ledger */}
        <div className="table-responsive border rounded shadow-sm bg-body mb-3">
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th>Details</th>
                <th>Direction</th>
                <th className="text-end">Amount</th>
              </tr>
            </thead>
            <tbody>
              {!status?.movements?.length ? (
                <tr>
                  <td colSpan={5} className="text-center py-4 text-secondary">
                    No cash movements recorded yet.
                  </td>
                </tr>
              ) : (
                [...status.movements].reverse().map((movement) => {
                  const cashIn = movement.direction === 'IN';
                  return (
                    <tr key={movement.id}>
                      <td className="small text-secondary">{movement.date}</td>
                      <td><Badge variant={cashIn ? 'paid' : 'expired'}>{movement.entry_type}</Badge></td>
                      <td>{movement.notes || '—'}</td>
                      <td className={cashIn ? 'text-success fw-bold small' : 'text-danger fw-bold small'}>
                        {cashIn ? 'Cash IN' : 'Cash OUT'}
                      </td>
                      <td className={`text-end fw-bold ${cashIn ? 'text-success' : 'text-danger'}`}>
                        {cashIn ? '+' : '-'}{formatCurrency(movement.amount)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Previous sessions */}
        <div className="fw-bold text-uppercase mb-2" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
          Closed Shifts
        </div>
        <div className="table-responsive border rounded shadow-sm bg-body">
          <table className="table table-hover table-sm align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th>Session</th>
                <th>Opened</th>
                <th>Closed</th>
                <th className="text-end">Opening Float</th>
                <th className="text-end">Expected</th>
                <th className="text-end">Counted</th>
                <th className="text-end">Variance</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-3 text-secondary">No closed shifts yet.</td>
                </tr>
              ) : (
                history.map((session) => {
                  const diff = Number(session.variance || 0);
                  return (
                    <tr key={session.id}>
                      <td>#{session.id}</td>
                      <td className="small text-secondary">{session.opened_at}</td>
                      <td className="small text-secondary">{session.closed_at || '—'}</td>
                      <td className="text-end">{formatCurrency(session.opening_float)}</td>
                      <td className="text-end">{formatCurrency(session.expected_closing || 0)}</td>
                      <td className="text-end">{formatCurrency(session.counted_closing || 0)}</td>
                      <td className={`text-end fw-bold ${Math.abs(diff) < 0.01 ? 'text-success' : 'text-danger'}`}>
                        {formatCurrency(diff)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Open Drawer */}
      <Modal
        isOpen={isOpenModal}
        onClose={() => setIsOpenModal(false)}
        title="Open Cash Drawer"
        maxWidth="460px"
        footer={
          <div className="d-flex justify-content-end gap-2 w-100">
            <Button variant="secondary" onClick={() => setIsOpenModal(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleOpenDrawer}>Open Drawer</Button>
          </div>
        }
      >
        <form onSubmit={handleOpenDrawer} className="d-flex flex-column gap-3">
          <Input
            label="Opening Float *"
            type="number"
            min="0"
            step="any"
            value={openingFloat}
            onChange={(e) => setOpeningFloat(e.target.value)}
            autoFocus
            required
          />
          <Input
            label="Notes (optional)"
            placeholder="e.g. Morning shift, counter C01"
            value={openNotes}
            onChange={(e) => setOpenNotes(e.target.value)}
          />
        </form>
      </Modal>

      {/* Cash Movement */}
      <Modal
        isOpen={isMovementModal}
        onClose={() => setIsMovementModal(false)}
        title="Record Cash Movement"
        maxWidth="480px"
        footer={
          <div className="d-flex justify-content-end gap-2 w-100">
            <Button variant="secondary" onClick={() => setIsMovementModal(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleMovement}>Record Movement</Button>
          </div>
        }
      >
        <form onSubmit={handleMovement} className="d-flex flex-column gap-3">
          <div className="btn-group w-100">
            <button
              type="button"
              className={`btn ${movementDirection === 'IN' ? 'btn-success' : 'btn-outline-secondary'}`}
              onClick={() => { setMovementDirection('IN'); setMovementType('CASH_DEPOSIT'); }}
            >
              Cash IN
            </button>
            <button
              type="button"
              className={`btn ${movementDirection === 'OUT' ? 'btn-danger' : 'btn-outline-secondary'}`}
              onClick={() => { setMovementDirection('OUT'); setMovementType('PETTY_CASH'); }}
            >
              Cash OUT
            </button>
          </div>
          <div>
            <label className="form-label small fw-semibold mb-1">Category</label>
            <select
              className="form-select"
              value={movementType}
              onChange={(e) => setMovementType(e.target.value)}
            >
              {(movementDirection === 'IN' ? INFLOW_TYPES : OUTFLOW_TYPES).map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>
          <Input
            label="Amount *"
            type="number"
            min="1"
            step="any"
            value={movementAmount}
            onChange={(e) => setMovementAmount(e.target.value)}
            autoFocus
            required
          />
          <Input
            label="Reason / Note"
            placeholder="e.g. Electricity bill, courier charges"
            value={movementNotes}
            onChange={(e) => setMovementNotes(e.target.value)}
          />
        </form>
      </Modal>

      {/* Close & Reconcile */}
      <Modal
        isOpen={isCloseModal}
        onClose={() => setIsCloseModal(false)}
        title="Close & Reconcile Drawer"
        maxWidth="520px"
        footer={
          <div className="d-flex justify-content-end gap-2 w-100">
            <Button variant="secondary" onClick={() => setIsCloseModal(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleCloseDrawer}>Close Drawer</Button>
          </div>
        }
      >
        <form onSubmit={handleCloseDrawer} className="d-flex flex-column gap-3">
          <div className="alert alert-primary py-2 mb-0">
            Expected cash: <strong>{formatCurrency(expected)}</strong>
          </div>
          <div className="table-responsive border rounded">
            <table className="table table-sm mb-0 align-middle">
              <thead className="table-light">
                <tr><th>Denomination</th><th className="text-end">Count</th><th className="text-end">Value</th></tr>
              </thead>
              <tbody>
                {DENOMINATIONS.map((denomination) => (
                  <tr key={denomination}>
                    <td>{formatCurrency(denomination)}</td>
                    <td className="text-end">
                      <input
                        type="number"
                        min="0"
                        className="form-control form-control-sm text-end"
                        style={{ width: '80px', marginLeft: 'auto' }}
                        value={counts[denomination]}
                        onChange={(e) => setCounts((prev) => ({ ...prev, [denomination]: e.target.value }))}
                      />
                    </td>
                    <td className="text-end fw-semibold">
                      {formatCurrency((Number(counts[denomination]) || 0) * denomination)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="d-flex justify-content-between align-items-center border-top pt-2">
            <span className="fw-bold">Counted Total</span>
            <span className="fs-5 fw-bold" style={{ color: 'var(--brand-teal)' }}>{formatCurrency(countedTotal)}</span>
          </div>
          <div className={`d-flex justify-content-between alert py-2 mb-0 ${Math.abs(variance) < 0.01 ? 'alert-success' : 'alert-warning'}`}>
            <span className="fw-bold">Variance</span>
            <span className="fw-bold">{formatCurrency(variance)}</span>
          </div>
          <Input
            label="Closing Notes (optional)"
            placeholder="e.g. Short by Rs. 50 — courier payment unrecorded"
            value={closeNotes}
            onChange={(e) => setCloseNotes(e.target.value)}
          />
        </form>
      </Modal>
    </div>
  );
}
