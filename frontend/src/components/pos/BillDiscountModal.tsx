import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useApp } from '../../context/AppContext';

export interface BillDiscountModalProps {
  isOpen: boolean;
  onClose: () => void;
  subtotal: number;
  currentDiscountPercent: number;
  onApplyDiscount: (percent: number) => void;
}

export function BillDiscountModal({
  isOpen,
  onClose,
  subtotal,
  currentDiscountPercent,
  onApplyDiscount,
}: BillDiscountModalProps) {
  const { formatCurrency } = useApp();
  const [percent, setPercent] = useState<number | string>(currentDiscountPercent);
  const [flatAmount, setFlatAmount] = useState<number | string>('');

  useEffect(() => {
    if (isOpen) {
      setPercent(currentDiscountPercent);
      if (subtotal > 0 && currentDiscountPercent > 0) {
        setFlatAmount(Number(((subtotal * currentDiscountPercent) / 100).toFixed(2)));
      } else {
        setFlatAmount('');
      }
    }
  }, [isOpen, currentDiscountPercent, subtotal]);

  const handlePercentChange = (val: string) => {
    setPercent(val);
    const num = parseFloat(val);
    if (!isNaN(num) && subtotal > 0) {
      setFlatAmount(Number(((subtotal * num) / 100).toFixed(2)));
    } else {
      setFlatAmount('');
    }
  };

  const handleFlatChange = (val: string) => {
    setFlatAmount(val);
    const num = parseFloat(val);
    if (!isNaN(num) && subtotal > 0) {
      const calcPct = Math.min(100, Math.max(0, (num / subtotal) * 100));
      setPercent(Number(calcPct.toFixed(2)));
    } else {
      setPercent('');
    }
  };

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    const finalPct = Math.min(100, Math.max(0, parseFloat(String(percent)) || 0));
    onApplyDiscount(finalPct);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="BILL DISCOUNT (F4)"
      maxWidth="420px"
      footer={
        <div className="d-flex justify-content-end gap-2 w-100">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleApply}>
            Apply Discount
          </Button>
        </div>
      }
    >
      <form onSubmit={handleApply} className="d-flex flex-column gap-3">
        <div className="p-2 bg-light border rounded small d-flex justify-content-between">
          <span className="text-secondary">Bill Gross Subtotal:</span>
          <span className="fw-bold">{formatCurrency(subtotal)}</span>
        </div>

        <div className="mb-2">
          <label className="form-label small fw-bold mb-1">Discount Percentage (%)</label>
          <div className="input-group">
            <input
              type="number"
              step="any"
              min="0"
              max="100"
              className="form-control"
              placeholder="e.g. 5, 10, 15"
              value={percent}
              onChange={(e) => handlePercentChange(e.target.value)}
              autoFocus
            />
            <span className="input-group-text">%</span>
          </div>
        </div>

        <div className="mb-2">
          <label className="form-label small fw-bold mb-1">Or Flat Discount Amount (Rs.)</label>
          <div className="input-group">
            <span className="input-group-text">Rs.</span>
            <input
              type="number"
              step="any"
              min="0"
              max={subtotal}
              className="form-control"
              placeholder="e.g. 50, 100"
              value={flatAmount}
              onChange={(e) => handleFlatChange(e.target.value)}
            />
          </div>
        </div>

        {/* Quick Discount Presets */}
        <div className="d-flex gap-2">
          {[0, 5, 10, 12, 15].map((preset) => (
            <button
              key={preset}
              type="button"
              className={`btn btn-sm flex-grow-1 ${Number(percent) === preset ? 'btn-teal text-white' : 'btn-outline-secondary'}`}
              style={Number(percent) === preset ? { backgroundColor: '#0F766E', borderColor: '#0F766E' } : {}}
              onClick={() => handlePercentChange(String(preset))}
            >
              {preset === 0 ? '0%' : `${preset}%`}
            </button>
          ))}
        </div>
      </form>
    </Modal>
  );
}
