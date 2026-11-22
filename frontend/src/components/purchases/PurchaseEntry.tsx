import React, { useState, useEffect, FormEvent } from 'react';
import { api } from '../../services/api';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { useApp } from '../../context/AppContext';
import { useToast } from '../../context/ToastContext';
import { Medicine, Supplier } from '../../types';

export function PurchaseEntry() {
  const { formatCurrency, refreshStats } = useApp();
  const toast = useToast();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [purchasesHistory, setPurchasesHistory] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'NEW' | 'HISTORY'>('NEW');
  const [loading, setLoading] = useState(false);

  // Form State
  const [supplierId, setSupplierId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [paidAmount, setPaidAmount] = useState('0');
  const [notes, setNotes] = useState('');

  // Purchase items
  const [items, setItems] = useState<any[]>([
    {
      medicine_id: '',
      batch_number: '',
      expiry_date: '',
      unit_type: 'Pack',
      pack_size: 1,
      quantity: 5,
      bonus_quantity: 0,
      purchase_rate: 0,
      sale_rate: 0,
      total_amount: 0,
    },
  ]);

  useEffect(() => {
    api.getSuppliers().then((s) => setSuppliers(s || []));
    api.getMedicines().then((m) => setMedicines(m || []));
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const hist = await api.getPurchases(20);
      setPurchasesHistory(hist || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddItemRow = () => {
    setItems((prev) => [
      ...prev,
      {
        medicine_id: '',
        batch_number: '',
        expiry_date: '',
        unit_type: 'Pack',
        pack_size: 1,
        quantity: 5,
        bonus_quantity: 0,
        purchase_rate: 0,
        sale_rate: 0,
        total_amount: 0,
      },
    ]);
  };

  const handleRemoveRow = (idx: number) => {
    if (items.length === 1) return;
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleItemChange = (idx: number, field: string, value: any) => {
    const updated = [...items];
    updated[idx][field] = value;

    if (field === 'medicine_id') {
      const med = medicines.find((m) => String(m.id) === String(value));
      if (med) {
        updated[idx].pack_size = med.pack_size || 1;
        updated[idx].unit_type = 'Pack';
        if (!updated[idx].batch_number) {
          updated[idx].batch_number = 'BN-' + Math.floor(1000 + Math.random() * 9000);
        }
      }
    }

    const qty = Number(updated[idx].quantity) || 0;
    const rate = Number(updated[idx].purchase_rate) || 0;
    updated[idx].total_amount = Number((qty * rate).toFixed(2));

    setItems(updated);
  };

  const subtotal = items.reduce((acc, it) => acc + (it.total_amount || 0), 0);
  const totalAmount = subtotal;

  const handleSubmitPurchase = async (e: FormEvent) => {
    e.preventDefault();
    if (!supplierId) {
      toast.error('Please select a supplier / distributor');
      return;
    }

    const invalidItem = items.find(
      (it) => !it.medicine_id || !it.batch_number || !it.expiry_date || Number(it.quantity) <= 0
    );
    if (invalidItem) {
      toast.error('Please ensure all items have medicine, batch #, expiry date, and quantity!');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        supplier_id: Number(supplierId),
        invoice_number: invoiceNumber || undefined,
        purchase_date: purchaseDate,
        subtotal,
        discount_amount: 0,
        tax_amount: 0,
        total_amount: totalAmount,
        paid_amount: Number(paidAmount) || 0,
        notes,
        items: items.map((it) => ({
          medicine_id: Number(it.medicine_id),
          batch_number: it.batch_number,
          expiry_date: it.expiry_date,
          unit_type: it.unit_type || 'Pack',
          pack_size: Number(it.pack_size) || 1,
          quantity: Number(it.quantity),
          bonus_quantity: Number(it.bonus_quantity) || 0,
          purchase_rate: Number(it.purchase_rate),
          sale_rate: Number(it.sale_rate),
          total_amount: it.total_amount,
        })),
      };

      await api.createPurchase(payload as any);
      toast.success('Purchase invoice recorded! Stock batches and supplier ledger updated.');
      refreshStats();
      loadHistory();
      setInvoiceNumber('');
      setPaidAmount('0');
      setNotes('');
      setItems([
        {
          medicine_id: '',
          batch_number: '',
          expiry_date: '',
          unit_type: 'Pack',
          pack_size: 1,
          quantity: 5,
          bonus_quantity: 0,
          purchase_rate: 0,
          sale_rate: 0,
          total_amount: 0,
        },
      ]);
      setActiveTab('HISTORY');
    } catch (err: any) {
      toast.error(err.message || 'Failed to record purchase');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="d-flex flex-column gap-3">
      {/* Top Header */}
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div>
          <h2 className="fs-4 fw-bold mb-0">Purchase Receiving & Stock In (GRN)</h2>
          <p className="small text-secondary mb-0">
            Receive medicine batches from distributors, assign expiry dates, and update supplier payable khata.
          </p>
        </div>

        <div className="d-flex gap-2">
          <Button
            variant={activeTab === 'NEW' ? 'primary' : 'outline'}
            onClick={() => setActiveTab('NEW')}
            className="d-inline-flex align-items-center"
          >
            <i className="bi bi-plus-circle me-1"></i> New Purchase Order
          </Button>
          <Button
            variant={activeTab === 'HISTORY' ? 'primary' : 'outline'}
            onClick={() => setActiveTab('HISTORY')}
            className="d-inline-flex align-items-center"
          >
            <i className="bi bi-clock-history me-1"></i> Purchase History
          </Button>
        </div>
      </div>

      {activeTab === 'NEW' ? (
        <form onSubmit={handleSubmitPurchase} className="d-flex flex-column gap-3">
          {/* Supplier & Invoice Header */}
          <div className="card shadow-sm border p-3">
            <div className="row g-3">
              <div className="col-12 col-md-4">
                <label className="form-label small fw-semibold mb-1">Supplier / Distributor *</label>
                <select
                  className="form-select"
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  required
                >
                  <option value="">Select Supplier...</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (Pending: {formatCurrency(s.current_balance || 0)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-12 col-md-3">
                <Input
                  label="Distributor Bill / Invoice #"
                  placeholder="Distributor invoice number..."
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                />
              </div>

              <div className="col-12 col-md-2">
                <Input
                  label="Purchase Date"
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  required
                />
              </div>

              <div className="col-12 col-md-3">
                <Input
                  label="Paid Now from Cash Drawer"
                  type="number"
                  min="0"
                  step="any"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  helperText={`Remaining ${formatCurrency(
                    Math.max(0, totalAmount - (Number(paidAmount) || 0))
                  )} added to Khata`}
                />
              </div>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="card shadow-sm border overflow-hidden">
            <div className="card-header bg-body-tertiary d-flex justify-content-between align-items-center py-2 px-3 border-bottom">
              <span className="fw-bold fs-6">Shipment Items & Batches ({items.length})</span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleAddItemRow}
                className="d-inline-flex align-items-center"
              >
                <i className="bi bi-plus-lg me-1"></i> Add Medicine Row
              </Button>
            </div>

            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0 small">
                <thead className="table-light">
                  <tr>
                    <th style={{ width: '22%' }}>Medicine & Pack Size</th>
                    <th style={{ width: '13%' }}>Batch #</th>
                    <th style={{ width: '12%' }}>Expiry Date</th>
                    <th style={{ width: '9%' }} className="text-center">Packaging</th>
                    <th style={{ width: '8%' }} className="text-center">Qty</th>
                    <th style={{ width: '8%' }} className="text-center">Bonus</th>
                    <th style={{ width: '10%' }} className="text-end">Cost Rate</th>
                    <th style={{ width: '10%' }} className="text-end">Sale (MRP)</th>
                    <th style={{ width: '14%' }} className="text-center">Stock Conversion</th>
                    <th className="text-end" style={{ width: '10%' }}>Item Total</th>
                    <th style={{ width: '4%' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row, idx) => {
                    const med = medicines.find((m) => String(m.id) === String(row.medicine_id));
                    const packSize = med?.pack_size || row.pack_size || 1;
                    const isPack = row.unit_type === 'Pack';
                    const multiplier = (isPack && packSize > 1) ? packSize : 1;
                    const totalUnitsAdded = (Number(row.quantity) + Number(row.bonus_quantity || 0)) * multiplier;
                    const unitCost = totalUnitsAdded > 0 ? (Number(row.total_amount) / totalUnitsAdded) : 0;

                    return (
                      <tr key={idx}>
                        {/* Medicine selection */}
                        <td>
                          <select
                            className="form-select form-select-sm mb-1"
                            value={row.medicine_id}
                            onChange={(e) => handleItemChange(idx, 'medicine_id', e.target.value)}
                            required
                          >
                            <option value="">Select Medicine...</option>
                            {medicines.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name} ({m.generic_name})
                              </option>
                            ))}
                          </select>
                          {med && (
                            <div className="d-flex align-items-center gap-1">
                              <span className="badge bg-body-secondary text-secondary border px-1 py-0" style={{ fontSize: '0.68rem' }}>
                                Pack of {packSize}
                              </span>
                              <span className="text-secondary" style={{ fontSize: '0.68rem' }}>
                                {med.category}
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Batch # */}
                        <td>
                          <input
                            type="text"
                            placeholder="Batch #"
                            className="form-control form-control-sm font-monospace"
                            value={row.batch_number}
                            onChange={(e) => handleItemChange(idx, 'batch_number', e.target.value)}
                            required
                          />
                        </td>

                        {/* Expiry */}
                        <td>
                          <input
                            type="date"
                            className="form-control form-control-sm"
                            value={row.expiry_date}
                            onChange={(e) => handleItemChange(idx, 'expiry_date', e.target.value)}
                            required
                          />
                        </td>

                        {/* Packaging mode toggle */}
                        <td className="text-center">
                          {packSize > 1 ? (
                            <div className="btn-group btn-group-sm" role="group">
                              <button
                                type="button"
                                className={`btn btn-sm py-0 px-1 ${row.unit_type === 'Pack' ? 'btn-primary' : 'btn-outline-secondary'}`}
                                style={{ fontSize: '0.68rem' }}
                                onClick={() => handleItemChange(idx, 'unit_type', 'Pack')}
                              >
                                Pack
                              </button>
                              <button
                                type="button"
                                className={`btn btn-sm py-0 px-1 ${row.unit_type === 'Loose' ? 'btn-primary' : 'btn-outline-secondary'}`}
                                style={{ fontSize: '0.68rem' }}
                                onClick={() => handleItemChange(idx, 'unit_type', 'Loose')}
                              >
                                Loose
                              </button>
                            </div>
                          ) : (
                            <span className="badge bg-light text-secondary border px-1">1 unit</span>
                          )}
                        </td>

                        {/* Quantity */}
                        <td>
                          <input
                            type="number"
                            min="1"
                            className="form-control form-control-sm text-center fw-bold"
                            value={row.quantity}
                            onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                            required
                          />
                        </td>

                        {/* Bonus Quantity */}
                        <td>
                          <input
                            type="number"
                            min="0"
                            className="form-control form-control-sm text-center"
                            value={row.bonus_quantity}
                            onChange={(e) => handleItemChange(idx, 'bonus_quantity', e.target.value)}
                            placeholder="0"
                          />
                        </td>

                        {/* Purchase Cost Rate */}
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            className="form-control form-control-sm text-end"
                            value={row.purchase_rate}
                            onChange={(e) => handleItemChange(idx, 'purchase_rate', e.target.value)}
                            placeholder="Rate"
                            required
                          />
                        </td>

                        {/* Sale MRP Rate */}
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            className="form-control form-control-sm text-end"
                            value={row.sale_rate}
                            onChange={(e) => handleItemChange(idx, 'sale_rate', e.target.value)}
                            placeholder="MRP"
                            required
                          />
                        </td>

                        {/* Real-time Stock Conversion Preview */}
                        <td className="text-center">
                          {row.medicine_id ? (
                            <div className="badge bg-success-subtle text-success border border-success-subtle px-2 py-1 d-inline-flex flex-column text-start" style={{ fontSize: '0.68rem' }}>
                              <span className="fw-bold">
                                <i className="bi bi-box-seam me-1"></i>+{totalUnitsAdded} base units
                              </span>
                              <span className="text-secondary" style={{ fontSize: '0.62rem' }}>
                                Cost: {formatCurrency(unitCost)} / u
                              </span>
                            </div>
                          ) : (
                            <span className="text-secondary">—</span>
                          )}
                        </td>

                        {/* Total Amount */}
                        <td className="text-end fw-bold text-primary font-monospace">
                          {formatCurrency(row.total_amount)}
                        </td>

                        {/* Remove Action */}
                        <td className="text-center">
                          <button
                            type="button"
                            className="btn btn-sm btn-link text-danger text-decoration-none p-0"
                            onClick={() => handleRemoveRow(idx)}
                            title="Remove row"
                          >
                            <i className="bi bi-x-lg"></i>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottom Summary Bar */}
          <div className="card shadow-sm border p-3">
            <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
              <div className="flex-grow-1" style={{ maxWidth: '420px' }}>
                <Input
                  placeholder="Shipment notes or Delivery Challan #..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  containerClassName="mb-0"
                />
              </div>

              <div className="d-flex align-items-center gap-3">
                <div className="text-end">
                  <div className="small text-secondary text-uppercase fw-semibold">Total Payable</div>
                  <div className="fs-4 fw-bold text-primary">{formatCurrency(totalAmount)}</div>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  loading={loading}
                  className="fw-bold d-inline-flex align-items-center"
                >
                  <i className="bi bi-check2-circle me-2"></i> Save & Stock In
                </Button>
              </div>
            </div>
          </div>
        </form>
      ) : (
        /* Purchase History */
        <div className="table-responsive border rounded shadow-sm bg-body">
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th>Invoice #</th>
                <th>Supplier</th>
                <th>Date</th>
                <th className="text-end">Total Amount</th>
                <th className="text-end">Paid Amount</th>
                <th className="text-center">Status</th>
                <th>Items Summary</th>
              </tr>
            </thead>
            <tbody>
              {purchasesHistory.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-5 text-secondary">
                    No purchase invoices recorded yet.
                  </td>
                </tr>
              ) : (
                purchasesHistory.map((p) => (
                  <tr key={p.id}>
                    <td className="fw-bold font-monospace">{p.invoice_number}</td>
                    <td>
                      <div className="fw-semibold">{p.supplier_name}</div>
                      <div className="small text-secondary">{p.supplier_phone}</div>
                    </td>
                    <td>{p.purchase_date}</td>
                    <td className="text-end fw-bold">{formatCurrency(p.total_amount)}</td>
                    <td className="text-end">{formatCurrency(p.paid_amount)}</td>
                    <td className="text-center">
                      <Badge
                        variant={
                          p.payment_status === 'PAID'
                            ? 'paid'
                            : p.payment_status === 'PARTIAL'
                            ? 'warning'
                            : 'expired'
                        }
                      >
                        {p.payment_status}
                      </Badge>
                    </td>
                    <td className="small text-secondary">
                      {(p.items || []).map((it: any) => `${it.medicine_name} (${it.quantity})`).join(', ')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
