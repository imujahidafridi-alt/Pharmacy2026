import React, { useState, useEffect, FormEvent } from 'react';
import { api } from '../../services/api';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import { useApp } from '../../context/AppContext';
import { useToast } from '../../context/ToastContext';

export function DaybookReconciliation() {
  const { formatCurrency, refreshStats } = useApp();
  const toast = useToast();

  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [daybookData, setDaybookData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Expense / Cash Entry Modal
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [entryType, setEntryType] = useState('EXPENSE');
  const [amount, setAmount] = useState<number | string>('');
  const [direction, setDirection] = useState<'IN' | 'OUT'>('OUT');
  const [notes, setNotes] = useState('');

  const loadDaybook = async () => {
    setLoading(true);
    try {
      const data = await api.getDaybook(date);
      setDaybookData(data);
    } catch (err: any) {
      toast.error('Failed to load daybook: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDaybook();
  }, [date]);

  const handleAddEntry = async (e: FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    try {
      await api.addDaybookEntry(entryType, amount, direction, notes);
      toast.success('Daybook cash transaction recorded!');
      setIsEntryModalOpen(false);
      setAmount('');
      setNotes('');
      refreshStats();
      loadDaybook();
    } catch (err: any) {
      toast.error(err.message || 'Failed to record entry');
    }
  };

  return (
    <div className="d-flex flex-column gap-3">
      {/* Top Header */}
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div>
          <h2 className="fs-4 fw-bold mb-0">Cash Drawer & Daybook Reconciliation</h2>
          <p className="small text-secondary mb-0">
            Daily cash in hand tally, opening float, counter collections, expenses, and drawer reconciliation.
          </p>
        </div>

        <div className="d-flex gap-2 align-items-center">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            containerClassName="mb-0"
          />

          <Button
            variant="primary"
            onClick={() => setIsEntryModalOpen(true)}
            className="d-inline-flex align-items-center"
          >
            <i className="bi bi-plus-circle me-1"></i> Add Cash Entry / Expense
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="row g-3">
        <div className="col-12 col-md-4">
          <div className="card shadow-sm border border-start border-success border-4 h-100">
            <div className="card-body p-3">
              <div className="d-flex justify-content-between align-items-center mb-1">
                <span className="small fw-bold text-success text-uppercase">Cash Inflows</span>
                <i className="bi bi-arrow-down-circle-fill text-success fs-5"></i>
              </div>
              <div className="fs-3 fw-bold text-success">
                {formatCurrency(daybookData?.total_in || 0)}
              </div>
              <div className="small text-secondary">Sales cash + Khata collections</div>
            </div>
          </div>
        </div>

        <div className="col-12 col-md-4">
          <div className="card shadow-sm border border-start border-danger border-4 h-100">
            <div className="card-body p-3">
              <div className="d-flex justify-content-between align-items-center mb-1">
                <span className="small fw-bold text-danger text-uppercase">Cash Outflows</span>
                <i className="bi bi-arrow-up-circle-fill text-danger fs-5"></i>
              </div>
              <div className="fs-3 fw-bold text-danger">
                {formatCurrency(daybookData?.total_out || 0)}
              </div>
              <div className="small text-secondary">Expenses + Supplier cash payouts</div>
            </div>
          </div>
        </div>

        <div className="col-12 col-md-4">
          <div className="card shadow-sm border border-start border-primary border-4 bg-primary-subtle h-100">
            <div className="card-body p-3">
              <div className="d-flex justify-content-between align-items-center mb-1">
                <span className="small fw-bold text-primary text-uppercase">Drawer Closing Balance</span>
                <i className="bi bi-cash-stack text-primary fs-5"></i>
              </div>
              <div className="fs-3 fw-bold text-primary">
                {formatCurrency(daybookData?.net_cash || 0)}
              </div>
              <div className="small text-secondary">Expected physical cash in drawer</div>
            </div>
          </div>
        </div>
      </div>

      {/* Transactions List */}
      <div className="table-responsive border rounded shadow-sm bg-body">
        <table className="table table-hover align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th>Timestamp</th>
              <th>Transaction Type</th>
              <th>Direction</th>
              <th>Details / Note</th>
              <th className="text-end">Amount</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="text-center py-5 text-secondary">
                  Loading daybook entries...
                </td>
              </tr>
            ) : !daybookData?.entries || daybookData.entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-5 text-secondary">
                  No cash transactions recorded for {date}.
                </td>
              </tr>
            ) : (
              daybookData.entries.map((e: any) => {
                const isIn = e.direction === 'IN';

                return (
                  <tr key={e.id}>
                    <td className="small text-secondary">{e.date}</td>
                    <td>
                      <Badge variant={isIn ? 'paid' : 'expired'}>
                        {e.entry_type}
                      </Badge>
                    </td>
                    <td>
                      <span className={`fw-bold small d-inline-flex align-items-center ${isIn ? 'text-success' : 'text-danger'}`}>
                        {isIn ? (
                          <>
                            <i className="bi bi-arrow-down-left-circle me-1"></i> Cash IN
                          </>
                        ) : (
                          <>
                            <i className="bi bi-arrow-up-right-circle me-1"></i> Cash OUT
                          </>
                        )}
                      </span>
                    </td>
                    <td>{e.notes || '—'}</td>
                    <td className={`text-end fw-bold fs-6 ${isIn ? 'text-success' : 'text-danger'}`}>
                      {isIn ? `+${formatCurrency(e.amount)}` : `-${formatCurrency(e.amount)}`}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add Cash Entry Modal */}
      <Modal
        isOpen={isEntryModalOpen}
        onClose={() => setIsEntryModalOpen(false)}
        title="Add Cash Drawer Entry"
        maxWidth="480px"
        footer={
          <div className="d-flex justify-content-end gap-2 w-100">
            <Button variant="secondary" onClick={() => setIsEntryModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleAddEntry}>
              Save Entry
            </Button>
          </div>
        }
      >
        <form onSubmit={handleAddEntry} className="d-flex flex-column gap-3">
          <div>
            <label className="form-label small fw-semibold mb-1">Cash Flow Direction</label>
            <div className="btn-group w-100" role="group">
              <button
                type="button"
                className={`btn d-inline-flex align-items-center justify-content-center ${
                  direction === 'IN' ? 'btn-success' : 'btn-outline-secondary'
                }`}
                onClick={() => {
                  setDirection('IN');
                  setEntryType('OPENING_FLOAT');
                }}
              >
                <i className="bi bi-arrow-down-left-circle me-1"></i> Cash IN (Deposit)
              </button>
              <button
                type="button"
                className={`btn d-inline-flex align-items-center justify-content-center ${
                  direction === 'OUT' ? 'btn-danger' : 'btn-outline-secondary'
                }`}
                onClick={() => {
                  setDirection('OUT');
                  setEntryType('EXPENSE');
                }}
              >
                <i className="bi bi-arrow-up-right-circle me-1"></i> Cash OUT (Expense)
              </button>
            </div>
          </div>

          <div className="mb-2">
            <label className="form-label small fw-semibold mb-1">Category</label>
            <select
              className="form-select"
              value={entryType}
              onChange={(e) => setEntryType(e.target.value)}
            >
              {direction === 'IN' ? (
                <>
                  <option value="OPENING_FLOAT">Opening Cash Float</option>
                  <option value="KHATA_COLLECTION">Khata Collection</option>
                  <option value="OTHER_INFLOW">Other Cash Deposit</option>
                </>
              ) : (
                <>
                  <option value="EXPENSE">Store Petty Expense</option>
                  <option value="TEA_FOOD">Staff Tea & Refreshment</option>
                  <option value="UTILITY_BILL">Utility / Maintenance</option>
                  <option value="SUPPLIER_PAYMENT">Supplier Payout</option>
                  <option value="OWNER_WITHDRAWAL">Owner Cash Withdrawal</option>
                </>
              )}
            </select>
          </div>

          <Input
            label="Amount *"
            type="number"
            min="1"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
            required
          />

          <Input
            label="Description / Reason"
            placeholder="e.g. Electricity bill paid, Packaging bags bought"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </form>
      </Modal>
    </div>
  );
}
