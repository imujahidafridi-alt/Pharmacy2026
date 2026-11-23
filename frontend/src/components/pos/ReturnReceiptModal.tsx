import React, { useState, useEffect, useRef } from 'react';
import { Modal } from '../ui/Modal';
import { useApp } from '../../context/AppContext';
import { Invoice } from '../../types';
import { generateCode39Svg } from '../../utils/barcode';

export interface ReturnReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice | null;
  returnDetails?: {
    returnNumber: string;
    returnReason: string;
    refundAmount: number;
    refundMode: string;
    date: string;
    customerPhone?: string;
  };
}

export function ReturnReceiptModal({
  isOpen,
  onClose,
  invoice,
  returnDetails,
}: ReturnReceiptModalProps) {
  const { settings, formatCurrency } = useApp();

  const [paperSize, setPaperSize] = useState<'80mm' | '58mm'>(() => {
    const saved = localStorage.getItem('pharmacy_receipt_papersize');
    return saved === '58mm' ? '58mm' : '80mm';
  });

  const [whatsappPhone, setWhatsappPhone] = useState<string>('');
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (returnDetails?.customerPhone) {
      setWhatsappPhone(returnDetails.customerPhone);
    }
  }, [returnDetails]);

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

  if (!invoice) return null;

  const handlePrint = () => {
    window.print();
  };

  const returnNo = returnDetails?.returnNumber || `RET-${Date.now().toString().slice(-6)}`;
  const barcodeSvg = generateCode39Svg(returnNo, { height: 20, narrowWidth: 1.1, wideWidth: 2.3, displayValue: false });
  const refundAmount = returnDetails?.refundAmount ?? Number(invoice.total_amount || 0);

  // Send WhatsApp Return Credit Voucher
  const handleSendWhatsApp = () => {
    const cleanPhone = whatsappPhone.replace(/[^0-9]/g, '');
    if (!cleanPhone) {
      alert('Please enter a valid mobile number for WhatsApp');
      return;
    }

    const pharmacy = settings.pharmacy_name || 'A1 PHARMACY';
    const msg =
      `*${pharmacy} — SALES RETURN VOUCHER*\n` +
      `Voucher #: ${returnNo}\n` +
      `Original Bill #: ${invoice.invoice_number}\n` +
      `Date: ${returnDetails?.date || new Date().toLocaleString()}\n\n` +
      `Customer: *${invoice.customer_name || 'Walk-in Customer'}*\n` +
      `------------------------------------\n` +
      `*Total Refund Amount: ${formatCurrency(refundAmount)}*\n` +
      `Refund Method: ${returnDetails?.refundMode || 'CASH'}\n` +
      `Reason: ${returnDetails?.returnReason || 'Customer Return'}\n` +
      `------------------------------------\n` +
      `Returned items have been restocked into inventory.\n\n` +
      `Thank you!\n` +
      (settings.phone ? `Helpline: ${settings.phone}\n` : '');

    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="d-flex align-items-center gap-2">
          <span>🧾 Sales Return Voucher</span>
          <span className="badge bg-secondary-subtle text-secondary" style={{ fontSize: '11px' }}>
            {returnNo}
          </span>
        </div>
      }
      maxWidth="540px"
      footer={
        <div className="d-flex align-items-center justify-content-between w-100 flex-wrap gap-2">
          {/* Left: WhatsApp Quick Send */}
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
                value={whatsappPhone}
                onChange={(e) => setWhatsappPhone(e.target.value)}
                title="Customer WhatsApp Mobile Number"
              />
            </div>
            <button
              type="button"
              className="btn btn-sm btn-success d-flex align-items-center gap-1 fw-semibold px-2"
              onClick={handleSendWhatsApp}
              style={{ height: '31px', fontSize: '11px' }}
              title="Send return voucher via WhatsApp"
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
              <span>Print Return Slip (Enter)</span>
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
        <span className="text-secondary small">Return Credit Memo</span>
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
          {/* 1. Brand Header */}
          <div style={{ textAlign: 'center', marginBottom: '6px' }}>
            <div style={{ fontSize: paperSize === '80mm' ? '14px' : '12.5px', fontWeight: 800, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
              {settings.pharmacy_name || 'A1 PHARMACY'}
            </div>
            <div style={{ fontSize: '9px', color: '#444444', marginTop: '1px' }}>
              {[settings.address || 'Main Boulevard, Gulberg III, Lahore', settings.phone ? `Ph: ${settings.phone}` : '']
                .filter(Boolean)
                .join(' • ')}
            </div>
            <div style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.8px', marginTop: '3px', textTransform: 'uppercase' }}>
              SALES RETURN VOUCHER (WAPSI)
            </div>
          </div>

          {/* 2. Return Meta (Separated by clean spacing, NO extra line) */}
          <div style={{ fontSize: '9.5px', lineHeight: 1.4, marginBottom: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span><strong>Voucher #:</strong> {returnNo}</span>
              <span>{returnDetails?.date || new Date().toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span><strong>Orig Bill #:</strong> {invoice.invoice_number}</span>
              <span><strong>Mode:</strong> {returnDetails?.refundMode || 'CASH'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span><strong>Customer:</strong> {invoice.customer_name || 'Walk-in'}</span>
            </div>
            {returnDetails?.returnReason && (
              <div style={{ fontSize: '9px', color: '#444444' }}>
                <strong>Reason:</strong> {returnDetails.returnReason}
              </div>
            )}
          </div>

          {/* 3. Returned Items Table With Clean Borders */}
          {paperSize === '80mm' ? (
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '9.5px',
                border: '1px solid #111111',
                margin: '4px 0 6px 0',
              }}
            >
              <thead>
                <tr style={{ backgroundColor: '#F8F9FA' }}>
                  <th style={{ border: '1px solid #111111', padding: '3px 4px', textAlign: 'left', fontWeight: 700, width: '48%' }}>RETURNED ITEM</th>
                  <th style={{ border: '1px solid #111111', padding: '3px 2px', textAlign: 'center', width: '13%', fontWeight: 700 }}>QTY</th>
                  <th style={{ border: '1px solid #111111', padding: '3px 4px', textAlign: 'right', width: '19%', fontWeight: 700 }}>RATE</th>
                  <th style={{ border: '1px solid #111111', padding: '3px 4px', textAlign: 'right', width: '20%', fontWeight: 700 }}>REFUND</th>
                </tr>
              </thead>
              <tbody>
                {(invoice.items || []).map((it, idx) => (
                  <tr key={idx}>
                    <td style={{ border: '1px solid #111111', padding: '3px 4px', verticalAlign: 'middle', fontWeight: 600, wordBreak: 'break-word' }}>
                      {it.medicine_name}
                    </td>
                    <td style={{ border: '1px solid #111111', padding: '3px 2px', textAlign: 'center', verticalAlign: 'middle', fontWeight: 600 }}>
                      {it.quantity}
                    </td>
                    <td style={{ border: '1px solid #111111', padding: '3px 4px', textAlign: 'right', verticalAlign: 'middle' }}>
                      {Number(it.unit_price).toFixed(2)}
                    </td>
                    <td style={{ border: '1px solid #111111', padding: '3px 4px', textAlign: 'right', verticalAlign: 'middle', fontWeight: 600 }}>
                      {Number(it.total_price).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '8.5px',
                border: '1px solid #111111',
                margin: '3px 0 5px 0',
              }}
            >
              <thead>
                <tr style={{ backgroundColor: '#F8F9FA' }}>
                  <th style={{ border: '1px solid #111111', padding: '2px 3px', textAlign: 'left', fontWeight: 700, width: '45%' }}>RETURNED ITEM</th>
                  <th style={{ border: '1px solid #111111', padding: '2px 2px', textAlign: 'center', width: '14%', fontWeight: 700 }}>QTY</th>
                  <th style={{ border: '1px solid #111111', padding: '2px 2px', textAlign: 'right', width: '20%', fontWeight: 700 }}>RATE</th>
                  <th style={{ border: '1px solid #111111', padding: '2px 3px', textAlign: 'right', width: '21%', fontWeight: 700 }}>REFUND</th>
                </tr>
              </thead>
              <tbody>
                {(invoice.items || []).map((it, idx) => (
                  <tr key={idx}>
                    <td style={{ border: '1px solid #111111', padding: '2px 3px', verticalAlign: 'middle', fontWeight: 600, wordBreak: 'break-word' }}>
                      {it.medicine_name}
                    </td>
                    <td style={{ border: '1px solid #111111', padding: '2px 2px', textAlign: 'center', verticalAlign: 'middle', fontWeight: 600 }}>
                      {it.quantity}
                    </td>
                    <td style={{ border: '1px solid #111111', padding: '2px 2px', textAlign: 'right', verticalAlign: 'middle' }}>
                      {Number(it.unit_price).toFixed(2)}
                    </td>
                    <td style={{ border: '1px solid #111111', padding: '2px 3px', textAlign: 'right', verticalAlign: 'middle', fontWeight: 600 }}>
                      {Number(it.total_price).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* 4. Refund Totals (Framed only around TOTAL REFUND) */}
          <div style={{ fontSize: '10px', lineHeight: 1.45, marginTop: '6px' }}>
            <div
              style={{
                borderTop: '1px solid #000000',
                borderBottom: '1px solid #000000',
                display: 'flex',
                justifyContent: 'space-between',
                padding: '4px 0',
                margin: '5px 0',
                fontWeight: 800,
                fontSize: paperSize === '80mm' ? '13px' : '11.5px',
              }}
            >
              <span>TOTAL REFUND:</span>
              <span>{formatCurrency(refundAmount)}</span>
            </div>

            <div style={{ textAlign: 'center', fontSize: '9px', color: '#333333' }}>
              {returnDetails?.refundMode === 'KHATA'
                ? 'Amount credited back to Customer Khata account.'
                : 'Cash refunded to customer.'}
            </div>
          </div>

          {/* 5. Low-Profile Barcode (No extra HR line) */}
          <div style={{ textAlign: 'center', margin: '8px 0 2px 0' }}>
            <div
              dangerouslySetInnerHTML={{ __html: barcodeSvg }}
              style={{ display: 'flex', justifyContent: 'center' }}
            />
            <div style={{ fontSize: '8px', fontWeight: 600, letterSpacing: '0.5px', marginTop: '1px' }}>
              {returnNo}
            </div>
          </div>

          {/* 6. Footer */}
          <div
            style={{
              textAlign: 'center',
              fontSize: '8px',
              lineHeight: 1.3,
              marginTop: '4px',
              color: '#444444',
            }}
          >
            <div>Returned items restocked into inventory.</div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default ReturnReceiptModal;