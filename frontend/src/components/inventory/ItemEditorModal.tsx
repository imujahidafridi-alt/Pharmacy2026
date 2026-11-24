import React, { useState, useEffect, useRef } from 'react';
import { Medicine } from '../../types';
import { Modal } from '../ui/Modal';
import { CATEGORIES } from '../../utils/catalog';

interface ItemEditorModalProps {
  isOpen: boolean;
  medicine: Medicine | null; // null for Add, object for Edit
  onClose: () => void;
  onSave: (savedMed: Partial<Medicine>) => Promise<void>;
  existingGenerics?: string[];
}

export function ItemEditorModal({
  isOpen,
  medicine,
  onClose,
  onSave,
  existingGenerics = [],
}: ItemEditorModalProps) {
  const isEditMode = !!(medicine && medicine.id > 0);

  const [name, setName] = useState('');
  const [category, setCategory] = useState('Tablets & Capsules');
  const [brand, setBrand] = useState('');
  const [genericName, setGenericName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [code, setCode] = useState('');
  const [rackLocation, setRackLocation] = useState('');

  type StockRow = { key: number; quantity: string; batch: string; expiry: string };
  const newStockRow = (): StockRow => ({ key: Date.now() + Math.random(), quantity: '0', batch: '', expiry: '' });

  // Kept as strings so decimal typing and backspacing feel natural
  const [packSizeStr, setPackSizeStr] = useState('1');
  const [stockRows, setStockRows] = useState<StockRow[]>([newStockRow()]);
  const [costPriceStr, setCostPriceStr] = useState('0.00');
  const [mrpStr, setMrpStr] = useState('0.00');
  const [salePriceStr, setSalePriceStr] = useState('0.00');
  const [minStockStr, setMinStockStr] = useState('10');
  const [isRx, setIsRx] = useState(false);
  const [saleAutoFilled, setSaleAutoFilled] = useState(false);

  const [showHelp, setShowHelp] = useState(false);
  const [addAndNext, setAddAndNext] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  const fillForm = (med: Medicine | null) => {
    if (med && med.id > 0) {
      setName(med.name || '');
      setCategory(med.category || 'Tablets & Capsules');
      setBrand(med.brand || med.manufacturer || '');
      setGenericName(med.generic_name || '');
      setBarcode(med.barcode || '');
      setCode(med.code || '');
      setRackLocation(med.rack_location || '');
      const size = Number(med.pack_size || med.pieces_per_strip || 1);
      setPackSizeStr(String(size > 0 ? size : 1));
      const cost = Number(med.cost_price || 0);
      const sale = Number(med.sale_price || med.min_sale_rate || 0);
      const mrp = Number(med.mrp || sale);
      setCostPriceStr(cost > 0 ? cost.toFixed(2) : '0.00');
      setMrpStr(mrp > 0 ? mrp.toFixed(2) : '0.00');
      setSalePriceStr(sale > 0 ? sale.toFixed(2) : '0.00');
      setMinStockStr(String(med.min_stock_alert ?? 10));
      setStockRows([newStockRow()]);
      setIsRx(!!med.is_prescription_required);
    } else {
      setName('');
      setCategory('Tablets & Capsules');
      setBrand('');
      setGenericName('');
      setBarcode('');
      setCode('');
      setRackLocation('');
      setPackSizeStr('1');
      setStockRows([newStockRow()]);
      setCostPriceStr('0.00');
      setMrpStr('0.00');
      setSalePriceStr('0.00');
      setMinStockStr('10');
      setIsRx(false);
    }
    setSaleAutoFilled(false);
    setShowHelp(false);
    setErrorMessage('');
  };

  useEffect(() => {
    if (!isOpen) return;
    fillForm(medicine);
    const timer = window.setTimeout(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }, 60);
    return () => window.clearTimeout(timer);
  }, [isOpen, medicine]);

  // Price basis: TP and MRP are per pack; sale is per base unit
  const numMrp = parseFloat(mrpStr) || 0;
  const numSale = parseFloat(salePriceStr) || 0;
  const numCost = parseFloat(costPriceStr) || 0;
  const numPack = parseInt(packSizeStr, 10) || 1;
  const costPerUnit = numPack > 0 ? numCost / numPack : numCost;
  const mrpPerUnit = numPack > 0 ? numMrp / numPack : numMrp;
  const salePerPack = numSale * numPack;
  const storeProfitRs = numSale > costPerUnit && costPerUnit > 0 ? numSale - costPerUnit : 0;
  const storeMarginPct = numSale > 0 && storeProfitRs > 0 ? (storeProfitRs / numSale) * 100 : 0;
  const isBelowCost = numSale > 0 && costPerUnit > 0 && numSale < costPerUnit;
  const isAboveMrp = numMrp > 0 && salePerPack > numMrp;

  const autoFillSaleFromMrp = (mrpValue: string, packValue: string) => {
    const unitRate = Number(mrpValue) / (parseInt(packValue, 10) || 1);
    setSalePriceStr(unitRate > 0 ? unitRate.toFixed(2) : '0.00');
    setSaleAutoFilled(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage('');

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMessage('Please enter the item name.');
      nameInputRef.current?.focus();
      return;
    }
    const costVal = parseFloat(costPriceStr) || 0;
    const mrpVal = parseFloat(mrpStr) || 0;
    const saleVal = parseFloat(salePriceStr) || 0;
    const packVal = parseInt(packSizeStr, 10) || 1;
    const alertVal = parseInt(minStockStr, 10) || 0;
    const openingRows = stockRows
      .map((row) => ({
        quantity: parseInt(row.quantity, 10) || 0,
        batch_number: row.batch.trim(),
        expiry_date: row.expiry,
      }))
      .filter((row) => row.quantity > 0);
    const initialStock = openingRows.reduce((total, row) => total + row.quantity, 0);

    if (costVal < 0 || saleVal < 0 || mrpVal < 0) {
      setErrorMessage('Prices cannot be less than zero.');
      return;
    }
    if (packVal < 1) {
      setErrorMessage('Packing must be at least 1 unit.');
      return;
    }
    if (saleVal > 0 && costVal > 0 && saleVal < costVal / packVal - 0.001) {
      setErrorMessage(
        `Sale rate (Rs. ${saleVal.toFixed(2)} per unit) is less than the purchase cost (Rs. ${(costVal / packVal).toFixed(2)} per unit).`
      );
      return;
    }
    if (mrpVal > 0 && saleVal * packVal > mrpVal + 0.001) {
      setErrorMessage(
        `A full pack at Rs. ${(saleVal * packVal).toFixed(2)} is higher than the printed MRP Rs. ${mrpVal.toFixed(2)}.`
      );
      return;
    }

    setSaving(true);
    try {
      const payload: Partial<Medicine> = {
        name: trimmedName,
        category,
        brand: brand.trim(),
        manufacturer: brand.trim(),
        generic_name: genericName.trim(),
        barcode: barcode.trim(),
        code: code.trim() || undefined,
        rack_location: rackLocation.trim(),
        pack_size: packVal,
        pieces_per_strip: packVal,
        strips_per_box: 1,
        cost_price: costVal,
        mrp: mrpVal > 0 ? mrpVal : saleVal,
        sale_price: saleVal > 0 ? saleVal : mrpVal,
        strip_sale_price: saleVal,
        box_sale_price: Number((saleVal * packVal).toFixed(2)),
        min_stock_alert: alertVal,
        is_prescription_required: isRx ? 1 : 0,
        is_active: 1,
        initial_stock: initialStock,
        opening_batches: openingRows,
      };
      await onSave(payload);

      if (addAndNext && !isEditMode) {
        fillForm(null);
        window.setTimeout(() => {
          nameInputRef.current?.focus();
          nameInputRef.current?.select();
        }, 60);
      } else {
        onClose();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Could not save this item. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const row = (label: string, control: React.ReactNode, hint?: string, required = false) => (
    <div className="desktop-form-row">
      <label className="desktop-form-label" style={{ width: '140px', minWidth: '140px', fontSize: '11px' }}>
        {label} {required && <span className="text-danger">*</span>}
      </label>
      <div className="desktop-form-control d-flex align-items-center gap-2 flex-wrap">
        {control}
        {hint && <span className="small text-muted" style={{ fontSize: '10.5px' }}>{hint}</span>}
      </div>
    </div>
  );

  const textInput = (
    value: string,
    onChange: (value: string) => void,
    placeholder: string,
    width = 190,
    extra?: React.InputHTMLAttributes<HTMLInputElement> & { ref?: React.Ref<HTMLInputElement> }
  ) => (
    <input
      type="text"
      className="form-control form-control-sm"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: `${width}px`,
        backgroundColor: 'var(--input-bg)',
        borderColor: 'var(--input-border)',
        color: 'var(--input-text)',
        fontSize: '12px',
      }}
      {...extra}
    />
  );

  const sectionTitle = (icon: string, label: string, action?: React.ReactNode) => (
    <div className="d-flex align-items-center justify-content-between mb-2">
      <span className="fw-bold text-uppercase" style={{ color: 'var(--brand-teal)', fontSize: '10.5px', letterSpacing: '0.08em' }}>
        <i className={`bi ${icon} me-1`}></i>{label}
      </span>
      {action}
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <span className="d-flex align-items-center gap-2">
          <i className={`bi ${isEditMode ? 'bi-pencil-square' : 'bi-plus-circle'}`}></i>
          <span>{isEditMode ? `Edit ${medicine?.name || 'Item'}` : 'Add a New Item'}</span>
        </span>
      }
      maxWidth="960px"
      footer={
        <div className="d-flex justify-content-between align-items-center w-100">
          <label className="form-check mb-0 small" style={{ fontSize: '11.5px' }}>
            <input
              className="form-check-input"
              type="checkbox"
              checked={addAndNext}
              onChange={(e) => setAddAndNext(e.target.checked)}
              disabled={isEditMode}
            />
            <span className="form-check-label">Add &amp; Next (keep form open)</span>
          </label>
          <div className="d-flex gap-2">
            <button type="button" className="btn btn-sm secondaryBtn px-3" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" form="item-editor-form" className="btn btn-sm text-white px-4 fw-bold" disabled={saving}
              style={{ backgroundColor: '#0F766E', borderColor: '#0F766E', height: '30px', fontSize: '12px' }}>
              {saving ? 'Saving…' : isEditMode ? 'Save Changes' : addAndNext ? 'Add & Next' : 'Add Item'}
            </button>
          </div>
        </div>
      }
    >
      <form id="item-editor-form" onSubmit={handleSubmit} style={{ fontSize: '12px' }}>
        {errorMessage && (
          <div className="alert alert-danger py-2 px-3 mb-2 d-flex justify-content-between align-items-center" style={{ fontSize: '12px' }}>
            <span><i className="bi bi-exclamation-triangle me-1"></i>{errorMessage}</span>
            <button type="button" className="btn-close btn-close-sm" onClick={() => setErrorMessage('')} aria-label="Dismiss"></button>
          </div>
        )}

        <div className="row g-3">
          {/* LEFT — item details */}
          <div className="col-md-6">
            {sectionTitle('bi-card-text', 'Item Details')}

            {row('Item Name & Strength', textInput(name, setName, 'e.g. Panadol 500mg', 250, { ref: nameInputRef, required: true }), 'name on box', true)}
            {row('Generic / Salt', textInput(genericName, setGenericName, 'e.g. Paracetamol', 220, { list: 'genericList' }), 'for substitutes')}
            <datalist id="genericList">
              {existingGenerics.map((generic, index) => <option key={index} value={generic} />)}
            </datalist>
            {row('Brand / Company', textInput(brand, setBrand, 'e.g. GSK Pakistan', 220), 'optional')}

            <div className="row g-2 mt-1">
              <div className="col-7">
                <label className="form-label small fw-semibold mb-1">Category</label>
                <select className="form-select form-select-sm" value={category} onChange={(e) => setCategory(e.target.value)}
                  style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--input-border)', color: 'var(--input-text)' }}>
                  {CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              <div className="col-5">
                <label className="form-label small fw-semibold mb-1">Shelf / Rack</label>
                {textInput(rackLocation, (v) => setRackLocation(v.toUpperCase()), 'e.g. A-01', 140)}
              </div>
            </div>

            <div className="mt-2">
              {row('Barcode', textInput(barcode, setBarcode, 'scan or type', 220), 'optional')}
              {row('Item Code', textInput(code, setCode, 'auto if blank', 180), 'optional')}
            </div>
          </div>

          {/* RIGHT — packing, prices, stock */}
          <div className="col-md-6">
            {sectionTitle(
              'bi-cash-coin',
              'Packing & Prices',
              <button type="button" className="btn btn-sm btn-link p-0 text-decoration-none"
                onClick={() => setShowHelp((value) => !value)} title="How prices work">
                <i className="bi bi-question-circle"></i> <span style={{ fontSize: '10.5px' }}>Prices</span>
              </button>
            )}

            {showHelp && (
              <div className="alert alert-info py-2 px-3 mb-2" style={{ fontSize: '11px' }}>
                TP and MRP are for <strong>one full pack</strong>. Sale rate is for <strong>one base unit</strong>. Pack size converts between them.
              </div>
            )}

            {row('Pack Size', textInput(packSizeStr, (v) => {
              const clean = v.replace(/[^0-9]/g, '');
              setPackSizeStr(clean);
              if (saleAutoFilled && mrpStr) autoFillSaleFromMrp(mrpStr, clean);
            }, '10', 80, { inputMode: 'numeric' }), 'units per pack', true)}

            {row('Cost / TP', textInput(costPriceStr, (v) => setCostPriceStr(v.replace(/[^0-9.]/g, '')), '0.00', 110, { inputMode: 'decimal' }), `per pack · ${costPerUnit.toFixed(2)}/unit`)}
            {row('MRP', textInput(mrpStr, (v) => {
              setMrpStr(v.replace(/[^0-9.]/g, ''));
              if (!isEditMode && (!salePriceStr || salePriceStr === '0.00' || saleAutoFilled)) autoFillSaleFromMrp(v, packSizeStr);
            }, '0.00', 110, { inputMode: 'decimal' }), `per pack · ${mrpPerUnit.toFixed(2)}/unit`, true)}
            {row('Sale Rate', textInput(salePriceStr, (v) => {
              setSalePriceStr(v.replace(/[^0-9.]/g, ''));
              setSaleAutoFilled(false);
            }, '0.00', 110, { inputMode: 'decimal' }), `per unit · ${salePerPack.toFixed(2)}/pack`, true)}

            <div className="d-flex flex-wrap gap-1 mt-1">
              {storeProfitRs > 0 && (
                <span className="badge bg-success-subtle text-success border px-2 py-1" style={{ fontSize: '10px' }}>
                  Profit {storeProfitRs.toFixed(2)}/unit ({storeMarginPct.toFixed(1)}%)
                </span>
              )}
              {isBelowCost && (
                <span className="badge text-bg-danger px-2 py-1" style={{ fontSize: '10px' }}>Below cost</span>
              )}
              {isAboveMrp && (
                <span className="badge text-bg-warning px-2 py-1" style={{ fontSize: '10px' }}>Above MRP</span>
              )}
            </div>

            <hr className="my-2" />
            {sectionTitle('bi-box-seam', 'Opening Stock (optional)')}

            {isEditMode ? (
              <div className="alert alert-secondary py-2 px-3 mb-0" style={{ fontSize: '10.5px' }}>
                <i className="bi bi-shield-check me-1"></i>
                Stock is changed with <strong>Adjust Stock</strong>, not here.
                {medicine?.created_at ? <> Added {new Date(medicine.created_at).toLocaleDateString()}.</> : null}
              </div>
            ) : (
              <div className="d-flex flex-column gap-2">
                {stockRows.map((row) => (
                  <div key={row.key} className="d-flex align-items-end gap-2">
                    <div style={{ width: '86px', flexShrink: 0 }}>
                      <label className="form-label small fw-semibold mb-1" style={{ fontSize: '10px' }}>Quantity</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="form-control form-control-sm"
                        placeholder="0"
                        value={row.quantity}
                        onChange={(e) => setStockRows((prev) => prev.map((r) =>
                          r.key === row.key ? { ...r, quantity: e.target.value.replace(/[^0-9]/g, '') } : r))}
                        style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--input-border)', color: 'var(--input-text)', fontSize: '11px' }}
                      />
                    </div>
                    <div className="flex-grow-1">
                      <label className="form-label small fw-semibold mb-1" style={{ fontSize: '10px' }}>Batch (optional)</label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        placeholder="auto if blank"
                        value={row.batch}
                        onChange={(e) => setStockRows((prev) => prev.map((r) =>
                          r.key === row.key ? { ...r, batch: e.target.value } : r))}
                        style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--input-border)', color: 'var(--input-text)', fontSize: '11px' }}
                      />
                    </div>
                    <div style={{ width: '152px', flexShrink: 0 }}>
                      <label className="form-label small fw-semibold mb-1" style={{ fontSize: '10px' }}>Expiry (optional)</label>
                      <input
                        type="date"
                        className="form-control form-control-sm"
                        value={row.expiry}
                        onChange={(e) => setStockRows((prev) => prev.map((r) =>
                          r.key === row.key ? { ...r, expiry: e.target.value } : r))}
                        style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--input-border)', color: 'var(--input-text)', fontSize: '11px' }}
                      />
                    </div>
                    {stockRows.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-sm btn-link text-danger p-1"
                        title="Remove this batch"
                        onClick={() => setStockRows((prev) => prev.filter((r) => r.key !== row.key))}
                        style={{ fontSize: '13px' }}
                      >
                        <i className="bi bi-x-circle"></i>
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary align-self-start py-0 px-2"
                  style={{ fontSize: '10.5px', height: '24px' }}
                  onClick={() => setStockRows((prev) => [...prev, newStockRow()])}
                >
                  <i className="bi bi-plus-circle me-1"></i>Add another batch
                </button>
              </div>
            )}

            <div className="row g-2 mt-2 align-items-end">
              <div className="col-4">
                <label className="form-label small fw-semibold mb-1">Low Stock Alert</label>
                <div className="d-flex align-items-center gap-2">
                  {textInput(minStockStr, (v) => setMinStockStr(v.replace(/[^0-9]/g, '')), '10', 75, { inputMode: 'numeric' })}
                  <span className="small text-muted" style={{ fontSize: '10px' }}>units</span>
                </div>
              </div>
              <div className="col-8">
                <div className="form-check form-switch mb-1">
                  <input className="form-check-input" type="checkbox" id="rxSwitch" checked={isRx} onChange={(e) => setIsRx(e.target.checked)} />
                  <label className="form-check-label small fw-semibold" htmlFor="rxSwitch" style={{ fontSize: '11px' }}>Prescription required (Rx)</label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default ItemEditorModal;
