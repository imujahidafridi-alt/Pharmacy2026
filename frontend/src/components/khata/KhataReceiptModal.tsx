import React, { useState, useEffect, useRef } from 'react';
import { Modal } from '../ui/Modal';
import { useApp } from '../../context/AppContext';
import { Customer, CustomerLedgerEntry } from '../../types';
import { generateCode39Svg } from '../../utils/barcode';

export interface KhataReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'PAYMENT' | 'STATEMENT';
  customer: Customer | null;
  paymentDetails?: {
    receiptNumber: string;
    amountPaid: number;
    previousBalance: number;
    newBalance: number;
    paymentMode: string;
    notes?: string;
    date: string;
    whatsappPhone?: string;
  };
  ledgerEntries?: CustomerLedgerEntry[];
}

export function KhataReceiptModal({
  isOpen,
  onClose,
  type,
  customer,
  paymentDetails,
  ledgerEntries = [],
}: KhataReceiptModalProps) {
  const { settings, formatCurrency } = useApp();

  const [paperSize, setPaperSize] = useState<'80mm' | '58mm'>(() => {
    const saved = localStorage.getItem('pharmacy_receipt_papersize');
    return saved === '58mm' ? '58mm' : '80mm';
  });

  const [targetPhone, setTargetPhone] = useState<string>('');
  const receiptRef = useRef<HTMLDivElement>(null);

  // Sync phone from customer or paymentDetails
  useEffect(() => {
    if (paymentDetails?.whatsappPhone) {
      setTargetPhone(paymentDetails.whatsappPhone);
    } else if (customer?.phone) {
      setTargetPhone(customer.phone);
    }
  }, [customer, paymentDetails]);

  // Keyboard navigation inside receipt modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey && (e.key === 'p' || e.key === 'P')) || e.key === 'Enter') {
        e.preventDefault();
        window.print();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!customer) return null;

  const handlePrint = () => {
    window.print();
  };

  const receiptNo = paymentDetails?.receiptNumber || `WAS-${Date.now().toString().slice(-6)}`;
  const barcodeSvg = generateCode39Svg(receiptNo, { height: 20, narrowWidth: 1.1, wideWidth: 2.3, displayValue: false });

  // Ledger stats if statement
  const totalDebits = ledgerEntries.reduce((sum, e) => sum + (Number(e.debit) || 0), 0);
  const totalCredits = ledgerEntries.reduce((sum, e) => sum + (Number(e.credit) || 0), 0);

  // WhatsApp Sender
  const handleSendWhatsApp = () => {
    const cleanPhone = (targetPhone || customer.phone || '').replace(/[^0-9]/g, '');
    if (!cleanPhone) {
      alert('Please enter a valid mobile number for WhatsApp');
      return;
    }

    const pharmacy = settings.pharmacy_name || 'AL-SHIFA PHARMACY';
    let msg = '';

    if (type === 'PAYMENT' && paymentDetails) {
      msg =
        `*${pharmacy} — PAYMENT RECEIPT*\n` +
        `Receipt #: ${receiptNo}\n` +
        `Date: ${paymentDetails.date}\n\n` +
        `Customer: *${customer.name}*\n` +
        `Account #: C-${String(customer.id).padStart(3, '0')}\n` +
        `------------------------------------\n` +
        `Previous Balance: ${formatCurrency(paymentDetails.previousBalance)}\n` +
        `*Amount Received: ${formatCurrency(paymentDetails.amountPaid)}*\n` +
        `Payment Method: ${paymentDetails.paymentMode}\n` +
        `------------------------------------\n` +
        `*Remaining Balance Due: ${formatCurrency(paymentDetails.newBalance)}*\n\n` +
        `Thank you for your payment!\n` +
        (settings.phone ? `Helpline: ${settings.phone}\n` : '');
    } else {
      msg =
        `*${pharmacy} — ACCOUNT STATEMENT*\n` +
        `Date: ${new Date().toLocaleDateString()}\n\n` +
        `Customer: *${customer.name}*\n` +
        `Account #: C-${String(customer.id).padStart(3, '0')}\n` +
        `------------------------------------\n` +
        `*Current Balance Due: ${formatCurrency(customer.current_balance || 0)}*\n` +
        `------------------------------------\n` +
        `Please clear your outstanding balance at your convenience.\n\n` +
        `Thank you!\n` +
        (settings.phone ? `Helpline: ${settings.phone}` : '');
    }

    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="d-flex align-items-center gap-2">
          <span>{type === 'PAYMENT' ? '🧾 Payment Receipt' : '📜 Account Statement'}</span>
          <span className="badge bg-secondary-subtle text-secondary" style={{ fontSize: '11px' }}>
            {type === 'PAYMENT' ? receiptNo : `ACC #C-${String(customer.id).padStart(3, '0')}`}
          </span>
        </div>
      }
      maxWidth="540px"
      footer={
        <div className="d-flex align-items-center justify-content-between w-100 flex-wrap gap-2">
          {/* Left: WhatsApp Quick Send Bar */}
          <div className="d-flex align-items-center gap-1">
            <div className="input-group input-group-sm" style={{ width: '170px' }}>
              <span className="input-group-text bg-transparent text-success" style={{ borderColor: 'var(--border-color)', padding: '2px 6px' }}>
                <i className="bi bi-whatsapp"></i>
              </span>
              <input
                type="text"
                className="form-control form-control-sm px-2"
                style={{
                  backgroundColor: 'var(--surface-subtle)',
                  color: 'var(--text-primary)',
                  borderColor: 'var(--border-color)',
                  fontSize: '11px',
                }}
                placeholder="0300 1234567"
                value={targetPhone}
                onChange={(e) => setTargetPhone(e.target.value)}
                title="Customer WhatsApp Mobile Number"
              />
            </div>
            <button
              type="button"
              className="btn btn-sm btn-success d-flex align-items-center gap-1 fw-semibold px-2"
              onClick={handleSendWhatsApp}
              style={{ height: '31px', fontSize: '11px' }}
              title="Send receipt to customer on WhatsApp"
            >
              <i className="bi bi-whatsapp"></i>
              <span>Send WhatsApp</span>
            </button>
          </div>

          {/* Right: Close & Print */}
          <div className="d-flex align-items-center gap-2 ms-auto">
            <button
              type="button"
              className="btn btn-sm secondaryBtn px-3"
              onClick={onClose}
              style={{ height: '31px' }}
            >
              Close (Esc)
            </button>
            <button
              type="button"
              className="btn btn-sm text-white fw-bold d-flex align-items-center gap-2 px-3"
              onClick={handlePrint}
              style={{
                backgroundColor: '#0F766E',
                borderColor: '#0D5F59',
                height: '31px',
                fontSize: '12px',
              }}
            >
              <i className="bi bi-printer-fill"></i>
              <span>Print Receipt (Enter)</span>
            </button>
          </div>
        </div>
      }
    >
      {/* Paper Size Selector */}
      <div
        className="d-flex align-items-center justify-content-between p-2 mb-3 rounded"
        style={{
          backgroundColor: 'var(--surface-subtle)',
          border: '1px solid var(--border-color)',
          fontSize: '11px',
        }}
      >
        <div className="d-flex align-items-center gap-2">
          <span className="fw-semibold text-secondary">Width:</span>
          <div className="btn-group btn-group-sm" role="group">
            <button
              type="button"
              className={`btn btn-sm py-0 px-2 fw-semibold ${
                paperSize === '80mm' ? 'btn-teal text-white' : 'btn-outline-secondary'
              }`}
              style={paperSize === '80mm' ? { backgroundColor: '#0F766E', borderColor: '#0F766E' } : {}}
              onClick={() => setPaperSize('80mm')}
            >
              80mm
            </button>
            <button
              type="button"
              className={`btn btn-sm py-0 px-2 fw-semibold ${
                paperSize === '58mm' ? 'btn-teal text-white' : 'btn-outline-secondary'
              }`}
              style={paperSize === '58mm' ? { backgroundColor: '#0F766E', borderColor: '#0F766E' } : {}}
              onClick={() => setPaperSize('58mm')}
            >
              58mm
            </button>
          </div>
        </div>
        <span className="text-secondary small">Thermal ESC/POS Preview</span>
      </div>

      {/* Realistic Receipt Scroll Viewer */}
      <div
        className="d-flex justify-content-center p-3 rounded"
        style={{
          backgroundColor: '#2b303b',
          maxHeight: '430px',
          overflowY: 'auto',
          border: '1px solid var(--border-color)',
        }}
      >
        {/* Printable Receipt Engine - 100% Monochrome & Clean */}
        <div
          ref={receiptRef}
          className={`printable-receipt-wrapper thermal-receipt-preview paper-${paperSize}`}
        >
          {/* 1. Header */}
          <div style={{ textAlign: 'center', marginBottom: '6px' }}>
            <div style={{ fontSize: paperSize === '80mm' ? '14px' : '12.5px', fontWeight: 800, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
              {settings.pharmacy_name || 'AL-SHIFA PHARMACY'}
            </div>
            <div style={{ fontSize: '9px', color: '#444444', marginTop: '1px' }}>
              {[settings.address || 'Main Boulevard, Gulberg III, Lahore', settings.phone ? `Ph: ${settings.phone}` : '']
                .filter(Boolean)
                .join(' • ')}
            </div>
            <div style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.8px', marginTop: '3px', textTransform: 'uppercase' }}>
              {type === 'PAYMENT' ? 'PAYMENT RECEIPT (WASOOLI)' : 'CUSTOMER ACCOUNT STATEMENT'}
            </div>
          </div>

          {/* 2. Customer & Receipt Meta (Separated by spacing, NO extra line) */}
          <div style={{ fontSize: '9.5px', lineHeight: 1.4, marginBottom: '6px' }}>
            {type === 'PAYMENT' && paymentDetails ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span><strong>Receipt #:</strong> {receiptNo}</span>
                  <span>{paymentDetails.date}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span><strong>Customer:</strong> {customer.name}</span>
                  <span><strong>Acc #:</strong> C-{String(customer.id).padStart(3, '0')}</span>
                </div>
                {customer.phone && (
                  <div style={{ fontSize: '9px', color: '#444444' }}>
                    <strong>Phone:</strong> {customer.phone}
                  </div>
                )}
              </>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span><strong>Customer:</strong> {customer.name}</span>
                  <span><strong>Acc #:</strong> C-{String(customer.id).padStart(3, '0')}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span><strong>Phone:</strong> {customer.phone || '-'}</span>
                  <span><strong>Date:</strong> {new Date().toLocaleDateString()}</span>
                </div>
              </>
            )}
          </div>

          {/* 3. Body: Payment vs Statement */}
          {type === 'PAYMENT' && paymentDetails ? (
            <div style={{ fontSize: '10px', lineHeight: 1.45 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Previous Balance Due:</span>
                <span>{formatCurrency(paymentDetails.previousBalance)}</span>
              </div>

              {/* Clean Highlighted Amount Received */}
              <div
                style={{
                  borderTop: '1px solid #000000',
                  borderBottom: '1px solid #000000',
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '3px 0',
                  margin: '4px 0',
                  fontWeight: 800,
                  fontSize: paperSize === '80mm' ? '12.5px' : '11.5px',
                }}
              >
                <span>AMOUNT RECEIVED:</span>
                <span>{formatCurrency(paymentDetails.amountPaid)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px' }}>
                <span>Method: <strong>{paymentDetails.paymentMode}</strong></span>
                {paymentDetails.notes && <span>Ref: {paymentDetails.notes}</span>}
              </div>

              {/* Remaining Balance */}
              <div
                style={{
                  borderTop: '1px solid #000000',
                  borderBottom: '1px solid #000000',
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '3px 0',
                  marginTop: '5px',
                  fontWeight: 800,
                  fontSize: paperSize === '80mm' ? '12px' : '11px',
                }}
              >
                <span>REMAINING BALANCE DUE:</span>
                <span>{formatCurrency(paymentDetails.newBalance)}</span>
              </div>
            </div>
          ) : (
            /* Statement Transactions Table */
            <div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #111111', textAlign: 'left' }}>
                    <th style={{ padding: '2px 0 4px 0', width: '28%', fontWeight: 700 }}>DATE</th>
                    <th style={{ width: '22%', fontWeight: 700, paddingBottom: '4px' }}>TYPE</th>
                    <th style={{ textAlign: 'right', width: '25%', fontWeight: 700, paddingBottom: '4px' }}>DEBIT (+)</th>
                    <th style={{ textAlign: 'right', width: '25%', fontWeight: 700, paddingBottom: '4px' }}>CREDIT (-)</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerEntries.map((entry, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: '2px 0' }}>
                        {entry.date ? entry.date.split(' ')[0] : '-'}
                      </td>
                      <td style={{ fontWeight: 600 }}>{entry.transaction_type}</td>
                      <td style={{ textAlign: 'right' }}>
                        {entry.debit > 0 ? Number(entry.debit).toFixed(2) : '-'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {entry.credit > 0 ? Number(entry.credit).toFixed(2) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ fontSize: '9.5px', lineHeight: 1.4, marginTop: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Total Purchases / Debits:</span>
                  <span>{formatCurrency(totalDebits)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Total Payments / Credits:</span>
                  <span>{formatCurrency(totalCredits)}</span>
                </div>
                <div
                  style={{
                    borderTop: '1px solid #000000',
                    borderBottom: '1px solid #000000',
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '4px 0',
                    margin: '5px 0',
                    fontWeight: 800,
                    fontSize: '12px',
                  }}
                >
                  <span>CURRENT BALANCE DUE:</span>
                  <span>{formatCurrency(customer.current_balance || 0)}</span>
                </div>
              </div>
            </div>
          )}

          {/* 4. Barcode (No extra HR line) */}
          {type === 'PAYMENT' && (
            <div style={{ textAlign: 'center', margin: '8px 0 2px 0' }}>
              <div
                dangerouslySetInnerHTML={{ __html: barcodeSvg }}
                style={{ display: 'flex', justifyContent: 'center' }}
              />
              <div style={{ fontSize: '8px', fontWeight: 600, letterSpacing: '0.5px', marginTop: '1px' }}>
                {receiptNo}
              </div>
            </div>
          )}

          {/* 5. Footer */}
          <div
            style={{
              textAlign: 'center',
              fontSize: '8px',
              lineHeight: 1.3,
              marginTop: '4px',
              color: '#444444',
            }}
          >
            <div>
              {type === 'PAYMENT'
                ? 'Thank you for your payment!'
                : 'Please clear outstanding balance at your convenience.'}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default KhataReceiptModal;