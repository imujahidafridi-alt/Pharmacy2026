import React, { useState, useEffect, ChangeEvent } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useApp } from '../../context/AppContext';
import { CartItem, Customer, Invoice } from '../../types';

export interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  subtotal: number;
  discountAmount: number;
  discountPercent: number;
  taxAmount: number;
  totalAmount: number;
  onPaymentSuccess: (invoice: Invoice) => void;
  initialCustomerId?: string | number;
  initialDoctorName?: string;
  initialPaidAmount?: number;
}

export function PaymentModal({
  isOpen,
  onClose,
  cart,
  subtotal,
  discountAmount,
  discountPercent,
  taxAmount,
  totalAmount,
  onPaymentSuccess,
  initialCustomerId = '',
  initialDoctorName = '',
  initialPaidAmount,
}: PaymentModalProps) {
  const { formatCurrency, refreshStats } = useApp();
  const toast = useToast();

  const [paymentMode, setPaymentMode] = useState<'CASH' | 'CARD' | 'ONLINE' | 'KHATA'>('CASH');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('Walk-in Customer');
  const [doctorName, setDoctorName] = useState<string>('');
  const [paidAmount, setPaidAmount] = useState<number | string>(totalAmount);
  const [changeAmount, setChangeAmount] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      const initPaid = initialPaidAmount !== undefined && initialPaidAmount > 0 ? initialPaidAmount : totalAmount;
      setPaidAmount(initPaid);
      setChangeAmount(Math.max(0, Number(initPaid) - totalAmount));
      if (initialCustomerId) setSelectedCustomerId(String(initialCustomerId));
      if (initialDoctorName) setDoctorName(initialDoctorName);
      api.getCustomers()
        .then((data) => {
          setCustomers(data || []);
          if (initialCustomerId) {
            const found = (data || []).find((c) => String(c.id) === String(initialCustomerId));
            if (found) setCustomerName(found.name);
          }
        })
        .catch((err) => console.error(err));
    }
  }, [isOpen, totalAmount, initialCustomerId, initialDoctorName]);

  useEffect(() => {
    if (paymentMode === 'KHATA') {
      setPaidAmount(0);
      setChangeAmount(0);
    } else {
      const paid = Number(paidAmount) || 0;
      setChangeAmount(Math.max(0, paid - totalAmount));
    }
  }, [paymentMode, paidAmount, totalAmount]);

  const selectedCustomer = customers.find((c) => String(c.id) === String(selectedCustomerId));

  const handleCustomerChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const custId = e.target.value;
    setSelectedCustomerId(custId);
    if (!custId) {
      setCustomerName('Walk-in Customer');
    } else {
      const c = customers.find((item) => String(item.id) === String(custId));
      if (c) setCustomerName(c.name);
    }
  };

  const handleCheckout = async () => {
    if (cart.length === 0) {
      toast.error('Cart is empty!');
      return;
    }

    if (paymentMode === 'KHATA' && !selectedCustomerId) {
      toast.error('Please select a customer account for Khata (Credit) sale!');
      return;
    }

    const unpaid = Math.max(0, totalAmount - (Number(paidAmount) || 0));
    if (selectedCustomer && unpaid > 0) {
      const projectedBal = (selectedCustomer.current_balance || 0) + unpaid;
      if (projectedBal > (selectedCustomer.credit_limit || 10000)) {
        const proceed = window.confirm(
          `Warning: Customer credit balance will reach ${formatCurrency(
            projectedBal
          )}, exceeding their credit limit of ${formatCurrency(
            selectedCustomer.credit_limit || 10000
          )}. Authorize credit sale anyway?`
        );
        if (!proceed) return;
      }
    }

    setLoading(true);
    try {
      const mrpSavings = cart.reduce((acc, it) => {
        const mrp = Number(it.mrp) || Number(it.unit_price) || 0;
        const sale = Number(it.unit_price) || 0;
        const qty = Number(it.quantity) || 0;
        return acc + (mrp > sale ? (mrp - sale) * qty : 0);
      }, 0);
      const effectiveSubtotal = (Number(subtotal) || 0) + mrpSavings;
      const effectiveDiscount = (Number(discountAmount) || 0) + mrpSavings;

      const invoicePayload = {
        customer_id: selectedCustomerId ? Number(selectedCustomerId) : 0,
        customer_name: customerName || 'Walk-in Customer',
        doctor_name: doctorName || '',
        subtotal: effectiveSubtotal > 0 ? effectiveSubtotal : Number(subtotal) || 0,
        discount_amount: effectiveDiscount,
        discount_percent: Number(discountPercent) || 0,
        tax_amount: Number(taxAmount) || 0,
        total_amount: Number(totalAmount) || 0,
        paid_amount: paymentMode === 'KHATA' ? 0 : Math.min(Number(paidAmount) || 0, totalAmount),
        change_amount: Number(changeAmount) || 0,
        payment_mode: paymentMode || 'CASH',
        notes: notes || '',
        items: cart.map((item) => ({
          medicine_id: item.medicine_id,
          batch_id: item.batch_id || 0,
          medicine_name: item.name,
          batch_number: item.batch_number || '',
          expiry_date: item.expiry_date || '',
          quantity: Number(item.quantity) || 1,
          unit_type: 'Unit',
          pack_size: 1,
          unit_price: Number(item.unit_price) || 0,
          discount_percent: Number(item.discount_percent) || 0,
          total_price: Number(item.total) || 0,
        })),
      };

      const result = await api.checkoutPOS(invoicePayload);
      toast.success(`Invoice ${result.invoice_number} created successfully!`);
      refreshStats();
      onPaymentSuccess(result);
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Checkout failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Complete Sale & Payment"
      maxWidth="620px"
      footer={
        <div className="d-flex justify-content-end gap-2 w-100">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleCheckout}
            loading={loading}
            shortcut="F9"
            className="d-flex align-items-center gap-1"
          >
            <i className="bi bi-printer-fill"></i>
            <span>Confirm & Print Bill</span>
          </Button>
        </div>
      }
    >
      <div className="d-flex flex-column gap-3">
        {/* Payable Total Callout */}
        <div className="alert alert-success d-flex justify-content-between align-items-center mb-0 border shadow-sm">
          <div>
            <div className="small fw-semibold text-success-emphasis text-uppercase">
              Net Amount Payable
            </div>
            <div className="fs-3 fw-bold text-success-emphasis">
              {formatCurrency(totalAmount)}
            </div>
          </div>
          <div className="text-end small text-secondary">
            <div>Items in bill: <strong>{cart.length}</strong></div>
            {discountAmount > 0 && <div>Discount: -{formatCurrency(discountAmount)}</div>}
          </div>
        </div>

        {/* Payment Mode Selector */}
        <div>
          <label className="form-label small fw-semibold mb-1">Select Payment Mode</label>
          <div className="row g-2">
            {[
              { id: 'CASH', label: 'Cash', icon: 'bi-cash' },
              { id: 'CARD', label: 'Card', icon: 'bi-credit-card-fill' },
              { id: 'ONLINE', label: 'Mobile / UPI', icon: 'bi-phone-fill' },
              { id: 'KHATA', label: 'Khata / Credit', icon: 'bi-journal-text' },
            ].map((mode) => (
              <div key={mode.id} className="col-3">
                <button
                  type="button"
                  className={`btn w-100 py-2 small fw-semibold d-flex align-items-center justify-content-center gap-1 ${
                    paymentMode === mode.id ? 'btn-primary' : 'btn-outline-secondary'
                  }`}
                  onClick={() => setPaymentMode(mode.id as any)}
                >
                  <i className={`bi ${mode.icon}`}></i>
                  <span>{mode.label}</span>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Customer Select / Khata Account */}
        <div>
          <label className="form-label small fw-semibold mb-1">Customer / Patient Account</label>
          <select
            className="form-select"
            value={selectedCustomerId}
            onChange={handleCustomerChange}
          >
            <option value="">Walk-in Customer (No Credit Account)</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.phone ? `(${c.phone})` : ''} — Balance: {formatCurrency(c.current_balance || 0)}
              </option>
            ))}
          </select>

          {selectedCustomer && (
            <div className="alert alert-secondary py-2 px-3 mt-2 mb-0 d-flex justify-content-between small">
              <span>
                Current Balance Due: <strong>{formatCurrency(selectedCustomer.current_balance || 0)}</strong>
              </span>
              <span>
                Credit Limit: <strong>{formatCurrency(selectedCustomer.credit_limit || 10000)}</strong>
              </span>
            </div>
          )}
        </div>

        {/* Cash Received & Change */}
        {paymentMode !== 'KHATA' && (
          <div className="row g-2">
            <div className="col-6">
              <Input
                label="Cash Received / Tendered"
                type="number"
                min="0"
                step="any"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                autoFocus
              />
            </div>
            <div className="col-6">
              <label className="form-label small fw-semibold mb-1">Change to Return</label>
              <div
                className={`form-control fw-bold fs-5 ${
                  changeAmount > 0 ? 'text-success bg-success-subtle' : 'text-secondary'
                }`}
              >
                {formatCurrency(changeAmount)}
              </div>
            </div>
          </div>
        )}

        {/* Prescription & Doctor info */}
        <div className="row g-2">
          <div className="col-6">
            <Input
              label="Doctor Name (Optional)"
              placeholder="e.g. Dr. A. Khan"
              value={doctorName}
              onChange={(e) => setDoctorName(e.target.value)}
            />
          </div>
          <div className="col-6">
            <Input
              label="Invoice Notes (Optional)"
              placeholder="e.g. Dosage instructions"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
