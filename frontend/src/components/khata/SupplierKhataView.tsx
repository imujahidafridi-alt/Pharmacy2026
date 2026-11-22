import React, { useState, useEffect, FormEvent } from 'react';
import { api } from '../../services/api';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import { useApp } from '../../context/AppContext';
import { useToast } from '../../context/ToastContext';
import { Supplier } from '../../types';

export function SupplierKhataView() {
  const { formatCurrency, refreshStats } = useApp();
  const toast = useToast();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isLedgerModalOpen, setIsLedgerModalOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<any[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  // New Supplier Form State
  const [newSupp, setNewSupp] = useState({
    name: '',
    contact_person: '',
    phone: '',
    email: '',
    address: '',
    current_balance: 0,
    notes: '',
  });

  // Payment Form State
  const [payAmount, setPayAmount] = useState<number | string>('');
  const [payMode, setPayMode] = useState('CASH');
  const [payNotes, setPayNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      const data = await api.getSuppliers(search);
      setSuppliers(data || []);
    } catch (err: any) {
      toast.error('Failed to load suppliers: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, [search]);

  // Open Ledger Statement
  const handleOpenLedger = async (supp: Supplier) => {
    setSelectedSupplier(supp);
    setIsLedgerModalOpen(true);
    setLedgerLoading(true);
    try {
      const data = await api.getSupplierLedger(supp.id);
      setLedgerEntries(data || []);
    } catch (err: any) {
      toast.error('Failed to load supplier ledger: ' + err.message);
    } finally {
      setLedgerLoading(false);
    }
  };

  // Open Payment Dialog
  const handleOpenPayment = (supp: Supplier) => {
    setSelectedSupplier(supp);
    setPayAmount((supp.current_balance || 0) > 0 ? (supp.current_balance || 0) : '');
    setPayMode('CASH');
    setPayNotes('');
    setIsPaymentModalOpen(true);
  };

  // Submit Payment to Supplier
  const handleRecordPayment = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier) return;
    if (!payAmount || Number(payAmount) <= 0) {
      toast.error('Please enter a valid payment amount');
      return;
    }

    setSubmitting(true);
    try {
      await api.recordSupplierPayment(selectedSupplier.id, payAmount, payMode, payNotes);
      toast.success(`Payment of ${formatCurrency(payAmount)} to ${selectedSupplier.name} recorded!`);
      setIsPaymentModalOpen(false);
      refreshStats();
      loadSuppliers();
      if (isLedgerModalOpen) {
        handleOpenLedger(selectedSupplier);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to record supplier payment');
    } finally {
      setSubmitting(false);
    }
  };

  // Create Supplier
  const handleCreateSupplier = async (e: FormEvent) => {
    e.preventDefault();
    if (!newSupp.name.trim()) {
      toast.error('Supplier / Distributor name is required');
      return;
    }

    setSubmitting(true);
    try {
      await api.createSupplier(newSupp);
      toast.success(`Supplier "${newSupp.name}" created!`);
      setIsAddModalOpen(false);
      setNewSupp({
        name: '',
        contact_person: '',
        phone: '',
        email: '',
        address: '',
        current_balance: 0,
        notes: '',
      });
      refreshStats();
      loadSuppliers();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create supplier');
    } finally {
      setSubmitting(false);
    }
  };

  const totalPayable = suppliers.reduce((sum, s) => sum + ((s.current_balance || 0) > 0 ? (s.current_balance || 0) : 0), 0);

  return (
    <div className="d-flex flex-column gap-3">
      {/* Top Bar */}
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div>
          <h2 className="fs-4 fw-bold mb-0">Suppliers Khata (Vendor Payables Ledger)</h2>
          <p className="small text-secondary mb-0">
            Track pharmaceutical distributors, purchase invoice liabilities, and payments made.
          </p>
        </div>

        <div className="d-flex gap-3 align-items-center">
          <div className="alert alert-warning py-2 px-3 mb-0 border shadow-sm text-end">
            <div className="small fw-semibold text-uppercase text-warning-emphasis" style={{ fontSize: '0.72rem' }}>
              Total Payables
            </div>
            <div className="fs-5 fw-bold text-warning-emphasis">
              {formatCurrency(totalPayable)}
            </div>
          </div>

          <Button variant="primary" onClick={() => setIsAddModalOpen(true)} className="d-inline-flex align-items-center">
            <i className="bi bi-building-add me-1"></i> Add Supplier
          </Button>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="card shadow-sm border p-2">
        <Input
          placeholder="Search supplier by company name, contact person, or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          icon={<i className="bi bi-search"></i>}
          containerClassName="mb-0"
        />
      </div>

      {/* Suppliers Table */}
      <div className="table-responsive border rounded shadow-sm bg-body">
        <table className="table table-hover align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th>Company Name</th>
              <th>Contact Person & Phone</th>
              <th>Address / Area</th>
              <th className="text-end">Pending Balance</th>
              <th className="text-center">Status</th>
              <th className="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center py-5 text-secondary">
                  Loading supplier accounts...
                </td>
              </tr>
            ) : suppliers.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-5 text-secondary">
                  No suppliers found. Click "+ Add New Supplier" to add a distributor.
                </td>
              </tr>
            ) : (
              suppliers.map((s) => {
                const hasPayable = (s.current_balance || 0) > 0;

                return (
                  <tr key={s.id}>
                    <td>
                      <div className="fw-bold text-body">{s.name}</div>
                    </td>
                    <td>
                      <div className="small fw-semibold">{s.phone || 'No phone'}</div>
                      <div className="small text-secondary">{s.email || '—'}</div>
                    </td>
                    <td className="text-secondary small">{s.address || '—'}</td>
                    <td
                      className={`text-end fw-bold fs-6 ${
                        hasPayable ? 'text-warning-emphasis' : 'text-success'
                      }`}
                    >
                      {formatCurrency(s.current_balance || 0)}
                    </td>
                    <td className="text-center">
                      {hasPayable ? (
                        <Badge variant="warning">Payable</Badge>
                      ) : (
                        <Badge variant="healthy">Nil Balance</Badge>
                      )}
                    </td>
                    <td className="text-end">
                      <div className="d-inline-flex gap-1">
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={!hasPayable}
                          onClick={() => handleOpenPayment(s)}
                          className="d-inline-flex align-items-center"
                        >
                          <i className="bi bi-arrow-up-right-circle-fill me-1"></i> Pay Supplier
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleOpenLedger(s)}
                          className="d-inline-flex align-items-center"
                        >
                          <i className="bi bi-journal-text me-1"></i> Ledger
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add Supplier Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Register Supplier / Distributor"
        maxWidth="540px"
        footer={
          <div className="d-flex justify-content-end gap-2 w-100">
            <Button variant="secondary" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateSupplier} loading={submitting}>
              Save Supplier
            </Button>
          </div>
        }
      >
        <form onSubmit={handleCreateSupplier} className="d-flex flex-column gap-2">
          <Input
            label="Distributor / Company Name *"
            placeholder="Supplier / distributor company name..."
            value={newSupp.name}
            onChange={(e) => setNewSupp({ ...newSupp, name: e.target.value })}
            autoFocus
            required
          />
          <div className="row g-2">
            <div className="col-6">
              <Input
                label="Contact Person / Rep"
                placeholder="e.g. Kamran Ali"
                value={newSupp.contact_person}
                onChange={(e) => setNewSupp({ ...newSupp, contact_person: e.target.value })}
              />
            </div>
            <div className="col-6">
              <Input
                label="Phone Number"
                placeholder="e.g. +92 321 8899001"
                value={newSupp.phone}
                onChange={(e) => setNewSupp({ ...newSupp, phone: e.target.value })}
              />
            </div>
          </div>
          <Input
            label="Email Address"
            type="email"
            placeholder="e.g. orders@distrib.pk"
            value={newSupp.email}
            onChange={(e) => setNewSupp({ ...newSupp, email: e.target.value })}
          />
          <Input
            label="Warehouse / Office Address"
            placeholder="e.g. Industrial Area, Lahore"
            value={newSupp.address}
            onChange={(e) => setNewSupp({ ...newSupp, address: e.target.value })}
          />
          <Input
            label="Opening Payable Balance"
            type="number"
            value={newSupp.current_balance}
            onChange={(e) => setNewSupp({ ...newSupp, current_balance: Number(e.target.value) })}
          />
          <Input
            label="Credit Terms / Notes"
            placeholder="e.g. 21 days credit terms"
            value={newSupp.notes}
            onChange={(e) => setNewSupp({ ...newSupp, notes: e.target.value })}
          />
        </form>
      </Modal>

      {/* Pay Supplier Modal */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title={`Pay Supplier: ${selectedSupplier?.name}`}
        maxWidth="480px"
        footer={
          <div className="d-flex justify-content-end gap-2 w-100">
            <Button variant="secondary" onClick={() => setIsPaymentModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleRecordPayment} loading={submitting}>
              Confirm Outflow
            </Button>
          </div>
        }
      >
        <form onSubmit={handleRecordPayment} className="d-flex flex-column gap-3">
          <div className="alert alert-warning py-2 px-3 mb-0 d-flex justify-content-between align-items-center">
            <span>Current Payable Balance:</span>
            <strong className="fs-5 text-warning-emphasis">
              {formatCurrency(selectedSupplier?.current_balance || 0)}
            </strong>
          </div>

          <Input
            label="Payment Amount Paid *"
            type="number"
            min="1"
            step="any"
            value={payAmount}
            onChange={(e) => setPayAmount(e.target.value)}
            autoFocus
            required
          />

          <div className="mb-2">
            <label className="form-label small fw-semibold mb-1">Payment Mode</label>
            <select
              className="form-select"
              value={payMode}
              onChange={(e) => setPayMode(e.target.value)}
            >
              <option value="CASH">Cash Drawer Outflow</option>
              <option value="BANK">Bank Transfer / Online</option>
              <option value="CHEQUE">Cheque</option>
            </select>
          </div>

          <Input
            label="Cheque / Transaction Ref #"
            placeholder="e.g. Bank Ref #TX-99182 / Cheque #00412"
            value={payNotes}
            onChange={(e) => setPayNotes(e.target.value)}
          />
        </form>
      </Modal>

      {/* Supplier Ledger Statement Modal */}
      <Modal
        isOpen={isLedgerModalOpen}
        onClose={() => setIsLedgerModalOpen(false)}
        title={`Supplier Ledger: ${selectedSupplier?.name}`}
        maxWidth="820px"
        footer={
          <div className="d-flex justify-content-end gap-2 w-100">
            <Button variant="secondary" size="sm" onClick={() => setIsLedgerModalOpen(false)}>
              Close
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => window.print()}
              className="d-inline-flex align-items-center"
            >
              <i className="bi bi-printer me-1"></i> Print Statement
            </Button>
          </div>
        }
      >
        <div className="d-flex flex-column gap-3">
          <div className="card bg-body-tertiary p-3 border shadow-sm">
            <div className="row g-2 text-center text-sm-start">
              <div className="col-sm-4">
                <div className="small text-secondary">DISTRIBUTOR</div>
                <div className="fw-bold fs-6">{selectedSupplier?.name}</div>
                <div className="small text-secondary">{selectedSupplier?.phone}</div>
              </div>
              <div className="col-sm-4">
                <div className="small text-secondary">CONTACT REP</div>
                <div className="fw-bold">{selectedSupplier?.company || '—'}</div>
              </div>
              <div className="col-sm-4 text-sm-end">
                <div className="small text-secondary">TOTAL PAYABLE LIABILITY</div>
                <div className="fs-5 fw-bold text-warning-emphasis">
                  {formatCurrency(selectedSupplier?.current_balance || 0)}
                </div>
              </div>
            </div>
          </div>

          <div className="table-responsive border rounded shadow-sm bg-body">
            <table className="table table-hover align-middle mb-0 small">
              <thead className="table-light">
                <tr>
                  <th>Date & Time</th>
                  <th>Type</th>
                  <th>Description / Notes</th>
                  <th className="text-end text-success">Paid / Debit (-)</th>
                  <th className="text-end text-warning-emphasis">Billed / Credit (+)</th>
                  <th className="text-end">Balance</th>
                </tr>
              </thead>
              <tbody>
                {ledgerLoading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-4 text-secondary">
                      Loading ledger entries...
                    </td>
                  </tr>
                ) : ledgerEntries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-4 text-secondary">
                      No ledger transactions found for this supplier.
                    </td>
                  </tr>
                ) : (
                  ledgerEntries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="small text-secondary">{entry.date}</td>
                      <td>
                        <Badge
                          variant={
                            entry.transaction_type === 'PURCHASE'
                              ? 'warning'
                              : entry.transaction_type === 'PAYMENT'
                              ? 'paid'
                              : 'healthy'
                          }
                        >
                          {entry.transaction_type}
                        </Badge>
                      </td>
                      <td>{entry.notes || '—'}</td>
                      <td className="text-end fw-semibold text-success">
                        {entry.debit > 0 ? formatCurrency(entry.debit) : '—'}
                      </td>
                      <td className="text-end fw-semibold text-warning-emphasis">
                        {entry.credit > 0 ? formatCurrency(entry.credit) : '—'}
                      </td>
                      <td className="text-end fw-bold">
                        {formatCurrency(entry.balance)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>
    </div>
  );
}
