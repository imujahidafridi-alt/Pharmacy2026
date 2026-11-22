import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useApp } from '../../context/AppContext';
import { Invoice } from '../../types';
import { ReturnReceiptModal } from './ReturnReceiptModal';

export interface ReturnBillModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ReturnBillModal({ isOpen, onClose }: ReturnBillModalProps) {
  const toast = useToast();
  const { formatCurrency, refreshStats } = useApp();

  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
  const [foundInvoice, setFoundInvoice] = useState<Invoice | null>(null);
  const [returnReason, setReturnReason] = useState('Customer Change of Mind / Unused');
  const [refundMode, setRefundMode] = useState<'CASH' | 'KHATA'>('CASH');
  const [customerPhone, setCustomerPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Return Receipt Modal State
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [completedReturnInvoice, setCompletedReturnInvoice] = useState<Invoice | null>(null);
  const [returnSlipDetails, setReturnSlipDetails] = useState<{
    returnNumber: string;
    returnReason: string;
    refundAmount: number;
    refundMode: string;
    date: string;
    customerPhone?: string;
  } | undefined>(undefined);

  // Load recent invoices when modal opens
  useEffect(() => {
    if (isOpen) {
      setInvoiceSearch('');
      setFoundInvoice(null);
      setReturnReason('Customer Change of Mind / Unused');
      setLoading(true);

      api.getInvoices(20, 0)
        .then((data) => {
          setRecentInvoices(data || []);
        })
        .catch((err) => {
          console.error('Failed to load recent invoices:', err);
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  // When invoice is selected, setup defaults
  useEffect(() => {
    if (foundInvoice) {
      if (foundInvoice.payment_mode === 'KHATA' && foundInvoice.customer_id) {
        setRefundMode('KHATA');
      } else {
        setRefundMode('CASH');
      }
    }
  }, [foundInvoice]);

  // Lookup Invoice
  const handleSearchInvoice = (query?: string) => {
    const q = (query !== undefined ? query : invoiceSearch).trim().toLowerCase();
    if (!q) return;

    const match = recentInvoices.find(
      (inv) =>
        inv.invoice_number?.toLowerCase() === q ||
        inv.invoice_number?.toLowerCase().includes(q) ||
        String(inv.id) === q
    );

    if (match) {
      setFoundInvoice(match);
    } else {
      toast.warning(`Invoice "${q}" not found in recent bills. Please check the number.`);
    }
  };

  // Calculate Days Elapsed
  const getDaysElapsed = (dateStr?: string) => {
    if (!dateStr) return 0;
    const invDate = new Date(dateStr);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - invDate.getTime());
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };

  const daysOld = foundInvoice ? getDaysElapsed(foundInvoice.date) : 0;
  const isWithin3Days = daysOld <= 3;

  // Process Return & Restock
  const handleExecuteReturn = async () => {
    if (!foundInvoice || !foundInvoice.id) return;

    if (foundInvoice.status === 'RETURNED') {
      toast.warning('This invoice has already been returned!');
      return;
    }

    setSubmitting(true);
    try {
      const returnNumber = `RET-${Date.now().toString().slice(-6)}`;
      const dateStr = new Date().toLocaleString();
      const refundAmount = Number(foundInvoice.total_amount || 0);

      await api.returnInvoice(foundInvoice.id, returnReason);
      toast.success(`Invoice #${foundInvoice.invoice_number} successfully returned & restocked!`);

      refreshStats();

      // Setup and open the Wapsi Thermal Slip
      setCompletedReturnInvoice(foundInvoice);
      setReturnSlipDetails({
        returnNumber,
        returnReason,
        refundAmount,
        refundMode,
        date: dateStr,
        customerPhone: customerPhone.trim(),
      });
      setIsReceiptModalOpen(true);

      // Reset form
      setFoundInvoice(null);
      setInvoiceSearch('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to process return');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={
          <div className="d-flex align-items-center gap-2">
            <span>🔄 Sales Return &amp; Wapsi</span>
            <span className="badge bg-secondary-subtle text-secondary" style={{ fontSize: '10.5px' }}>
              Barcode Scanner / Bill Lookup
            </span>
          </div>
        }
        maxWidth="700px"
        footer={
          <div className="d-flex justify-content-between align-items-center w-100 flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-sm secondaryBtn px-3"
              onClick={onClose}
              style={{ height: '32px' }}
            >
              Close (Esc)
            </button>

            {foundInvoice && (
              <button
                type="button"
                className="btn btn-sm text-white fw-bold px-4 d-flex align-items-center gap-2"
                onClick={handleExecuteReturn}
                disabled={submitting || foundInvoice.status === 'RETURNED'}
                style={{
                  backgroundColor: foundInvoice.status === 'RETURNED' ? 'var(--text-muted)' : '#DC2626',
                  borderColor: foundInvoice.status === 'RETURNED' ? 'var(--border-color)' : '#B91C1C',
                  height: '32px',
                  fontSize: '12px',
                }}
              >
                {submitting ? (
                  <span className="spinner-border spinner-border-sm" role="status" />
                ) : (
                  <>
                    <i className="bi bi-arrow-counterclockwise"></i>
                    <span>
                      {foundInvoice.status === 'RETURNED'
                        ? 'Already Returned'
                        : `Process Full Return & Refund (${formatCurrency(foundInvoice.total_amount)})`}
                    </span>
                  </>
                )}
              </button>
            )}
          </div>
        }
      >
        <div className="d-flex flex-column gap-3">
          {/* 1. Barcode Scan / Invoice Search Box */}
          <div className="d-flex gap-2 align-items-center">
            <div className="input-group input-group-sm flex-grow-1">
              <span className="input-group-text bg-transparent" style={{ borderColor: 'var(--border-color)' }}>
                <i className="bi bi-upc-scan text-secondary"></i>
              </span>
              <input
                type="text"
                className="form-control"
                style={{
                  backgroundColor: 'var(--surface-subtle)',
                  color: 'var(--text-primary)',
                  borderColor: 'var(--border-color)',
                  fontSize: '12.5px',
                  fontWeight: 600,
                }}
                placeholder="Scan receipt barcode or type Invoice # (e.g. INV-20261121-5085)..."
                value={invoiceSearch}
                onChange={(e) => setInvoiceSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchInvoice()}
                autoFocus
              />
              {invoiceSearch && (
                <button
                  type="button"
                  className="btn btn-sm secondaryBtn border-start-0"
                  onClick={() => {
                    setInvoiceSearch('');
                    setFoundInvoice(null);
                  }}
                >
                  ✕
                </button>
              )}
            </div>
            <button
              type="button"
              className="btn btn-sm text-white fw-bold px-3 d-flex align-items-center gap-1"
              onClick={() => handleSearchInvoice()}
              style={{
                backgroundColor: '#0F766E',
                borderColor: '#0D5F59',
                height: '31px',
                fontSize: '12px',
              }}
            >
              <i className="bi bi-search"></i>
              <span>Find Bill</span>
            </button>
          </div>

          {/* 2. Quick Click Recent Invoices Strip (if no invoice selected yet) */}
          {!foundInvoice && recentInvoices.length > 0 && (
            <div>
              <span className="text-secondary small fw-semibold d-block mb-1">
                Recent Sales (Click to select for return):
              </span>
              <div className="d-flex flex-wrap gap-1" style={{ maxHeight: '78px', overflowY: 'auto' }}>
                {recentInvoices.slice(0, 8).map((inv) => (
                  <button
                    key={inv.id}
                    type="button"
                    className="btn btn-sm secondaryBtn py-0 px-2 d-flex align-items-center gap-1"
                    style={{ fontSize: '11px', height: '25px' }}
                    onClick={() => {
                      setInvoiceSearch(inv.invoice_number);
                      setFoundInvoice(inv);
                    }}
                  >
                    <span className="fw-bold">{inv.invoice_number}</span>
                    <span className="text-secondary">({formatCurrency(inv.total_amount)})</span>
                    {inv.status === 'RETURNED' && (
                      <span className="badge bg-danger text-white py-0 px-1" style={{ fontSize: '8.5px' }}>
                        Returned
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 3. Invoice Details & Return Options */}
          {foundInvoice && (
            <div className="d-flex flex-column gap-3">
              {/* Header Meta Card */}
              <div
                className="p-3 rounded"
                style={{
                  backgroundColor: 'var(--surface-subtle)',
                  border: '1px solid var(--border-color)',
                }}
              >
                <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
                  <div className="d-flex align-items-center gap-2">
                    <span className="fw-bold fs-6" style={{ color: 'var(--text-primary)' }}>
                      Invoice #{foundInvoice.invoice_number}
                    </span>
                    {foundInvoice.status === 'RETURNED' ? (
                      <span className="badge bg-danger text-white" style={{ fontSize: '11px' }}>
                        ALREADY RETURNED
                      </span>
                    ) : isWithin3Days ? (
                      <span className="badge bg-success-subtle text-success" style={{ fontSize: '11px' }}>
                        ✓ Within 3-Day Return Policy
                      </span>
                    ) : (
                      <span className="badge bg-warning-subtle text-warning" style={{ fontSize: '11px' }}>
                        ⚠️ Bill is {daysOld} days old
                      </span>
                    )}
                  </div>
                  <span className="text-secondary small">{foundInvoice.date}</span>
                </div>

                <div className="row g-2" style={{ fontSize: '11.5px' }}>
                  <div className="col-6 col-sm-3">
                    <span className="text-secondary d-block">Customer:</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{foundInvoice.customer_name}</strong>
                  </div>
                  <div className="col-6 col-sm-3">
                    <span className="text-secondary d-block">Payment Mode:</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{foundInvoice.payment_mode}</strong>
                  </div>
                  <div className="col-6 col-sm-3">
                    <span className="text-secondary d-block">Total Bill:</span>
                    <strong className="text-danger">{formatCurrency(foundInvoice.total_amount)}</strong>
                  </div>
                  <div className="col-6 col-sm-3">
                    <span className="text-secondary d-block">Paid Amount:</span>
                    <strong className="text-success">{formatCurrency(foundInvoice.paid_amount)}</strong>
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div>
                <span className="text-secondary small fw-semibold d-block mb-1">
                  Invoice Items (Restocked upon return):
                </span>
                <div
                  className="table-responsive rounded overflow-hidden"
                  style={{
                    backgroundColor: 'var(--surface-bg)',
                    border: '1px solid var(--border-color)',
                    maxHeight: '180px',
                  }}
                >
                  <table className="table table-hover align-middle mb-0" style={{ fontSize: '11.5px' }}>
                    <thead style={{ backgroundColor: 'var(--surface-subtle)' }}>
                      <tr>
                        <th style={{ padding: '6px 10px' }}>MEDICINE</th>
                        <th style={{ padding: '6px 10px' }}>BATCH</th>
                        <th style={{ padding: '6px 10px' }}>EXPIRY</th>
                        <th style={{ padding: '6px 10px', textAlign: 'center' }}>QTY</th>
                        <th style={{ padding: '6px 10px', textAlign: 'right' }}>RATE</th>
                        <th style={{ padding: '6px 10px', textAlign: 'right' }}>TOTAL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(foundInvoice.items || []).map((it, idx) => (
                        <tr
                          key={idx}
                          style={{
                            borderBottom: '1px solid var(--border-color)',
                            backgroundColor: idx % 2 === 0 ? 'var(--ghost-row-even)' : 'var(--ghost-row-odd)',
                          }}
                        >
                          <td style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {it.medicine_name}
                            <span className="text-secondary ms-1 small">({it.unit_type})</span>
                          </td>
                          <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>
                            {it.batch_number || '—'}
                          </td>
                          <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>
                            {it.expiry_date || '—'}
                          </td>
                          <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 700 }}>
                            {it.quantity}
                          </td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                            {Number(it.unit_price).toFixed(2)}
                          </td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {formatCurrency(it.total_price)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Refund Method & Return Reason Form */}
              <div className="row g-2">
                {/* Refund Method */}
                <div className="col-12 col-md-6">
                  <label className="form-label small fw-semibold text-secondary mb-1">
                    Refund Settlement Method
                  </label>
                  <select
                    className="form-select form-select-sm"
                    style={{
                      backgroundColor: 'var(--surface-subtle)',
                      color: 'var(--text-primary)',
                      borderColor: 'var(--border-color)',
                    }}
                    value={refundMode}
                    onChange={(e) => setRefundMode(e.target.value as 'CASH' | 'KHATA')}
                  >
                    <option value="CASH">Cash Refund (Drawer Cash Out)</option>
                    {foundInvoice.customer_id && (
                      <option value="KHATA">Credit Customer Khata (Balance Reversal)</option>
                    )}
                  </select>
                </div>

                {/* Return Reason */}
                <div className="col-12 col-md-6">
                  <label className="form-label small fw-semibold text-secondary mb-1">
                    Reason for Return
                  </label>
                  <select
                    className="form-select form-select-sm"
                    style={{
                      backgroundColor: 'var(--surface-subtle)',
                      color: 'var(--text-primary)',
                      borderColor: 'var(--border-color)',
                    }}
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                  >
                    <option value="Customer Change of Mind / Unused">Customer Change of Mind / Unused</option>
                    <option value="Doctor Changed Prescription">Doctor Changed Prescription</option>
                    <option value="Wrong Medicine Dispensed">Wrong Medicine Dispensed</option>
                    <option value="Damaged Packaging / Broken Seal">Damaged Packaging / Broken Seal</option>
                    <option value="Patient Recovered / Excess Stock">Patient Recovered / Excess Stock</option>
                  </select>
                </div>
              </div>

              {/* Safety Policy Alert */}
              <div
                className="p-2 rounded d-flex align-items-center gap-2"
                style={{
                  backgroundColor: 'rgba(245, 158, 11, 0.08)',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                }}
              >
                <i className="bi bi-info-circle-fill text-warning fs-6"></i>
                <span>
                  <strong>DRAP Return Policy Advisory:</strong> Ensure returned medicines are in original undamaged blister packaging. Cold-chain items (Insulin, Vaccines) cannot be restocked once taken out of the pharmacy.
                </span>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Return Receipt Thermal Slip Modal */}
      <ReturnReceiptModal
        isOpen={isReceiptModalOpen}
        onClose={() => {
          setIsReceiptModalOpen(false);
          setCompletedReturnInvoice(null);
        }}
        invoice={completedReturnInvoice}
        returnDetails={returnSlipDetails}
      />
    </>
  );
}

export default ReturnBillModal;
