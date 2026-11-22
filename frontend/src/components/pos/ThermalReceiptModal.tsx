import React, { useState, useEffect, useRef } from 'react';
import { Modal } from '../ui/Modal';
import { useApp } from '../../context/AppContext';
import { Invoice } from '../../types';
import { generateCode39Svg } from '../../utils/barcode';

export interface ThermalReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice | null;
  onNewSale?: () => void;
}

export function ThermalReceiptModal({
  isOpen,
  onClose,
  invoice,
  onNewSale,
}: ThermalReceiptModalProps) {
  const { settings, formatCurrency } = useApp();

  // Paper Size state (80mm vs 58mm) persisted in localStorage
  const [paperSize, setPaperSize] = useState<'80mm' | '58mm'>(() => {
    const saved = localStorage.getItem('pharmacy_receipt_papersize');
    return saved === '58mm' ? '58mm' : '80mm';
  });

  // Auto-print preference persisted in localStorage
  const [autoPrint, setAutoPrint] = useState<boolean>(() => {
    return localStorage.getItem('pharmacy_autoprint') === '1';
  });

  const receiptRef = useRef<HTMLDivElement>(null);

  const handlePaperSizeChange = (size: '80mm' | '58mm') => {
    setPaperSize(size);
    localStorage.setItem('pharmacy_receipt_papersize', size);
  };

  const handleAutoPrintToggle = (val: boolean) => {
    setAutoPrint(val);
    localStorage.setItem('pharmacy_autoprint', val ? '1' : '0');
  };

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
      } else if (e.key === 'n' || e.key === 'N') {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        e.preventDefault();
        if (onNewSale) onNewSale();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, onNewSale]);

  // Optional auto-print on modal open
  useEffect(() => {
    if (isOpen && autoPrint && invoice) {
      const timer = setTimeout(() => {
        window.print();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [isOpen, autoPrint, invoice]);

  if (!invoice) return null;

  const handlePrint = () => {
    window.print();
  };

  const invNumber = invoice.invoice_number || `INV-${String(invoice.id || '0001').padStart(4, '0')}`;
  const barcodeSvg = generateCode39Svg(invNumber, { height: 20, narrowWidth: 1.1, wideWidth: 2.3, displayValue: false });

  // Calculate items stats
  const totalItemsCount = (invoice.items || []).length;
  const totalUnitsCount = (invoice.items || []).reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);
  const totalSaved = Number(invoice.discount_amount || 0);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="d-flex align-items-center gap-2">
          <span>🧾 Sale Invoice</span>
          <span className="badge bg-secondary-subtle text-secondary" style={{ fontSize: '11px' }}>
            {invNumber}
          </span>
        </div>
      }
      maxWidth="540px"
      footer={
        <div className="d-flex align-items-center justify-content-between w-100 flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-sm secondaryBtn d-flex align-items-center gap-1 px-3"
            onClick={() => {
              onClose();
              if (onNewSale) onNewSale();
            }}
            title="Start new bill (Shortcut: N)"
            style={{ height: '32px' }}
          >
            <span>+</span>
            <span>New Sale (N)</span>
          </button>

          <div className="d-flex align-items-center gap-2 ms-auto">
            <button
              type="button"
              className="btn btn-sm secondaryBtn px-3"
              onClick={onClose}
              style={{ height: '32px' }}
            >
              Close (Esc)
            </button>
            <button
              type="button"
              className="btn btn-sm text-white fw-bold d-flex align-items-center gap-2 px-4"
              onClick={handlePrint}
              style={{
                backgroundColor: '#0F766E',
                borderColor: '#0D5F59',
                height: '32px',
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
      {/* Receipt Settings & Size Toolbar */}
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
              onClick={() => handlePaperSizeChange('80mm')}
            >
              80mm
            </button>
            <button
              type="button"
              className={`btn btn-sm py-0 px-2 fw-semibold ${
                paperSize === '58mm' ? 'btn-teal text-white' : 'btn-outline-secondary'
              }`}
              style={paperSize === '58mm' ? { backgroundColor: '#0F766E', borderColor: '#0F766E' } : {}}
              onClick={() => handlePaperSizeChange('58mm')}
            >
              58mm
            </button>
          </div>
        </div>

        <label className="d-flex align-items-center gap-1 cursor-pointer mb-0 text-secondary fw-semibold">
          <input
            type="checkbox"
            className="form-check-input mt-0"
            checked={autoPrint}
            onChange={(e) => handleAutoPrintToggle(e.target.checked)}
          />
          <span>Auto-Print next sale</span>
        </label>
      </div>

      {/* Realistic Receipt Scroll Viewer */}
      <div
        className="d-flex justify-content-center p-3 rounded"
        style={{
          backgroundColor: '#2b303b',
          maxHeight: '450px',
          overflowY: 'auto',
          border: '1px solid var(--border-color)',
        }}
      >
        {/* =========================================================================
           CLEAN, COMPACT, MONOCHROME THERMAL RECEIPT (No unnecessary HR lines)
           ========================================================================= */}
        <div
          ref={receiptRef}
          className={`printable-receipt-wrapper thermal-receipt-preview paper-${paperSize}`}
        >
          {/* 1. BRAND HEADER */}
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
              {invoice.payment_mode === 'KHATA' ? 'CREDIT SALE INVOICE' : 'SALE INVOICE'}
            </div>
          </div>

          {/* 2. ESSENTIAL INVOICE META */}
          <div style={{ fontSize: '9.5px', lineHeight: 1.4, marginBottom: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span><strong>Bill #:</strong> {invNumber}</span>
              <span>{invoice.date || new Date().toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span><strong>Customer:</strong> {invoice.customer_name || 'Walk-in'}</span>
              <span><strong>Mode:</strong> {invoice.payment_mode || 'CASH'}</span>
            </div>
            {invoice.doctor_name && (
              <div style={{ fontSize: '9px', color: '#444444' }}>
                <strong>Dr:</strong> {invoice.doctor_name}
              </div>
            )}
          </div>

          {/* 3. ITEMS TABLE WITH CLEAN BORDERS */}
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
                  <th
                    style={{
                      border: '1px solid #111111',
                      padding: '3px 4px',
                      textAlign: 'left',
                      fontWeight: 700,
                      width: '48%',
                    }}
                  >
                    ITEM
                  </th>
                  <th
                    style={{
                      border: '1px solid #111111',
                      padding: '3px 2px',
                      textAlign: 'center',
                      width: '13%',
                      fontWeight: 700,
                    }}
                  >
                    QTY
                  </th>
                  <th
                    style={{
                      border: '1px solid #111111',
                      padding: '3px 4px',
                      textAlign: 'right',
                      width: '19%',
                      fontWeight: 700,
                    }}
                  >
                    PRICE
                  </th>
                  <th
                    style={{
                      border: '1px solid #111111',
                      padding: '3px 4px',
                      textAlign: 'right',
                      width: '20%',
                      fontWeight: 700,
                    }}
                  >
                    TOTAL
                  </th>
                </tr>
              </thead>
              <tbody>
                {(invoice.items || []).map((it, idx) => {
                  const isWapsi = (Number(it.quantity) || 0) < 0;
                  const unitDisplay = it.unit_type === 'Strip' ? ' (Str)' : it.unit_type === 'Pack' ? ' (Box)' : '';
                  return (
                    <tr key={idx}>
                      <td
                        style={{
                          border: '1px solid #111111',
                          padding: '3px 4px',
                          verticalAlign: 'middle',
                          wordBreak: 'break-word',
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>{it.medicine_name}</span>
                        <span style={{ fontSize: '8.5px', color: '#444444' }}>{unitDisplay}</span>
                        {isWapsi && <span style={{ marginLeft: '3px', fontWeight: 700 }}>[WAPSI]</span>}
                      </td>
                      <td
                        style={{
                          border: '1px solid #111111',
                          padding: '3px 2px',
                          textAlign: 'center',
                          verticalAlign: 'middle',
                          fontWeight: 600,
                        }}
                      >
                        {it.quantity}
                      </td>
                      <td
                        style={{
                          border: '1px solid #111111',
                          padding: '3px 4px',
                          textAlign: 'right',
                          verticalAlign: 'middle',
                        }}
                      >
                        {Number(it.unit_price).toFixed(2)}
                      </td>
                      <td
                        style={{
                          border: '1px solid #111111',
                          padding: '3px 4px',
                          textAlign: 'right',
                          verticalAlign: 'middle',
                          fontWeight: 600,
                        }}
                      >
                        {Number(it.total_price).toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            /* 58mm Bordered Table */
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
                  <th
                    style={{
                      border: '1px solid #111111',
                      padding: '2px 3px',
                      textAlign: 'left',
                      fontWeight: 700,
                      width: '45%',
                    }}
                  >
                    ITEM
                  </th>
                  <th
                    style={{
                      border: '1px solid #111111',
                      padding: '2px 2px',
                      textAlign: 'center',
                      width: '14%',
                      fontWeight: 700,
                    }}
                  >
                    QTY
                  </th>
                  <th
                    style={{
                      border: '1px solid #111111',
                      padding: '2px 2px',
                      textAlign: 'right',
                      width: '20%',
                      fontWeight: 700,
                    }}
                  >
                    PRICE
                  </th>
                  <th
                    style={{
                      border: '1px solid #111111',
                      padding: '2px 3px',
                      textAlign: 'right',
                      width: '21%',
                      fontWeight: 700,
                    }}
                  >
                    TOTAL
                  </th>
                </tr>
              </thead>
              <tbody>
                {(invoice.items || []).map((it, idx) => {
                  const isWapsi = (Number(it.quantity) || 0) < 0;
                  const unitDisplay = it.unit_type === 'Strip' ? ' (Str)' : it.unit_type === 'Pack' ? ' (Box)' : '';
                  return (
                    <tr key={idx}>
                      <td
                        style={{
                          border: '1px solid #111111',
                          padding: '2px 3px',
                          verticalAlign: 'middle',
                          wordBreak: 'break-word',
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>{it.medicine_name}</span>
                        <span style={{ fontSize: '8px', color: '#444444' }}>{unitDisplay}</span>
                        {isWapsi && <span style={{ marginLeft: '2px', fontWeight: 700 }}>[WAPSI]</span>}
                      </td>
                      <td
                        style={{
                          border: '1px solid #111111',
                          padding: '2px 2px',
                          textAlign: 'center',
                          verticalAlign: 'middle',
                          fontWeight: 600,
                        }}
                      >
                        {it.quantity}
                      </td>
                      <td
                        style={{
                          border: '1px solid #111111',
                          padding: '2px 2px',
                          textAlign: 'right',
                          verticalAlign: 'middle',
                        }}
                      >
                        {Number(it.unit_price).toFixed(2)}
                      </td>
                      <td
                        style={{
                          border: '1px solid #111111',
                          padding: '2px 3px',
                          textAlign: 'right',
                          verticalAlign: 'middle',
                          fontWeight: 600,
                        }}
                      >
                        {Number(it.total_price).toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {/* 4. TOTALS & SUMMARY (Single framed box around TOTAL PAYABLE) */}
          <div style={{ fontSize: '10px', lineHeight: 1.45, marginTop: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Items: {totalItemsCount} ({totalUnitsCount} pcs)</span>
              <span>Subtotal: {formatCurrency(invoice.subtotal)}</span>
            </div>

            {totalSaved > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Discount Saved:</span>
                <span>-{formatCurrency(totalSaved)}</span>
              </div>
            )}

            {Number(invoice.tax_amount || 0) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>GST / Tax:</span>
                <span>+{formatCurrency(invoice.tax_amount)}</span>
              </div>
            )}

            {/* Framed Net Total */}
            <div
              style={{
                borderTop: '1px solid #000000',
                borderBottom: '1px solid #000000',
                display: 'flex',
                justifyContent: 'space-between',
                padding: '4px 0',
                margin: '5px 0',
                fontSize: paperSize === '80mm' ? '13px' : '11.5px',
                fontWeight: 800,
              }}
            >
              <span>TOTAL PAYABLE:</span>
              <span>{formatCurrency(invoice.total_amount)}</span>
            </div>

            {/* Payment Details */}
            {invoice.payment_mode === 'KHATA' ? (
              <div
                style={{
                  textAlign: 'center',
                  fontWeight: 700,
                  fontSize: '9.5px',
                  padding: '2px 0',
                }}
              >
                KHATA (CREDIT) SALE — POSTED TO ACCOUNT
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px' }}>
                <span>Paid: {formatCurrency(invoice.paid_amount)}</span>
                {Number(invoice.change_amount || 0) > 0 ? (
                  <span style={{ fontWeight: 700 }}>Change: {formatCurrency(invoice.change_amount)}</span>
                ) : (
                  <span>Balance: 0.00</span>
                )}
              </div>
            )}

            {totalSaved > 0 && (
              <div style={{ textAlign: 'center', fontSize: '9px', marginTop: '2px' }}>
                You saved {formatCurrency(totalSaved)} on this purchase
              </div>
            )}
          </div>

          {/* 5. LOW-PROFILE BARCODE (No extra HR line) */}
          <div style={{ textAlign: 'center', margin: '8px 0 2px 0' }}>
            <div
              dangerouslySetInnerHTML={{ __html: barcodeSvg }}
              style={{ display: 'flex', justifyContent: 'center' }}
            />
            <div style={{ fontSize: '8.5px', fontWeight: 600, letterSpacing: '0.5px', marginTop: '1px' }}>
              {invNumber}
            </div>
          </div>

          {/* 6. CONCISE FOOTER */}
          <div
            style={{
              textAlign: 'center',
              fontSize: '8.5px',
              lineHeight: 1.3,
              marginTop: '4px',
              color: '#333333',
            }}
          >
            <div>Thank you! Returns accepted with receipt within 3 days.</div>
            <div style={{ fontSize: '7.5px', color: '#666666', marginTop: '1px' }}>
              Fridge &amp; opened items are non-returnable.
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default ThermalReceiptModal;