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

  // Kept as strings so decimal typing and backspacing feel natural
  const [packSizeStr, setPackSizeStr] = useState('1');
  const [initialStockStr, setInitialStockStr] = useState('0');
  const [costPriceStr, setCostPriceStr] = useState('0.00');
  const [mrpStr, setMrpStr] = useState('0.00');
  const [salePriceStr, setSalePriceStr] = useState('0.00');
  const [minStockStr, setMinStockStr] = useState('10');
  const [batchNumber, setBatchNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [isRx, setIsRx] = useState(false);
  const [saleAutoFilled, setSaleAutoFilled] = useState(false);

  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMessage('');

    if (medicine && medicine.id > 0) {
      setName(medicine.name || '');
      setCategory(medicine.category || 'Tablets & Capsules');
      setBrand(medicine.brand || medicine.manufacturer || '');
      setGenericName(medicine.generic_name || '');
      setBarcode(medicine.barcode || '');
      setCode(medicine.code || '');
      setRackLocation(medicine.rack_location || '');
      const size = Number(medicine.pack_size || medicine.pieces_per_strip || 1);
      setPackSizeStr(String(size > 0 ? size : 1));
      setInitialStockStr('0');
      const cost = Number(medicine.cost_price || 0);
      const sale = Number(medicine.sale_price || medicine.min_sale_rate || 0);
      const mrp = Number(medicine.mrp || sale);
      setCostPriceStr(cost > 0 ? cost.toFixed(2) : '0.00');
      setMrpStr(mrp > 0 ? mrp.toFixed(2) : '0.00');
      setSalePriceStr(sale > 0 ? sale.toFixed(2) : '0.00');
      setMinStockStr(String(medicine.min_stock_alert ?? 10));
      setBatchNumber('');
      setExpiryDate('');
      setIsRx(!!medicine.is_prescription_required);
      setSaleAutoFilled(false);
    } else {
      setName('');
      setCategory('Tablets & Capsules');
      setBrand('');
      setGenericName('');
      setBarcode('');
      setCode('');
      setRackLocation('');
      setPackSizeStr('1');
      setInitialStockStr('0');
      setCostPriceStr('0.00');
      setMrpStr('0.00');
      setSalePriceStr('0.00');
      setMinStockStr('10');
      setBatchNumber('');
      setExpiryDate('');
      setIsRx(false);
      setSaleAutoFilled(false);
    }

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
    const initialStock = parseInt(initialStockStr, 10) || 0;
    const alertVal = parseInt(minStockStr, 10) || 0;

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
        batch_number: batchNumber.trim(),
        expiry_date: expiryDate,
      };
      await onSave(payload);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Could not save this item. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const row = (label: string, control: React.ReactNode, hint?: string, required = false) => (
    <div className="desktop-form-row">
      <label className="desktop-form-label">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      <div className="desktop-form-control d-flex align-items-center gap-2 flex-wrap">
        {control}
        {hint && <span className="small text-muted" style={{ fontSize: '11px' }}>{hint}</span>}
      </div>
    </div>
  );

  const textInput = (
    value: string,
    onChange: (value: string) => void,
    placeholder: string,
    width = 200,
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
      maxWidth="780px"
      footer={
        <div className="d-flex justify-content-end gap-2 w-100">
          <button type="button" className="btn btn-sm secondaryBtn px-3" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" form="item-editor-form" className="btn btn-sm text-white px-4 fw-bold" disabled={saving}
            style={{ backgroundColor: '#0F766E', borderColor: '#0F766E', height: '30px', fontSize: '12px' }}>
            {saving ? 'Saving…' : isEditMode ? 'Save Changes' : 'Add Item'}
          </button>
        </div>
      }
    >
      <form id="item-editor-form" onSubmit={handleSubmit} className="d-flex flex-column gap-2" style={{ fontSize: '12px' }}>
        <div className="alert alert-info py-2 px-3 mb-1" style={{ fontSize: '11.5px' }}>
          <div className="fw-bold mb-1"><i className="bi bi-info-circle me-1"></i> How prices work</div>
          <div><strong>Cost (TP)</strong> and <strong>MRP</strong> are for <strong>one full pack</strong>. <strong>Sale rate</strong> is for <strong>one tablet / capsule</strong> at the counter.</div>
          <div className="mt-1">Example: a strip of 14 tablets — TP Rs 140, MRP Rs 200, Sale Rs 12 per tablet (Rs 168 per strip).</div>
        </div>

        {errorMessage && (
          <div className="alert alert-danger py-2 px-3 mb-0 d-flex justify-content-between align-items-center" style={{ fontSize: '12px' }}>
            <span><i className="bi bi-exclamation-triangle me-1"></i>{errorMessage}</span>
            <button type="button" className="btn-close btn-close-sm" onClick={() => setErrorMessage('')} aria-label="Dismiss"></button>
          </div>
        )}

        {row('Item Name & Strength', textInput(name, setName, 'e.g. Panadol 500mg Tablets', 320, { ref: nameInputRef, required: true }), 'Write the name printed on the box', true)}
        {row('Generic / Salt', textInput(genericName, setGenericName, 'e.g. Paracetamol', 250, { list: 'genericList' }), 'Helps staff find substitutes')}
        <datalist id="genericList">
          {existingGenerics.map((generic, index) => <option key={index} value={generic} />)}
        </datalist>
        {row('Brand / Company', textInput(brand, setBrand, 'e.g. GSK Pakistan', 250), 'Optional')}

        <div className="row g-2">
          <div className="col-md-6">
            <label className="form-label small fw-semibold mb-1">Category</label>
            <select className="form-select form-select-sm" value={category} onChange={(e) => setCategory(e.target.value)}
              style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--input-border)', color: 'var(--input-text)' }}>
              {CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>
          <div className="col-md-6">
            <label className="form-label small fw-semibold mb-1">Shelf / Rack</label>
            {textInput(rackLocation, (v) => setRackLocation(v.toUpperCase()), 'e.g. A-01', 200)}
          </div>
        </div>

        {row('Barcode', textInput(barcode, setBarcode, 'Scan or type barcode', 220), 'Optional, but needed for scanner sales')}
        {row('Item Code', textInput(code, setCode, 'Auto if left blank', 180), 'Optional')}

        <hr className="my-1" />
        <div className="small fw-bold text-uppercase" style={{ color: 'var(--brand-teal)', fontSize: '10.5px' }}>Packing &amp; Prices</div>

        {row('Pack Size', textInput(packSizeStr, (v) => {
          const clean = v.replace(/[^0-9]/g, '');
          setPackSizeStr(clean);
          if (saleAutoFilled && mrpStr) autoFillSaleFromMrp(mrpStr, clean);
        }, '10', 90, { inputMode: 'numeric' }), 'Small units in one pack (e.g. 14 for a 2×7 strip)', true)}

        {row('Cost / TP (per pack)', textInput(costPriceStr, (v) => setCostPriceStr(v.replace(/[^0-9.]/g, '')), '0.00', 120, { inputMode: 'decimal' }), `Rs. ${costPerUnit.toFixed(2)} per unit`)}

        {row('MRP (per pack)', textInput(mrpStr, (v) => {
          setMrpStr(v.replace(/[^0-9.]/g, ''));
          if (!isEditMode && (!salePriceStr || salePriceStr === '0.00' || saleAutoFilled)) autoFillSaleFromMrp(v, packSizeStr);
        }, '0.00', 120, { inputMode: 'decimal' }), `Rs. ${mrpPerUnit.toFixed(2)} per unit`, true)}

        {row('Sale Rate (per unit)', textInput(salePriceStr, (v) => {
          setSalePriceStr(v.replace(/[^0-9.]/g, ''));
          setSaleAutoFilled(false);
        }, '0.00', 120, { inputMode: 'decimal' }), `Rs. ${salePerPack.toFixed(2)} for a full pack`, true)}

        <div className="d-flex flex-wrap gap-2 mb-1">
          {storeProfitRs > 0 && (
            <span className="badge bg-success-subtle text-success border px-2 py-1">
              Profit Rs. {storeProfitRs.toFixed(2)} per unit ({storeMarginPct.toFixed(1)}%)
            </span>
          )}
          {isBelowCost && (
            <span className="badge text-bg-danger px-2 py-1">
              Sale is below cost — you will lose money on each unit
            </span>
          )}
          {isAboveMrp && (
            <span className="badge text-bg-warning px-2 py-1">
              Full-pack sale is higher than printed MRP
            </span>
          )}
        </div>

        {isEditMode ? (
          <div className="alert alert-secondary py-2 px-3 mb-0" style={{ fontSize: '11px' }}>
            <i className="bi bi-shield-check me-1"></i>
            Stock is not changed here. Use <strong>Adjust Stock</strong> in the Items list so each change is recorded.
            {medicine?.created_at ? <> Added on {new Date(medicine.created_at).toLocaleDateString()}.</> : null}
          </div>
        ) : (
          <>
            <hr className="my-1" />
            <div className="small fw-bold text-uppercase" style={{ color: 'var(--brand-teal)', fontSize: '10.5px' }}>Opening Stock (optional)</div>
            <div className="alert alert-light py-2 px-3 mb-1" style={{ fontSize: '11px' }}>
              Enter how many loose units you have now. <strong>Batch number and expiry are optional</strong> — if you leave them blank, a default batch is created so the item can be sold. You can fill in the real details later from <strong>Batches</strong>. Leave stock at 0 if you will add it through Purchases / GRN.
            </div>
            <div className="row g-2">
              <div className="col-md-4">
                <label className="form-label small fw-semibold mb-1">Loose Units Now</label>
                {textInput(initialStockStr, (v) => setInitialStockStr(v.replace(/[^0-9]/g, '')), '0', 110, { inputMode: 'numeric' })}
              </div>
              <div className="col-md-4">
                <label className="form-label small fw-semibold mb-1">Batch Number</label>
                {textInput(batchNumber, setBatchNumber, 'e.g. AUG-2626-A', 180)}
              </div>
              <div className="col-md-4">
                <label className="form-label small fw-semibold mb-1">Expiry Date</label>
                <input type="date" className="form-control form-control-sm" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)}
                  style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--input-border)', color: 'var(--input-text)' }} />
              </div>
            </div>
          </>
        )}

        <hr className="my-1" />
        <div className="row g-2">
          <div className="col-md-4">
            <label className="form-label small fw-semibold mb-1">Low Stock Alert</label>
            <div className="d-flex align-items-center gap-2">
              {textInput(minStockStr, (v) => setMinStockStr(v.replace(/[^0-9]/g, '')), '10', 80, { inputMode: 'numeric' })}
              <span className="small text-muted">base units</span>
            </div>
          </div>
          <div className="col-md-8 d-flex align-items-center">
            <div className="form-check form-switch">
              <input className="form-check-input" type="checkbox" id="rxSwitch" checked={isRx} onChange={(e) => setIsRx(e.target.checked)} />
              <label className="form-check-label small fw-semibold" htmlFor="rxSwitch">Prescription required (Rx)</label>
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default ItemEditorModal;
