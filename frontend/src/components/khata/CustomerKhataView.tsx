import React, { useState, useEffect, FormEvent, useMemo } from 'react';
import { api } from '../../services/api';
import { useApp } from '../../context/AppContext';
import { useToast } from '../../context/ToastContext';
import { Customer, CustomerLedgerEntry } from '../../types';
import { Modal } from '../ui/Modal';
import { KhataReceiptModal } from './KhataReceiptModal';

type FilterTab = 'ALL' | 'DUE' | 'OVER_LIMIT' | 'SETTLED';

export function CustomerKhataView() {
  const { formatCurrency, refreshStats, settings } = useApp();
  const toast = useToast();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('ALL');
  const [loading, setLoading] = useState(false);

  // Modals state
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const [isLedgerModalOpen, setIsLedgerModalOpen] = useState(false);
  const [ledgerEntries, setLedgerEntries] = useState<CustomerLedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [statementWhatsAppPhone, setStatementWhatsAppPhone] = useState('');

  // Receipt Modal State
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [receiptType, setReceiptType] = useState<'PAYMENT' | 'STATEMENT'>('PAYMENT');
  const [paymentReceiptDetails, setPaymentReceiptDetails] = useState<{
    receiptNumber: string;
    amountPaid: number;
    previousBalance: number;
    newBalance: number;
    paymentMode: string;
    notes?: string;
    date: string;
    whatsappPhone?: string;
  } | undefined>(undefined);

  // Add / Edit Form State
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formCreditLimit, setFormCreditLimit] = useState<number | string>(10000);
  const [formOpeningBalance, setFormOpeningBalance] = useState<number | string>(0);
  const [formNotes, setFormNotes] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Payment Form State
  const [payAmount, setPayAmount] = useState<number | string>('');
  const [payDiscount, setPayDiscount] = useState<number | string>('');
  const [payMode, setPayMode] = useState('CASH');
  const [payPhone, setPayPhone] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [sendWhatsAppOnSave, setSendWhatsAppOnSave] = useState(true);
  const [printSlipOnSave, setPrintSlipOnSave] = useState(true);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);

  // Fetch Customers
  const loadCustomers = async () => {
    setLoading(true);
    try {
      const data = await api.getCustomers(search);
      setCustomers(data || []);
    } catch (err: any) {
      toast.error('Failed to load customers: ' + (err.message || 'Error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, [search]);

  // Derived Filtered List
  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      const balance = Number(c.current_balance ?? c.balance ?? 0);
      const limit = Number(c.credit_limit || 10000);

      if (filterTab === 'DUE') return balance > 0;
      if (filterTab === 'OVER_LIMIT') return balance > limit;
      if (filterTab === 'SETTLED') return balance <= 0;
      return true;
    });
  }, [customers, filterTab]);

  // Summary Metrics
  const metrics = useMemo(() => {
    let totalReceivables = 0;
    let dueCount = 0;
    let overLimitCount = 0;
    let settledCount = 0;

    customers.forEach((c) => {
      const balance = Number(c.current_balance ?? c.balance ?? 0);
      const limit = Number(c.credit_limit || 10000);

      if (balance > 0) {
        totalReceivables += balance;
        dueCount++;
      } else {
        settledCount++;
      }

      if (balance > limit) {
        overLimitCount++;
      }
    });

    return { totalReceivables, dueCount, overLimitCount, settledCount };
  }, [customers]);

  // Open Add Modal
  const handleOpenAddModal = () => {
    setEditingCustomer(null);
    setFormName('');
    setFormPhone('');
    setFormAddress('');
    setFormCreditLimit(10000);
    setFormOpeningBalance(0);
    setFormNotes('');
    setIsAddEditModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (cust: Customer) => {
    setEditingCustomer(cust);
    setFormName(cust.name || '');
    setFormPhone(cust.phone || '');
    setFormAddress(cust.address || '');
    setFormCreditLimit(cust.credit_limit || 10000);
    setFormOpeningBalance(cust.current_balance || 0);
    setFormNotes(cust.notes || '');
    setIsAddEditModalOpen(true);
  };

  // Save Customer (Create or Update)
  const handleSaveCustomer = async (e: FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      toast.warning('Customer name is required!');
      return;
    }

    setFormSubmitting(true);
    try {
      if (editingCustomer) {
        await api.updateCustomer(editingCustomer.id, {
          name: formName.trim(),
          phone: formPhone.trim(),
          address: formAddress.trim(),
          credit_limit: Number(formCreditLimit) || 10000,
          notes: formNotes.trim(),
        });
        toast.success(`Customer account "${formName}" updated!`);
      } else {
        await api.createCustomer({
          name: formName.trim(),
          phone: formPhone.trim(),
          address: formAddress.trim(),
          credit_limit: Number(formCreditLimit) || 10000,
          current_balance: Number(formOpeningBalance) || 0,
          notes: formNotes.trim(),
        });
        toast.success(`Customer account "${formName}" created!`);
      }

      setIsAddEditModalOpen(false);
      refreshStats();
      loadCustomers();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save customer account');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Open Ledger Statement Modal
  const handleOpenLedger = async (cust: Customer) => {
    setSelectedCustomer(cust);
    setStatementWhatsAppPhone(cust.phone || '');
    setIsLedgerModalOpen(true);
    setLedgerLoading(true);
    try {
      const data = await api.getCustomerLedger(cust.id);
      setLedgerEntries(data || []);
    } catch (err: any) {
      toast.error('Failed to load ledger: ' + (err.message || 'Error'));
    } finally {
      setLedgerLoading(false);
    }
  };

  // Open Payment Modal
  const handleOpenPayment = (cust: Customer) => {
    setSelectedCustomer(cust);
    const curBal = Number(cust.current_balance ?? cust.balance ?? 0);
    setPayAmount(curBal > 0 ? curBal : '');
    setPayDiscount('');
    setPayMode('CASH');
    setPayPhone(cust.phone || '');
    setPayNotes('');
    setSendWhatsAppOnSave(Boolean(cust.phone));
    setIsPaymentModalOpen(true);
  };

  // Quick preset button for payment
  const handlePresetAmount = (preset: 'FULL' | 'HALF' | 500 | 1000 | 2000 | 5000) => {
    const curBal = Number(selectedCustomer?.current_balance ?? selectedCustomer?.balance ?? 0);
    if (preset === 'FULL') {
      setPayAmount(curBal);
    } else if (preset === 'HALF') {
      setPayAmount(Math.round(curBal / 2));
    } else {
      setPayAmount(preset);
    }
  };

  // Send WhatsApp Receipt
  const triggerWhatsAppReceipt = (
    customerName: string,
    phone: string,
    receiptNo: string,
    dateStr: string,
    prevBal: number,
    amount: number,
    newBal: number,
    mode: string
  ) => {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (!cleanPhone) return;

    const pharmacy = settings.pharmacy_name || 'AL-SHIFA COMMUNITY PHARMACY';
    const msg =
      `*${pharmacy} — PAYMENT RECEIPT*\n` +
      `Receipt #: ${receiptNo}\n` +
      `Date: ${dateStr}\n\n` +
      `Customer: *${customerName}*\n` +
      `------------------------------------\n` +
      `Previous Balance: ${formatCurrency(prevBal)}\n` +
      `*Amount Received: ${formatCurrency(amount)}*\n` +
      `Payment Method: ${mode}\n` +
      `------------------------------------\n` +
      `*Remaining Balance Due: ${formatCurrency(newBal)}*\n\n` +
      `Thank you for your payment!\n` +
      (settings.phone ? `Helpline: ${settings.phone}\n` : '') +
      (settings.address ? `Address: ${settings.address}` : '');

    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  // Record Payment Submission
  const handleRecordPayment = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;

    const amount = Number(payAmount);
    if (!amount || amount <= 0) {
      toast.warning('Please enter a valid payment amount!');
      return;
    }

    const discount = Number(payDiscount) || 0;
    const totalCredit = amount + discount;

    setPaymentSubmitting(true);
    try {
      const prevBal = Number(selectedCustomer.current_balance ?? selectedCustomer.balance ?? 0);
      const noteWithDiscount = discount > 0
        ? `${payNotes ? payNotes + ' | ' : ''}Includes Round-off Discount: Rs. ${discount.toFixed(2)}`
        : payNotes;

      const res = await api.recordCustomerPayment(selectedCustomer.id, totalCredit, payMode, noteWithDiscount);

      const newBal = res?.new_balance ?? Math.max(0, prevBal - totalCredit);
      const receiptNo = `WAS-${Date.now().toString().slice(-6)}`;
      const dateStr = new Date().toLocaleString();

      toast.success(`Payment of ${formatCurrency(amount)} recorded for ${selectedCustomer.name}!`);
      setIsPaymentModalOpen(false);

      refreshStats();
      loadCustomers();

      if (isLedgerModalOpen) {
        handleOpenLedger({ ...selectedCustomer, current_balance: newBal });
      }

      // 1. Send WhatsApp receipt if enabled and phone provided
      if (sendWhatsAppOnSave && payPhone.trim()) {
        triggerWhatsAppReceipt(
          selectedCustomer.name,
          payPhone.trim(),
          receiptNo,
          dateStr,
          prevBal,
          amount,
          newBal,
          payMode
        );
      }

      // 2. Open print receipt modal if enabled
      if (printSlipOnSave) {
        setPaymentReceiptDetails({
          receiptNumber: receiptNo,
          amountPaid: amount,
          previousBalance: prevBal,
          newBalance: newBal,
          paymentMode: payMode,
          notes: noteWithDiscount,
          date: dateStr,
          whatsappPhone: payPhone.trim(),
        });
        setReceiptType('PAYMENT');
        setIsReceiptModalOpen(true);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to record payment');
    } finally {
      setPaymentSubmitting(false);
    }
  };

  // WhatsApp Reminder Message Formatter (Table Action)
  const handleShareWhatsAppReminder = (cust: Customer | null, customPhone?: string) => {
    if (!cust) return;
    const balance = Number(cust.current_balance ?? cust.balance ?? 0);
    const pharmacy = settings.pharmacy_name || 'AL-SHIFA COMMUNITY PHARMACY';

    const msg =
      `*${pharmacy} — ACCOUNT BALANCE NOTICE*\n\n` +
      `Dear *${cust.name}*,\n` +
      `Account #: C-${String(cust.id).padStart(3, '0')}\n\n` +
      `This is a friendly reminder that your outstanding balance is: *${formatCurrency(balance)}*.\n\n` +
      `Please clear your dues at the counter at your earliest convenience.\n` +
      `For any questions, please contact: ${settings.phone || ''}\n\n` +
      `Thank you!`;

    const phoneToSend = (customPhone || cust.phone || '').replace(/[^0-9]/g, '');
    if (!phoneToSend) {
      alert('Please enter a valid mobile number for WhatsApp');
      return;
    }
    const url = `https://wa.me/${phoneToSend}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  // Print Statement Slip Shortcut
  const handlePrintStatement = () => {
    setReceiptType('STATEMENT');
    setIsReceiptModalOpen(true);
  };

  return (
    <div className="d-flex flex-column gap-3 p-1">
      {/* 1. TOP METRICS BAR */}
      <div className="row g-2">
        {/* Total Receivables */}
        <div className="col-12 col-sm-6 col-lg-3">
          <div
            className="card p-3 shadow-sm h-100"
            style={{
              backgroundColor: 'var(--surface-bg)',
              border: '1px solid var(--border-color)',
              borderLeft: '4px solid #EF4444',
            }}
          >
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Total Receivables (Due Balance)
                </div>
                <div className="fs-5 fw-bold text-danger mt-1">
                  {formatCurrency(metrics.totalReceivables)}
                </div>
              </div>
              <div
                className="rounded-circle p-2 d-flex align-items-center justify-content-center"
                style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', width: '38px', height: '38px' }}
              >
                <i className="bi bi-wallet2 fs-5"></i>
              </div>
            </div>
          </div>
        </div>

        {/* Accounts with Balance Due */}
        <div className="col-12 col-sm-6 col-lg-3">
          <div
            className="card p-3 shadow-sm h-100"
            style={{
              backgroundColor: 'var(--surface-bg)',
              border: '1px solid var(--border-color)',
              borderLeft: '4px solid #F59E0B',
            }}
          >
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Accounts with Balance Due
                </div>
                <div className="fs-5 fw-bold text-warning mt-1">
                  {metrics.dueCount} <span className="small text-secondary fw-normal">/ {customers.length} Accounts</span>
                </div>
              </div>
              <div
                className="rounded-circle p-2 d-flex align-items-center justify-content-center"
                style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#F59E0B', width: '38px', height: '38px' }}
              >
                <i className="bi bi-person-exclamation fs-5"></i>
              </div>
            </div>
          </div>
        </div>

        {/* Over Credit Limit */}
        <div className="col-12 col-sm-6 col-lg-3">
          <div
            className="card p-3 shadow-sm h-100"
            style={{
              backgroundColor: 'var(--surface-bg)',
              border: '1px solid var(--border-color)',
              borderLeft: '4px solid #DC2626',
            }}
          >
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Over Credit Limit
                </div>
                <div className={`fs-5 fw-bold mt-1 ${metrics.overLimitCount > 0 ? 'text-danger' : 'text-secondary'}`}>
                  {metrics.overLimitCount} <span className="small text-secondary fw-normal">Accounts</span>
                </div>
              </div>
              <div
                className="rounded-circle p-2 d-flex align-items-center justify-content-center"
                style={{ backgroundColor: 'rgba(220, 38, 38, 0.1)', color: '#DC2626', width: '38px', height: '38px' }}
              >
                <i className="bi bi-shield-slash fs-5"></i>
              </div>
            </div>
          </div>
        </div>

        {/* Cleared Accounts */}
        <div className="col-12 col-sm-6 col-lg-3">
          <div
            className="card p-3 shadow-sm h-100"
            style={{
              backgroundColor: 'var(--surface-bg)',
              border: '1px solid var(--border-color)',
              borderLeft: '4px solid #10B981',
            }}
          >
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Cleared Accounts (Zero Due)
                </div>
                <div className="fs-5 fw-bold text-success mt-1">
                  {metrics.settledCount} <span className="small text-secondary fw-normal">Accounts</span>
                </div>
              </div>
              <div
                className="rounded-circle p-2 d-flex align-items-center justify-content-center"
                style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10B981', width: '38px', height: '38px' }}
              >
                <i className="bi bi-check-circle fs-5"></i>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. SEARCH & FILTER TOOLBAR */}
      <div
        className="card p-2 shadow-sm d-flex flex-row justify-content-between align-items-center flex-wrap gap-2"
        style={{
          backgroundColor: 'var(--surface-bg)',
          border: '1px solid var(--border-color)',
        }}
      >
        {/* Left: Filter Pills */}
        <div className="btn-group btn-group-sm" role="group">
          <button
            type="button"
            className={`btn btn-sm fw-semibold ${filterTab === 'ALL' ? 'btn-teal text-white' : 'btn-outline-secondary'}`}
            style={filterTab === 'ALL' ? { backgroundColor: '#0F766E', borderColor: '#0F766E' } : {}}
            onClick={() => setFilterTab('ALL')}
          >
            All Accounts ({customers.length})
          </button>
          <button
            type="button"
            className={`btn btn-sm fw-semibold ${filterTab === 'DUE' ? 'btn-teal text-white' : 'btn-outline-secondary'}`}
            style={filterTab === 'DUE' ? { backgroundColor: '#0F766E', borderColor: '#0F766E' } : {}}
            onClick={() => setFilterTab('DUE')}
          >
            Balance Due ({metrics.dueCount})
          </button>
          <button
            type="button"
            className={`btn btn-sm fw-semibold ${filterTab === 'OVER_LIMIT' ? 'btn-teal text-white' : 'btn-outline-secondary'}`}
            style={filterTab === 'OVER_LIMIT' ? { backgroundColor: '#0F766E', borderColor: '#0F766E' } : {}}
            onClick={() => setFilterTab('OVER_LIMIT')}
          >
            Over Limit ({metrics.overLimitCount})
          </button>
          <button
            type="button"
            className={`btn btn-sm fw-semibold ${filterTab === 'SETTLED' ? 'btn-teal text-white' : 'btn-outline-secondary'}`}
            style={filterTab === 'SETTLED' ? { backgroundColor: '#0F766E', borderColor: '#0F766E' } : {}}
            onClick={() => setFilterTab('SETTLED')}
          >
            Cleared ({metrics.settledCount})
          </button>
        </div>

        {/* Right: Search Box & Add Customer Button */}
        <div className="d-flex align-items-center gap-2 flex-grow-1 justify-content-end" style={{ maxWidth: '480px' }}>
          <div className="input-group input-group-sm">
            <span className="input-group-text bg-transparent border-end-0" style={{ borderColor: 'var(--border-color)' }}>
              <i className="bi bi-search text-secondary"></i>
            </span>
            <input
              type="text"
              className="form-control border-start-0"
              style={{
                backgroundColor: 'var(--surface-subtle)',
                color: 'var(--text-primary)',
                borderColor: 'var(--border-color)',
                fontSize: '12px',
              }}
              placeholder="Search by customer name, phone, address..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                className="btn btn-sm secondaryBtn border-start-0"
                onClick={() => setSearch('')}
                title="Clear Search"
              >
                ✕
              </button>
            )}
          </div>

          <button
            type="button"
            className="btn btn-sm text-white fw-bold d-flex align-items-center gap-1 text-nowrap px-3"
            onClick={handleOpenAddModal}
            style={{
              backgroundColor: '#0F766E',
              borderColor: '#0D5F59',
              height: '31px',
              fontSize: '12px',
            }}
          >
            <i className="bi bi-person-plus-fill"></i>
            <span>+ Add Account</span>
          </button>
        </div>
      </div>

      {/* 3. CUSTOMER ACCOUNTS TABLE */}
      <div
        className="card shadow-sm overflow-hidden"
        style={{
          backgroundColor: 'var(--surface-bg)',
          border: '1px solid var(--border-color)',
        }}
      >
        <div className="table-responsive" style={{ maxHeight: 'calc(100vh - 280px)' }}>
          <table className="table table-hover align-middle mb-0" style={{ fontSize: '12px' }}>
            <thead
              style={{
                backgroundColor: 'var(--surface-subtle)',
                borderBottom: '2px solid var(--border-color)',
                position: 'sticky',
                top: 0,
                zIndex: 10,
              }}
            >
              <tr>
                <th style={{ width: '80px', padding: '8px 12px' }}>ACC #</th>
                <th style={{ width: '28%', padding: '8px 12px' }}>CUSTOMER NAME &amp; CONTACT</th>
                <th style={{ width: '14%', padding: '8px 12px' }}>CREDIT LIMIT</th>
                <th style={{ width: '16%', padding: '8px 12px', textAlign: 'right' }}>BALANCE DUE</th>
                <th style={{ width: '14%', padding: '8px 12px', textAlign: 'center' }}>CREDIT USAGE</th>
                <th style={{ width: '20%', padding: '8px 12px', textAlign: 'right' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-5 text-secondary">
                    <div className="spinner-border spinner-border-sm me-2 text-teal" role="status" />
                    Loading customer accounts...
                  </td>
                </tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-5 text-secondary">
                    <i className="bi bi-people fs-2 d-block mb-2 text-muted"></i>
                    No customer accounts found matching your query.
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((c, idx) => {
                  const balance = Number(c.current_balance ?? c.balance ?? 0);
                  const limit = Number(c.credit_limit || 10000);
                  const isOverLimit = balance > limit;
                  const hasDue = balance > 0;
                  const usagePct = limit > 0 ? Math.min(Math.round((balance / limit) * 100), 100) : 0;

                  return (
                    <tr
                      key={c.id}
                      style={{
                        borderBottom: '1px solid var(--border-color)',
                        backgroundColor: idx % 2 === 0 ? 'var(--ghost-row-even)' : 'var(--ghost-row-odd)',
                      }}
                    >
                      {/* Code */}
                      <td style={{ padding: '8px 12px' }}>
                        <span className="badge bg-secondary-subtle text-secondary" style={{ fontSize: '10.5px' }}>
                          C-{String(c.id).padStart(3, '0')}
                        </span>
                      </td>

                      {/* Name & Contact */}
                      <td style={{ padding: '8px 12px' }}>
                        <div className="fw-bold" style={{ color: 'var(--text-primary)' }}>
                          {c.name}
                        </div>
                        <div className="d-flex align-items-center gap-2 mt-1" style={{ fontSize: '11px' }}>
                          {c.phone ? (
                            <span className="text-secondary d-flex align-items-center gap-1">
                              <i className="bi bi-telephone text-muted" style={{ fontSize: '10px' }}></i>
                              {c.phone}
                            </span>
                          ) : (
                            <span className="text-muted">No phone</span>
                          )}
                          {c.address && (
                            <span className="text-secondary text-truncate" style={{ maxWidth: '180px' }} title={c.address}>
                              • {c.address}
                            </span>
                          )}
                        </div>
                        {c.notes && (
                          <div className="text-muted mt-1 fst-italic" style={{ fontSize: '10px' }}>
                            {c.notes}
                          </div>
                        )}
                      </td>

                      {/* Credit Limit */}
                      <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>
                        {formatCurrency(limit)}
                      </td>

                      {/* Balance Due */}
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        <div className={`fw-bold fs-6 ${hasDue ? 'text-danger' : 'text-success'}`}>
                          {formatCurrency(balance)}
                        </div>
                        {isOverLimit && (
                          <span
                            className="badge mt-1"
                            style={{
                              backgroundColor: 'rgba(220, 38, 38, 0.15)',
                              color: '#EF4444',
                              fontSize: '9.5px',
                              border: '1px solid #DC2626',
                            }}
                          >
                            OVER LIMIT (+{formatCurrency(balance - limit)})
                          </span>
                        )}
                      </td>

                      {/* Limit Gauge */}
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <div className="d-flex flex-column align-items-center">
                          <div
                            className="progress w-100"
                            style={{ height: '6px', backgroundColor: 'var(--surface-subtle)', borderRadius: '3px' }}
                          >
                            <div
                              className={`progress-bar ${
                                isOverLimit ? 'bg-danger' : usagePct > 75 ? 'bg-warning' : 'bg-teal'
                              }`}
                              style={{ width: `${usagePct}%`, backgroundColor: usagePct <= 75 ? '#0F766E' : undefined }}
                            />
                          </div>
                          <span className="text-secondary mt-1" style={{ fontSize: '10px' }}>
                            {usagePct}% used
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        <div className="d-inline-flex gap-1">
                          {/* Receive Payment Button */}
                          <button
                            type="button"
                            className="btn btn-sm d-inline-flex align-items-center gap-1"
                            onClick={() => handleOpenPayment(c)}
                            disabled={!hasDue}
                            title="Receive payment from customer"
                            style={{
                              backgroundColor: hasDue ? '#0F766E' : undefined,
                              borderColor: hasDue ? '#0D5F59' : undefined,
                              color: hasDue ? '#FFFFFF' : 'var(--text-muted)',
                              fontSize: '11px',
                              height: '26px',
                              padding: '2px 8px',
                            }}
                          >
                            <i className="bi bi-cash-stack"></i>
                            <span>Receive Payment</span>
                          </button>

                          {/* Statement Button */}
                          <button
                            type="button"
                            className="btn btn-sm secondaryBtn d-inline-flex align-items-center gap-1"
                            onClick={() => handleOpenLedger(c)}
                            title="View account ledger statement"
                            style={{
                              fontSize: '11px',
                              height: '26px',
                              padding: '2px 8px',
                            }}
                          >
                            <i className="bi bi-journal-text"></i>
                            <span>Statement</span>
                          </button>

                          {/* WhatsApp Reminder Button */}
                          {hasDue && c.phone && (
                            <button
                              type="button"
                              className="btn btn-sm secondaryBtn d-inline-flex align-items-center text-success"
                              onClick={() => handleShareWhatsAppReminder(c)}
                              title="Send WhatsApp balance reminder"
                              style={{
                                fontSize: '11px',
                                height: '26px',
                                padding: '2px 6px',
                              }}
                            >
                              <i className="bi bi-whatsapp"></i>
                            </button>
                          )}

                          {/* Edit Customer */}
                          <button
                            type="button"
                            className="btn btn-sm secondaryBtn d-inline-flex align-items-center"
                            onClick={() => handleOpenEditModal(c)}
                            title="Edit customer account"
                            style={{
                              fontSize: '11px',
                              height: '26px',
                              padding: '2px 6px',
                            }}
                          >
                            <i className="bi bi-pencil"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* =========================================================================
          MODAL 1: RECEIVE PAYMENT MODAL (USER-FRIENDLY & FAST)
          ========================================================================= */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title={
          <div className="d-flex align-items-center gap-2">
            <span>💵 Receive Customer Payment</span>
            <span className="badge bg-secondary-subtle text-secondary" style={{ fontSize: '10.5px' }}>
              {selectedCustomer?.name}
            </span>
          </div>
        }
        maxWidth="500px"
        footer={
          <div className="d-flex justify-content-between align-items-center w-100 flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-sm secondaryBtn px-3"
              onClick={() => setIsPaymentModalOpen(false)}
              style={{ height: '32px' }}
            >
              Cancel (Esc)
            </button>
            <button
              type="button"
              className="btn btn-sm text-white fw-bold px-4 d-flex align-items-center gap-1"
              onClick={handleRecordPayment}
              disabled={paymentSubmitting}
              style={{
                backgroundColor: '#0F766E',
                borderColor: '#0D5F59',
                height: '32px',
                fontSize: '12px',
              }}
            >
              {paymentSubmitting ? (
                <span className="spinner-border spinner-border-sm" role="status" />
              ) : (
                <>
                  <i className="bi bi-check2-circle"></i>
                  <span>Save Payment</span>
                </>
              )}
            </button>
          </div>
        }
      >
        <form onSubmit={handleRecordPayment} className="d-flex flex-column gap-3">
          {/* Customer Due Banner */}
          <div
            className="p-3 rounded"
            style={{
              backgroundColor: 'var(--surface-subtle)',
              border: '1px solid var(--border-color)',
            }}
          >
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <span className="text-secondary small">Balance Due:</span>
                <div className="fs-5 fw-bold text-danger mt-1">
                  {formatCurrency(Number(selectedCustomer?.current_balance ?? selectedCustomer?.balance ?? 0))}
                </div>
              </div>
              <div className="text-end">
                <span className="text-secondary small">Customer Account:</span>
                <div className="fw-bold" style={{ color: 'var(--text-primary)' }}>
                  {selectedCustomer?.name}
                </div>
                <div className="text-muted small">{selectedCustomer?.phone || 'No phone'}</div>
              </div>
            </div>
          </div>

          {/* Quick Preset Buttons */}
          <div>
            <label className="form-label small fw-semibold text-secondary mb-1">Quick Select Amount:</label>
            <div className="d-flex flex-wrap gap-1">
              <button
                type="button"
                className="btn btn-sm secondaryBtn py-0 px-2"
                style={{ fontSize: '11px', height: '24px' }}
                onClick={() => handlePresetAmount('FULL')}
              >
                Full Balance
              </button>
              <button
                type="button"
                className="btn btn-sm secondaryBtn py-0 px-2"
                style={{ fontSize: '11px', height: '24px' }}
                onClick={() => handlePresetAmount('HALF')}
              >
                50% Half
              </button>
              <button
                type="button"
                className="btn btn-sm secondaryBtn py-0 px-2"
                style={{ fontSize: '11px', height: '24px' }}
                onClick={() => handlePresetAmount(500)}
              >
                Rs. 500
              </button>
              <button
                type="button"
                className="btn btn-sm secondaryBtn py-0 px-2"
                style={{ fontSize: '11px', height: '24px' }}
                onClick={() => handlePresetAmount(1000)}
              >
                Rs. 1,000
              </button>
              <button
                type="button"
                className="btn btn-sm secondaryBtn py-0 px-2"
                style={{ fontSize: '11px', height: '24px' }}
                onClick={() => handlePresetAmount(2000)}
              >
                Rs. 2,000
              </button>
              <button
                type="button"
                className="btn btn-sm secondaryBtn py-0 px-2"
                style={{ fontSize: '11px', height: '24px' }}
                onClick={() => handlePresetAmount(5000)}
              >
                Rs. 5,000
              </button>
            </div>
          </div>

          {/* Amount Received & Discount Row */}
          <div className="row g-2">
            <div className="col-7">
              <label className="form-label small fw-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                Payment Amount (Rs.) *
              </label>
              <input
                type="number"
                min="1"
                step="any"
                className="form-control"
                style={{
                  backgroundColor: 'var(--surface-subtle)',
                  color: 'var(--text-primary)',
                  borderColor: 'var(--border-color)',
                  fontSize: '15px',
                  fontWeight: 700,
                }}
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder="e.g. 1500"
                autoFocus
                required
              />
            </div>
            <div className="col-5">
              <label className="form-label small fw-semibold text-secondary mb-1">
                Discount / Round-off
              </label>
              <input
                type="number"
                min="0"
                step="any"
                className="form-control"
                style={{
                  backgroundColor: 'var(--surface-subtle)',
                  color: 'var(--text-primary)',
                  borderColor: 'var(--border-color)',
                  fontSize: '13px',
                }}
                value={payDiscount}
                onChange={(e) => setPayDiscount(e.target.value)}
                placeholder="e.g. 20"
              />
            </div>
          </div>

          {/* Dynamic Balance Calculation */}
          {Number(payAmount) > 0 && selectedCustomer && (
            <div
              className="p-2 rounded d-flex justify-content-between align-items-center"
              style={{
                backgroundColor: 'var(--surface-subtle)',
                border: '1px dashed var(--border-color)',
                fontSize: '11.5px',
              }}
            >
              <span className="text-secondary">
                Remaining Balance:
              </span>
              <span className="fw-bold fs-6 text-primary">
                {formatCurrency(
                  Math.max(
                    0,
                    Number(selectedCustomer.current_balance ?? selectedCustomer.balance ?? 0) -
                      (Number(payAmount) + (Number(payDiscount) || 0))
                  )
                )}
              </span>
            </div>
          )}

          {/* Payment Method Selector */}
          <div>
            <label className="form-label small fw-semibold text-secondary mb-1">Payment Method</label>
            <select
              className="form-select form-select-sm"
              style={{
                backgroundColor: 'var(--surface-subtle)',
                color: 'var(--text-primary)',
                borderColor: 'var(--border-color)',
              }}
              value={payMode}
              onChange={(e) => setPayMode(e.target.value)}
            >
              <option value="CASH">Cash in Hand</option>
              <option value="ONLINE">Bank Transfer / Online</option>
              <option value="EASYPAISA">Easypaisa / JazzCash</option>
              <option value="CHEQUE">Cheque</option>
            </select>
          </div>

          {/* Customer WhatsApp Mobile Number */}
          <div>
            <label className="form-label small fw-semibold text-secondary mb-1">
              Customer WhatsApp Number (for digital receipt)
            </label>
            <div className="input-group input-group-sm">
              <span className="input-group-text bg-transparent text-success" style={{ borderColor: 'var(--border-color)' }}>
                <i className="bi bi-whatsapp"></i>
              </span>
              <input
                type="text"
                className="form-control"
                style={{
                  backgroundColor: 'var(--surface-subtle)',
                  color: 'var(--text-primary)',
                  borderColor: 'var(--border-color)',
                  fontSize: '12px',
                }}
                placeholder="e.g. 0300 1234567"
                value={payPhone}
                onChange={(e) => setPayPhone(e.target.value)}
              />
            </div>
          </div>

          {/* Reference Notes */}
          <div>
            <label className="form-label small fw-semibold text-secondary mb-1">
              Reference / Note (Optional)
            </label>
            <input
              type="text"
              className="form-control form-control-sm"
              style={{
                backgroundColor: 'var(--surface-subtle)',
                color: 'var(--text-primary)',
                borderColor: 'var(--border-color)',
              }}
              placeholder="e.g. Cheque #4928, online reference"
              value={payNotes}
              onChange={(e) => setPayNotes(e.target.value)}
            />
          </div>

          {/* Delivery Preferences */}
          <div className="d-flex align-items-center justify-content-between p-2 rounded" style={{ backgroundColor: 'var(--surface-subtle)' }}>
            <label className="d-flex align-items-center gap-1 cursor-pointer mb-0 text-secondary small">
              <input
                type="checkbox"
                className="form-check-input mt-0"
                checked={sendWhatsAppOnSave}
                onChange={(e) => setSendWhatsAppOnSave(e.target.checked)}
              />
              <span>Send WhatsApp receipt</span>
            </label>
            <label className="d-flex align-items-center gap-1 cursor-pointer mb-0 text-secondary small">
              <input
                type="checkbox"
                className="form-check-input mt-0"
                checked={printSlipOnSave}
                onChange={(e) => setPrintSlipOnSave(e.target.checked)}
              />
              <span>Show printable receipt slip</span>
            </label>
          </div>
        </form>
      </Modal>

      {/* =========================================================================
          MODAL 2: CUSTOMER LEDGER STATEMENT MODAL
          ========================================================================= */}
      <Modal
        isOpen={isLedgerModalOpen}
        onClose={() => setIsLedgerModalOpen(false)}
        title={
          <div className="d-flex align-items-center gap-2">
            <span>📜 Account Statement</span>
            <span className="badge bg-secondary-subtle text-secondary" style={{ fontSize: '10.5px' }}>
              {selectedCustomer?.name} (ACC #C-{String(selectedCustomer?.id || 0).padStart(3, '0')})
            </span>
          </div>
        }
        maxWidth="840px"
        footer={
          <div className="d-flex justify-content-between align-items-center w-100 flex-wrap gap-2">
            {/* Left: WhatsApp Statement with editable number */}
            <div className="d-flex align-items-center gap-1">
              <div className="input-group input-group-sm" style={{ width: '160px' }}>
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
                  value={statementWhatsAppPhone}
                  onChange={(e) => setStatementWhatsAppPhone(e.target.value)}
                  title="WhatsApp Mobile Number"
                />
              </div>
              <button
                type="button"
                className="btn btn-sm btn-success d-flex align-items-center gap-1 fw-semibold px-2"
                onClick={() => handleShareWhatsAppReminder(selectedCustomer, statementWhatsAppPhone)}
                style={{ height: '31px', fontSize: '11px' }}
                title="Send statement summary to customer via WhatsApp"
              >
                <i className="bi bi-whatsapp"></i>
                <span>Send WhatsApp</span>
              </button>
              <button
                type="button"
                className="btn btn-sm secondaryBtn d-flex align-items-center gap-1"
                onClick={handlePrintStatement}
                style={{ height: '31px', fontSize: '11.5px' }}
              >
                <i className="bi bi-printer"></i>
                <span>Print Statement</span>
              </button>
            </div>

            {/* Right: Receive Payment Shortcut & Close */}
            <div className="d-flex gap-2">
              <button
                type="button"
                className="btn btn-sm text-white fw-bold d-flex align-items-center gap-1 px-3"
                onClick={() => {
                  if (selectedCustomer) handleOpenPayment(selectedCustomer);
                }}
                disabled={Number(selectedCustomer?.current_balance ?? selectedCustomer?.balance ?? 0) <= 0}
                style={{
                  backgroundColor: '#0F766E',
                  borderColor: '#0D5F59',
                  height: '31px',
                  fontSize: '12px',
                }}
              >
                <i className="bi bi-cash-stack"></i>
                <span>Receive Payment</span>
              </button>
              <button
                type="button"
                className="btn btn-sm secondaryBtn px-3"
                onClick={() => setIsLedgerModalOpen(false)}
                style={{ height: '31px' }}
              >
                Close (Esc)
              </button>
            </div>
          </div>
        }
      >
        <div className="d-flex flex-column gap-3">
          {/* Header Profile Summary */}
          <div
            className="p-3 rounded"
            style={{
              backgroundColor: 'var(--surface-subtle)',
              border: '1px solid var(--border-color)',
            }}
          >
            <div className="row g-2 align-items-center">
              <div className="col-12 col-md-4">
                <span className="text-secondary small">CUSTOMER ACCOUNT:</span>
                <div className="fw-bold fs-6" style={{ color: 'var(--text-primary)' }}>
                  {selectedCustomer?.name}
                </div>
                <div className="text-muted small">
                  {selectedCustomer?.phone || 'No phone'} • {selectedCustomer?.address || 'No address'}
                </div>
              </div>
              <div className="col-6 col-md-4 text-md-center">
                <span className="text-secondary small">CREDIT LIMIT:</span>
                <div className="fw-semibold" style={{ color: 'var(--text-primary)' }}>
                  {formatCurrency(selectedCustomer?.credit_limit || 10000)}
                </div>
              </div>
              <div className="col-6 col-md-4 text-end">
                <span className="text-secondary small">CURRENT BALANCE DUE:</span>
                <div className="fs-5 fw-bold text-danger">
                  {formatCurrency(Number(selectedCustomer?.current_balance ?? selectedCustomer?.balance ?? 0))}
                </div>
              </div>
            </div>
          </div>

          {/* Ledger Transactions Table */}
          <div
            className="card shadow-sm overflow-hidden"
            style={{
              backgroundColor: 'var(--surface-bg)',
              border: '1px solid var(--border-color)',
            }}
          >
            <div className="table-responsive" style={{ maxHeight: '360px' }}>
              <table className="table table-hover align-middle mb-0" style={{ fontSize: '11.5px' }}>
                <thead
                  style={{
                    backgroundColor: 'var(--surface-subtle)',
                    borderBottom: '2px solid var(--border-color)',
                    position: 'sticky',
                    top: 0,
                    zIndex: 10,
                  }}
                >
                  <tr>
                    <th style={{ width: '130px', padding: '6px 10px' }}>DATE &amp; TIME</th>
                    <th style={{ width: '100px', padding: '6px 10px' }}>TYPE</th>
                    <th style={{ padding: '6px 10px' }}>DESCRIPTION</th>
                    <th style={{ width: '110px', padding: '6px 10px', textAlign: 'right' }}>DEBIT (+)</th>
                    <th style={{ width: '110px', padding: '6px 10px', textAlign: 'right' }}>CREDIT (-)</th>
                    <th style={{ width: '110px', padding: '6px 10px', textAlign: 'right' }}>BALANCE</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerLoading ? (
                    <tr>
                      <td colSpan={6} className="text-center py-4 text-secondary">
                        <div className="spinner-border spinner-border-sm me-2 text-teal" role="status" />
                        Loading ledger history...
                      </td>
                    </tr>
                  ) : ledgerEntries.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-4 text-secondary">
                        No transactions recorded for this account.
                      </td>
                    </tr>
                  ) : (
                    ledgerEntries.map((entry, idx) => (
                      <tr
                        key={entry.id || idx}
                        style={{
                          borderBottom: '1px solid var(--border-color)',
                          backgroundColor: idx % 2 === 0 ? 'var(--ghost-row-even)' : 'var(--ghost-row-odd)',
                        }}
                      >
                        <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{entry.date}</td>
                        <td style={{ padding: '6px 10px' }}>
                          <span
                            className={`badge ${
                              entry.transaction_type === 'SALE'
                                ? 'bg-danger-subtle text-danger'
                                : entry.transaction_type === 'PAYMENT'
                                ? 'bg-success-subtle text-success'
                                : 'bg-secondary-subtle text-secondary'
                            }`}
                            style={{ fontSize: '10px' }}
                          >
                            {entry.transaction_type}
                          </span>
                        </td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-primary)' }}>
                          {entry.notes || (entry.transaction_type === 'SALE' ? `Invoice #${entry.reference_id}` : '—')}
                        </td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: '#EF4444' }}>
                          {entry.debit > 0 ? formatCurrency(entry.debit) : '—'}
                        </td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: '#10B981' }}>
                          {entry.credit > 0 ? formatCurrency(entry.credit) : '—'}
                        </td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {formatCurrency(entry.balance)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Modal>

      {/* =========================================================================
          MODAL 3: ADD / EDIT CUSTOMER ACCOUNT
          ========================================================================= */}
      <Modal
        isOpen={isAddEditModalOpen}
        onClose={() => setIsAddEditModalOpen(false)}
        title={
          <div className="d-flex align-items-center gap-2">
            <span>{editingCustomer ? '✏️ Edit Customer Account' : '👤 Register New Account'}</span>
            {editingCustomer && (
              <span className="badge bg-secondary-subtle text-secondary" style={{ fontSize: '10px' }}>
                ACC #C-{String(editingCustomer.id).padStart(3, '0')}
              </span>
            )}
          </div>
        }
        maxWidth="520px"
        footer={
          <div className="d-flex justify-content-end gap-2 w-100">
            <button
              type="button"
              className="btn btn-sm secondaryBtn px-3"
              onClick={() => setIsAddEditModalOpen(false)}
              style={{ height: '32px' }}
            >
              Cancel (Esc)
            </button>
            <button
              type="button"
              className="btn btn-sm text-white fw-bold px-4 d-flex align-items-center gap-1"
              onClick={handleSaveCustomer}
              disabled={formSubmitting}
              style={{
                backgroundColor: '#0F766E',
                borderColor: '#0D5F59',
                height: '32px',
                fontSize: '12px',
              }}
            >
              {formSubmitting ? (
                <span className="spinner-border spinner-border-sm" role="status" />
              ) : (
                <>
                  <i className="bi bi-save"></i>
                  <span>{editingCustomer ? 'Update Account' : 'Save Account'}</span>
                </>
              )}
            </button>
          </div>
        }
      >
        <form onSubmit={handleSaveCustomer} className="d-flex flex-column gap-3">
          <div>
            <label className="form-label small fw-bold mb-1" style={{ color: 'var(--text-primary)' }}>
              Customer Full Name *
            </label>
            <input
              type="text"
              className="form-control form-control-sm"
              style={{
                backgroundColor: 'var(--surface-subtle)',
                color: 'var(--text-primary)',
                borderColor: 'var(--border-color)',
              }}
              placeholder="e.g. Muhammad Ali Khan, Dr. Tariq"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div className="row g-2">
            <div className="col-6">
              <label className="form-label small fw-semibold text-secondary mb-1">
                Mobile / WhatsApp
              </label>
              <input
                type="text"
                className="form-control form-control-sm"
                style={{
                  backgroundColor: 'var(--surface-subtle)',
                  color: 'var(--text-primary)',
                  borderColor: 'var(--border-color)',
                }}
                placeholder="e.g. 0300 1234567"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
              />
            </div>
            <div className="col-6">
              <label className="form-label small fw-semibold text-secondary mb-1">
                Credit Limit (Rs.)
              </label>
              <input
                type="number"
                min="0"
                step="500"
                className="form-control form-control-sm"
                style={{
                  backgroundColor: 'var(--surface-subtle)',
                  color: 'var(--text-primary)',
                  borderColor: 'var(--border-color)',
                }}
                value={formCreditLimit}
                onChange={(e) => setFormCreditLimit(e.target.value)}
              />
            </div>
          </div>

          {!editingCustomer && (
            <div>
              <label className="form-label small fw-semibold text-secondary mb-1">
                Opening Balance Due (Optional)
              </label>
              <input
                type="number"
                step="any"
                className="form-control form-control-sm"
                style={{
                  backgroundColor: 'var(--surface-subtle)',
                  color: 'var(--text-primary)',
                  borderColor: 'var(--border-color)',
                }}
                placeholder="0.00"
                value={formOpeningBalance}
                onChange={(e) => setFormOpeningBalance(e.target.value)}
              />
            </div>
          )}

          <div>
            <label className="form-label small fw-semibold text-secondary mb-1">
              Address
            </label>
            <input
              type="text"
              className="form-control form-control-sm"
              style={{
                backgroundColor: 'var(--surface-subtle)',
                color: 'var(--text-primary)',
                borderColor: 'var(--border-color)',
              }}
              placeholder="e.g. House #15, Street 4, GT Road"
              value={formAddress}
              onChange={(e) => setFormAddress(e.target.value)}
            />
          </div>

          <div>
            <label className="form-label small fw-semibold text-secondary mb-1">
              Account Notes (Optional)
            </label>
            <input
              type="text"
              className="form-control form-control-sm"
              style={{
                backgroundColor: 'var(--surface-subtle)',
                color: 'var(--text-primary)',
                borderColor: 'var(--border-color)',
              }}
              placeholder="e.g. Regular chronic patient, clears on 1st of month"
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
            />
          </div>
        </form>
      </Modal>

      {/* =========================================================================
          MODAL 4: THERMAL RECEIPT & STATEMENT MODAL
          ========================================================================= */}
      <KhataReceiptModal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        type={receiptType}
        customer={selectedCustomer}
        paymentDetails={paymentReceiptDetails}
        ledgerEntries={ledgerEntries}
      />
    </div>
  );
}

export default CustomerKhataView;
