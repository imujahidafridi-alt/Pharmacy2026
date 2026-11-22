import React, { useState, useEffect, useRef } from 'react';
import { Medicine } from '../../types';

interface ItemEditorModalProps {
  isOpen: boolean;
  medicine: Medicine | null; // null for Add, object for Edit
  onClose: () => void;
  onSave: (savedMed: Partial<Medicine>) => Promise<void>;
  existingGenerics?: string[];
}

const CATEGORIES = [
  'Tablets & Capsules',
  'Syrups & Suspensions',
  'Injections & Infusions',
  'Creams & Ointments',
  'Baby Care',
  'Personal Care',
  'Beverages & Nutrition',
  'General Retail / First Aid',
];

export function ItemEditorModal({
  isOpen,
  medicine,
  onClose,
  onSave,
  existingGenerics = [],
}: ItemEditorModalProps) {
  const isEditMode = !!(medicine && medicine.id > 0);

  // Core Form Fields
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Tablets & Capsules');
  const [brand, setBrand] = useState('');
  const [genericName, setGenericName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [code, setCode] = useState('');
  const [rackLocation, setRackLocation] = useState('');

  // Native String States for robust digit typing and backspacing
  const [packSizeStr, setPackSizeStr] = useState<string>('1');
  const [currentStockStr, setCurrentStockStr] = useState<string>('0');
  const [costPriceStr, setCostPriceStr] = useState<string>('0.00');
  const [mrpStr, setMrpStr] = useState<string>('0.00');
  const [salePriceStr, setSalePriceStr] = useState<string>('0.00');
  const [minStockStr, setMinStockStr] = useState<string>('10');
  const [isRx, setIsRx] = useState(false);

  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const nameInputRef = useRef<HTMLInputElement>(null);

  // Initialize or reset form when modal opens
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

      const pSize = Number(medicine.pack_size || medicine.pieces_per_strip || 1);
      setPackSizeStr(String(pSize > 0 ? pSize : 1));

      const stock = Number(medicine.total_stock ?? (medicine as any).current_stock ?? 0);
      setCurrentStockStr(String(stock >= 0 ? stock : 0));

      const cost = Number(medicine.cost_price || (medicine as any).tp || medicine.min_purchase_rate || 0);
      const sale = Number(medicine.sale_price || medicine.min_sale_rate || 0);
      const retailMrp = Number(medicine.mrp || sale);

      setCostPriceStr(cost > 0 ? cost.toFixed(2) : '0.00');
      setMrpStr(retailMrp > 0 ? retailMrp.toFixed(2) : '0.00');
      setSalePriceStr(sale > 0 ? sale.toFixed(2) : '0.00');
      setMinStockStr(String(medicine.min_stock_alert ?? 10));
      setIsRx(!!medicine.is_prescription_required);
    } else {
      // Defaults for New Item
      setName('');
      setCategory('Tablets & Capsules');
      setBrand('');
      setGenericName('');
      setBarcode('');
      setCode('');
      setRackLocation('');
      setPackSizeStr('1');
      setCurrentStockStr('0');
      setCostPriceStr('0.00');
      setMrpStr('0.00');
      setSalePriceStr('0.00');
      setMinStockStr('10');
      setIsRx(false);
    }

    if (isOpen) {
      document.body.classList.add('modal-open');
    }

    const timer = setTimeout(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }, 60);

    return () => {
      clearTimeout(timer);
      document.body.classList.remove('modal-open');
    };
  }, [isOpen, medicine]);

  if (!isOpen) return null;

  // Price basis: COST (TP) and MRP are per pack; SALE is per base unit.
  // Pack size converts between the purchase basis and the selling basis.
  const numMrp = parseFloat(mrpStr) || 0;
  const numSale = parseFloat(salePriceStr) || 0;
  const numCost = parseFloat(costPriceStr) || 0;
  const numPack = parseInt(packSizeStr, 10) || 1;

  const costPerUnit = numPack > 0 ? numCost / numPack : numCost;
  const mrpPerUnit = numPack > 0 ? numMrp / numPack : numMrp;
  const salePerPack = numSale * numPack;

  const customerDiscountRs = mrpPerUnit > numSale && numSale > 0 ? mrpPerUnit - numSale : 0;
  const customerDiscountPct = mrpPerUnit > 0 && customerDiscountRs > 0 ? (customerDiscountRs / mrpPerUnit) * 100 : 0;

  const storeProfitRs = numSale > costPerUnit && costPerUnit > 0 ? numSale - costPerUnit : 0;
  const storeMarginPct = numSale > 0 && storeProfitRs > 0 ? (storeProfitRs / numSale) * 100 : 0;

  const isBelowCost = numSale > 0 && costPerUnit > 0 && numSale < costPerUnit;
  const isAboveMrp = numMrp > 0 && salePerPack > numMrp;

  // Handle Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMessage('Item name is required.');
      nameInputRef.current?.focus();
      return;
    }

    const costVal = parseFloat(costPriceStr) || 0;
    const mrpVal = parseFloat(mrpStr) || 0;
    const saleVal = parseFloat(salePriceStr) || 0;
    const packVal = parseInt(packSizeStr, 10) || 1;
    const stockVal = parseInt(currentStockStr, 10);
    const cleanStock = isNaN(stockVal) || stockVal < 0 ? 0 : stockVal;
    const alertVal = parseInt(minStockStr, 10) || 10;

    if (costVal < 0 || saleVal < 0 || mrpVal < 0) {
      setErrorMessage('Prices cannot be negative.');
      return;
    }

    if (packVal < 1) {
      setErrorMessage('Pack size must be at least 1.');
      return;
    }

    // Cost/TP is per pack, sale is per base unit. Compare on the same basis.
    const costPerUnitPrice = packVal > 0 ? costVal / packVal : costVal;
    if (saleVal > 0 && costPerUnitPrice > 0 && saleVal < costPerUnitPrice) {
      setErrorMessage(
        `Sale price (Rs. ${saleVal.toFixed(2)}/unit) is below purchase cost (Rs. ${costPerUnitPrice.toFixed(2)}/unit).`
      );
      return;
    }
    if (mrpVal > 0 && saleVal * packVal > mrpVal + 0.001) {
      setErrorMessage(
        `Sale price per pack (Rs. ${(saleVal * packVal).toFixed(2)}) exceeds MRP (Rs. ${mrpVal.toFixed(2)}).`
      );
      return;
    }

    setSaving(true);
    try {
      const payload: Partial<Medicine> = {
        ...(medicine?.id ? { id: medicine.id } : {}),
        name: trimmedName,
        category,
        brand: brand.trim(),
        manufacturer: brand.trim(),
        generic_name: genericName.trim(),
        barcode: barcode.trim(),
        code: code.trim() || undefined,
        rack_location: rackLocation.trim(),
        pack_size: packVal,
        current_stock: cleanStock,
        total_stock: cleanStock,
        cost_price: costVal,
        mrp: mrpVal > 0 ? mrpVal : saleVal,
        sale_price: saleVal > 0 ? saleVal : mrpVal,
        min_stock_alert: alertVal >= 0 ? alertVal : 10,
        is_prescription_required: isRx ? 1 : 0,
        is_active: 1,
        // Backwards compatibility mappings for older database queries
        pieces_per_strip: packVal,
        strips_per_box: 1,
        strip_sale_price: saleVal,
        box_sale_price: Number((saleVal * packVal).toFixed(2)),
      };

      await onSave(payload);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save item.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="modal fade show d-block"
      tabIndex={-1}
      role="dialog"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        zIndex: 1060,
        backdropFilter: 'blur(2px)',
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        className="modal-dialog modal-dialog-centered modal-lg"
        role="document"
        style={{ maxWidth: '780px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="modal-content shadow-lg border"
          style={{
            backgroundColor: 'var(--surface-bg)',
            borderColor: 'var(--border-color)',
            color: 'var(--text-primary)',
            borderRadius: '4px',
            overflow: 'hidden',
          }}
        >
          {/* Native Desktop Window Header */}
          <div
            className="modal-header py-2 px-3 d-flex align-items-center justify-content-between"
            style={{
              backgroundColor: 'var(--surface-subtle)',
              borderBottom: '1px solid var(--border-color)',
            }}
          >
            <div className="d-flex align-items-center gap-2">
              <span style={{ fontSize: '15px' }}>{isEditMode ? '✏️' : '💊'}</span>
              <h5 className="modal-title mb-0 fw-bold" style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                {isEditMode ? `Edit Medicine Item: ${medicine?.name}` : 'New Medicine Master (Base-Unit System)'}
              </h5>
            </div>
            <button
              type="button"
              className="btn-close"
              aria-label="Close"
              onClick={onClose}
              style={{ filter: 'var(--close-btn-filter, none)', fontSize: '10px' }}
            />
          </div>

          {/* Native Desktop Horizontal Form Body */}
          <form onSubmit={handleSubmit} onKeyDown={(e) => e.stopPropagation()}>
            <div className="modal-body p-3" style={{ fontSize: '12px' }}>
              {errorMessage && (
                <div
                  className="alert alert-danger py-2 px-3 mb-2 d-flex align-items-center justify-content-between"
                  style={{ fontSize: '12px', borderRadius: '3px' }}
                >
                  <span>{errorMessage}</span>
                  <button
                    type="button"
                    className="btn-close btn-close-white btn-sm"
                    onClick={() => setErrorMessage('')}
                  />
                </div>
              )}

              {/* 1. Item Name */}
              <div className="desktop-form-row">
                <label className="desktop-form-label">
                  Item Name &amp; Strength <span className="text-danger">*</span>
                </label>
                <div className="desktop-form-control">
                  <input
                    ref={nameInputRef}
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="Enter item name and strength..."
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    style={{
                      fontSize: '12.5px',
                      fontWeight: 600,
                      backgroundColor: 'var(--input-bg)',
                      borderColor: 'var(--input-border)',
                      color: 'var(--input-text)',
                    }}
                  />
                </div>
              </div>

              {/* 2. Category */}
              <div className="desktop-form-row">
                <label className="desktop-form-label">Category</label>
                <div className="desktop-form-control">
                  <select
                    className="form-select form-select-sm"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    style={{
                      fontSize: '12px',
                      backgroundColor: 'var(--input-bg)',
                      borderColor: 'var(--input-border)',
                      color: 'var(--input-text)',
                    }}
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 3. Brand / Manufacturer */}
              <div className="desktop-form-row">
                <label className="desktop-form-label">Brand / Manufacturer</label>
                <div className="desktop-form-control">
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="Manufacturer / company name..."
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    style={{
                      backgroundColor: 'var(--input-bg)',
                      borderColor: 'var(--input-border)',
                      color: 'var(--input-text)',
                    }}
                  />
                </div>
              </div>

              {/* 4. Generic Formula (Active Salt) */}
              <div className="desktop-form-row">
                <label className="desktop-form-label">Generic Formula (Salt)</label>
                <div className="desktop-form-control">
                  <input
                    type="text"
                    list="genericList"
                    className="form-control form-control-sm"
                    placeholder="Active generic salt / formula..."
                    value={genericName}
                    onChange={(e) => setGenericName(e.target.value)}
                    style={{
                      backgroundColor: 'var(--input-bg)',
                      borderColor: 'var(--input-border)',
                      color: 'var(--input-text)',
                    }}
                  />
                  <datalist id="genericList">
                    {existingGenerics.map((gen, idx) => (
                      <option key={idx} value={gen} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* 5. Barcode (Quick Scan) */}
              <div className="desktop-form-row">
                <label className="desktop-form-label">Barcode (Quick Scan)</label>
                <div className="desktop-form-control">
                  <input
                    type="text"
                    className="form-control form-control-sm font-monospace"
                    placeholder="Scan or type barcode..."
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    style={{
                      backgroundColor: 'var(--input-bg)',
                      borderColor: 'var(--input-border)',
                      color: 'var(--input-text)',
                    }}
                  />
                </div>
              </div>

              {/* 6. Rack / Shelf Location */}
              <div className="desktop-form-row">
                <label className="desktop-form-label">Rack / Shelf</label>
                <div className="desktop-form-control">
                  <input
                    type="text"
                    className="form-control form-control-sm font-monospace text-uppercase"
                    placeholder="Rack / shelf location..."
                    value={rackLocation}
                    onChange={(e) => setRackLocation(e.target.value.toUpperCase())}
                    style={{
                      backgroundColor: 'var(--input-bg)',
                      borderColor: 'var(--input-border)',
                      color: 'var(--input-text)',
                    }}
                  />
                </div>
              </div>

              {/* 7. Pack Size (Packing) */}
              <div className="desktop-form-row">
                <label className="desktop-form-label">Pack Size (Packing)</label>
                <div className="desktop-form-control d-flex align-items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    className="form-control form-control-sm font-monospace fw-bold text-center"
                    value={packSizeStr}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => {
                      const clean = e.target.value.replace(/[^0-9]/g, '');
                      setPackSizeStr(clean);
                    }}
                    onBlur={() => {
                      if (!packSizeStr || parseInt(packSizeStr, 10) < 1) {
                        setPackSizeStr('1');
                      }
                    }}
                    style={{
                      width: '90px',
                      backgroundColor: 'var(--input-bg)',
                      borderColor: 'var(--input-border)',
                      color: 'var(--input-text)',
                    }}
                  />
                  <span className="small text-muted" style={{ fontSize: '11px' }}>
                    Base units per purchase pack/box (e.g. 14 for a 2×7 strip box, 1 for bottle)
                  </span>
                </div>
              </div>

              {/* 8. Current Stock (Base Units) */}
              <div className="desktop-form-row">
                <label className="desktop-form-label">Current Stock</label>
                <div className="desktop-form-control d-flex align-items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    className="form-control form-control-sm font-monospace fw-bold text-center"
                    placeholder="0"
                    value={currentStockStr}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => {
                      const clean = e.target.value.replace(/[^0-9]/g, '');
                      setCurrentStockStr(clean);
                    }}
                    onBlur={() => {
                      if (!currentStockStr) {
                        setCurrentStockStr('0');
                      }
                    }}
                    style={{
                      width: '90px',
                      backgroundColor: 'var(--input-bg)',
                      borderColor: 'var(--input-border)',
                      color: 'var(--input-text)',
                    }}
                  />
                  <span className="small text-muted" style={{ fontSize: '11px' }}>
                    Physical units in shop (Shelf count. Can be edited anytime to fix stock discrepancies)
                  </span>
                </div>
              </div>

              {/* 8. Cost Price (TP) */}
              <div className="desktop-form-row">
                <label className="desktop-form-label">
                  Cost Price (TP) <span className="text-muted">— per pack</span>
                </label>
                <div className="desktop-form-control d-flex align-items-center gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    className="form-control form-control-sm font-monospace text-end"
                    placeholder="0.00"
                    value={costPriceStr}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => {
                      const clean = e.target.value.replace(/[^0-9.]/g, '');
                      setCostPriceStr(clean);
                    }}
                    onBlur={() => {
                      if (!costPriceStr) setCostPriceStr('0.00');
                    }}
                    style={{
                      width: '120px',
                      backgroundColor: 'var(--input-bg)',
                      borderColor: 'var(--input-border)',
                      color: 'var(--input-text)',
                    }}
                  />
                  <span className="small text-muted" style={{ fontSize: '11px' }}>
                    Distributor cost for one full pack = Rs. {costPerUnit.toFixed(2)}/unit
                  </span>
                </div>
              </div>

              {/* 9. Retail Price (MRP) */}
              <div className="desktop-form-row">
                <label className="desktop-form-label">
                  Retail Price (MRP) <span className="text-muted">— per pack</span> <span className="text-danger">*</span>
                </label>
                <div className="desktop-form-control d-flex align-items-center gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    className="form-control form-control-sm font-monospace text-end fw-semibold"
                    placeholder="0.00"
                    value={mrpStr}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => {
                      const clean = e.target.value.replace(/[^0-9.]/g, '');
                      setMrpStr(clean);
                      // MRP is per pack, but the POS sells per base unit -> divide by pack size
                      if (!isEditMode && (!salePriceStr || salePriceStr === '0.00' || salePriceStr === mrpStr)) {
                        const unitRate = Number(clean) / (parseInt(packSizeStr, 10) || 1);
                        setSalePriceStr(unitRate > 0 ? unitRate.toFixed(2) : '0.00');
                      }
                    }}
                    onBlur={() => {
                      if (!mrpStr) setMrpStr('0.00');
                    }}
                    required
                    style={{
                      width: '120px',
                      backgroundColor: 'var(--input-bg)',
                      borderColor: 'var(--input-border)',
                      color: 'var(--input-text)',
                    }}
                  />
                  <span className="small text-muted" style={{ fontSize: '11px' }}>
                    Printed retail price on the box = Rs. {mrpPerUnit.toFixed(2)}/unit
                  </span>
                </div>
              </div>

              {/* 10. Sale Price (POS Dokan Rate) */}
              <div className="desktop-form-row">
                <label className="desktop-form-label fw-bold" style={{ color: 'var(--brand-teal)' }}>
                  Sale Price (POS Rate) <span className="text-muted">— per base unit</span> <span className="text-danger">*</span>
                </label>
                <div className="desktop-form-control d-flex align-items-center gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    className="form-control form-control-sm font-monospace fw-bold text-end"
                    placeholder="0.00"
                    value={salePriceStr}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => {
                      const clean = e.target.value.replace(/[^0-9.]/g, '');
                      setSalePriceStr(clean);
                    }}
                    onBlur={() => {
                      if (!salePriceStr) setSalePriceStr('0.00');
                    }}
                    required
                    style={{
                      width: '120px',
                      backgroundColor: 'var(--input-bg)',
                      borderColor: 'var(--brand-teal)',
                      color: 'var(--brand-teal)',
                      fontSize: '13px',
                    }}
                  />
                  <span className="small text-muted" style={{ fontSize: '11px' }}>
                    Charged per tablet/unit at the counter = Rs. {salePerPack.toFixed(2)}/pack
                  </span>
                </div>
              </div>

              {/* Live Price-Basis Insight (cost/MRP per pack, sale per base unit) */}
              <div className="desktop-form-row mb-2">
                <div className="desktop-form-label"></div>
                <div className="desktop-form-control d-flex align-items-center gap-2 flex-wrap">
                  <span className="badge bg-secondary-subtle text-secondary border px-2 py-1" style={{ fontSize: '11px' }}>
                    📦 {numPack} units/pack · Cost Rs. {costPerUnit.toFixed(2)}/unit · MRP Rs. {mrpPerUnit.toFixed(2)}/unit
                  </span>

                  {customerDiscountRs > 0 ? (
                    <span className="badge bg-success-subtle text-success border border-success-subtle px-2 py-1" style={{ fontSize: '11px' }}>
                      🎁 Customer Discount: Rs. {customerDiscountRs.toFixed(2)}/unit ({customerDiscountPct.toFixed(1)}% OFF)
                    </span>
                  ) : (
                    <span className="small text-muted" style={{ fontSize: '10.5px' }}>
                      Sold at full printed MRP
                    </span>
                  )}

                  {storeProfitRs > 0 && (
                    <span className="badge bg-teal-subtle text-teal border border-teal-subtle px-2 py-1" style={{ fontSize: '11px', color: 'var(--brand-teal)' }}>
                      📈 Store Profit: Rs. {storeProfitRs.toFixed(2)}/unit ({storeMarginPct.toFixed(1)}% margin)
                    </span>
                  )}

                  {isBelowCost && (
                    <span className="badge text-bg-danger px-2 py-1" style={{ fontSize: '11px' }}>
                      ⚠️ Below cost: selling Rs. {numSale.toFixed(2)} vs cost Rs. {costPerUnit.toFixed(2)} per unit
                    </span>
                  )}

                  {isAboveMrp && (
                    <span className="badge text-bg-warning px-2 py-1" style={{ fontSize: '11px' }}>
                      ⚠️ Sale per pack (Rs. {salePerPack.toFixed(2)}) is above MRP
                    </span>
                  )}
                </div>
              </div>

              {/* 10. Low Stock Alert & Prescription switch */}
              <div className="desktop-form-row">
                <label className="desktop-form-label">Low Stock Alert</label>
                <div className="desktop-form-control d-flex align-items-center justify-content-between">
                  <div className="d-flex align-items-center gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      className="form-control form-control-sm font-monospace text-center"
                      value={minStockStr}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const clean = e.target.value.replace(/[^0-9]/g, '');
                        setMinStockStr(clean);
                      }}
                      onBlur={() => {
                        if (!minStockStr) setMinStockStr('10');
                      }}
                      style={{
                        width: '80px',
                        backgroundColor: 'var(--input-bg)',
                        borderColor: 'var(--input-border)',
                        color: 'var(--input-text)',
                      }}
                    />
                    <span className="small text-muted" style={{ fontSize: '11px' }}>
                      Minimum base units
                    </span>
                  </div>

                  <div className="form-check form-switch m-0 d-flex align-items-center gap-2">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      role="switch"
                      id="rxSwitch"
                      checked={isRx}
                      onChange={(e) => setIsRx(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    <label className="form-check-label fw-semibold" htmlFor="rxSwitch" style={{ cursor: 'pointer', fontSize: '11.5px' }}>
                      Prescription Required (Rx Only)
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Native Desktop Window Footer */}
            <div
              className="modal-footer py-2 px-3 d-flex align-items-center justify-content-between"
              style={{
                backgroundColor: 'var(--surface-subtle)',
                borderTop: '1px solid var(--border-color)',
              }}
            >
              <div className="small text-muted" style={{ fontSize: '11px' }}>
                Press <span className="kbd">Esc</span> to cancel, <span className="kbd">Enter</span> to save
              </div>

              <div className="d-flex align-items-center gap-2">
                <button
                  type="button"
                  className="btn btn-sm secondaryBtn px-3"
                  onClick={onClose}
                  disabled={saving}
                  style={{ height: '28px', fontSize: '12px', fontWeight: 600 }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="btn btn-sm text-white px-4 fw-bold"
                  disabled={saving}
                  style={{
                    backgroundColor: '#0F766E',
                    borderColor: '#0F766E',
                    height: '28px',
                    fontSize: '12px',
                  }}
                >
                  {saving ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-1" role="status" />
                      Saving...
                    </>
                  ) : (
                    'Save Item'
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
