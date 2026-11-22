import React, { useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { useApp } from '../../context/AppContext';

export interface BelowCostItemWarning {
  medicine_id: number;
  batch_id?: number;
  name: string;
  generic_name?: string;
  batch_number?: string;
  pack_cost: number;
  applicable_cost: number;
  sale_price: number;
  quantity: number;
  unit_type?: string;
  pack_size?: number;
  unit_loss: number;
  total_loss: number;
  is_unit_sale?: boolean;
}

export function getApplicableCost(item: {
  cost_price?: number;
  pack_size?: number;
  unit_type?: string;
}): number {
  const packCost = Number(item.cost_price || 0);
  const packSize = Number(item.pack_size || 1);
  const unitTypeLower = (item.unit_type || '').toLowerCase();
  const isPackSale = unitTypeLower === 'pack' || unitTypeLower === 'box';

  if (!isPackSale && packSize > 1) {
    return Number((packCost / packSize).toFixed(2));
  }
  return Number(packCost.toFixed(2));
}

export interface BelowCostWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: BelowCostItemWarning[];
  onConfirmSellAnyway: () => void;
  onRevertToCost?: () => void;
  onFixMasterPrice?: () => void;
}

export function BelowCostWarningModal({
  isOpen,
  onClose,
  items,
  onConfirmSellAnyway,
  onRevertToCost,
  onFixMasterPrice,
}: BelowCostWarningModalProps) {
  const { formatCurrency } = useApp();

  // Keyboard accelerators: Esc to Edit, Enter to Use Cost, F12 to Sell at Loss
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F12') {
        e.preventDefault();
        e.stopPropagation();
        onConfirmSellAnyway();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (onRevertToCost) {
          onRevertToCost();
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onConfirmSellAnyway, onRevertToCost, onClose]);

  if (!isOpen || items.length === 0) return null;

  const totalBillLoss = items.reduce((sum, it) => sum + it.total_loss, 0);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="640px"
      bodyClassName="p-0"
      title={
        <div>
          <div className="d-flex align-items-center gap-2 text-danger">
            <i className="bi bi-exclamation-triangle-fill" style={{ fontSize: '18px' }}></i>
            <span className="fw-bold" style={{ fontSize: '16px' }}>Below Cost Price Alert</span>
          </div>
          <div className="text-secondary fw-normal mt-1" style={{ fontSize: '12px' }}>
            Sale price is lower than purchase cost ({formatCurrency(totalBillLoss)} loss).
          </div>
        </div>
      }
      footer={
        <div className="d-flex align-items-center justify-content-between w-100">
          {/* Neutral Secondary / Ghost: Edit Price [Esc] (Esc badge styled softly with bg-light) */}
          <button
            type="button"
            className="btn btn-outline-secondary d-flex align-items-center gap-1.5"
            style={{ height: '38px', fontSize: '12.5px', fontWeight: 600, padding: '0 12px' }}
            onClick={onClose}
          >
            <span>Edit Price</span>
            <kbd
              className="bg-light text-secondary border px-1.5 py-0.5 rounded shadow-2xs"
              style={{ fontSize: '10.5px', fontWeight: 700, lineHeight: 1 }}
            >
              Esc
            </kbd>
          </button>

          <div className="d-flex align-items-center gap-2">
            {onFixMasterPrice && (
              <button
                type="button"
                className="btn btn-outline-info d-flex align-items-center gap-1"
                style={{ height: '38px', fontSize: '12px', fontWeight: 600, padding: '0 10px' }}
                onClick={onFixMasterPrice}
                title="Update the item's saved sale price, not just this cart line"
              >
                <i className="bi bi-pencil-square"></i>
                <span>Fix Master Price</span>
              </button>
            )}

            {/* Subtle Red Outline: Sell Anyway [F12] */}
            <button
              type="button"
              className="btn btn-outline-danger d-flex align-items-center gap-1.5"
              style={{ height: '38px', fontSize: '12.5px', fontWeight: 600, padding: '0 12px' }}
              onClick={onConfirmSellAnyway}
            >
              <span>Sell Anyway</span>
              <kbd
                className="px-1.5 py-0.5 rounded"
                style={{
                  fontSize: '10.5px',
                  fontWeight: 700,
                  lineHeight: 1,
                  color: '#DC2626',
                  backgroundColor: 'rgba(220, 38, 38, 0.06)',
                  border: '1px solid rgba(220, 38, 38, 0.25)',
                }}
              >
                F12
              </kbd>
            </button>

            {/* Solid Primary Action: Set to Cost Price [Enter] */}
            <button
              type="button"
              className="btn text-white d-flex align-items-center gap-1.5 fw-bold shadow-xs"
              style={{
                height: '38px',
                fontSize: '12.5px',
                backgroundColor: '#0F766E',
                borderColor: '#0D5F59',
                padding: '0 14px',
              }}
              onClick={onRevertToCost ? onRevertToCost : onClose}
            >
              <span>
                {items.length === 1
                  ? `Set to ${formatCurrency(items[0].applicable_cost)}`
                  : 'Fix / Set to Cost'}
              </span>
              <kbd
                className="px-1.5 py-0.5 rounded text-white"
                style={{
                  fontSize: '10.5px',
                  fontWeight: 700,
                  lineHeight: 1,
                  backgroundColor: 'rgba(255, 255, 255, 0.25)',
                  border: '1px solid rgba(255, 255, 255, 0.35)',
                }}
              >
                Enter
              </kbd>
            </button>
          </div>
        </div>
      }
    >
      {/* Flat Edge-to-Edge Table (p-0 on modal body, table-borderless with single borderBottom on thead) */}
      <table className="table table-borderless table-sm mb-0 align-middle w-100" style={{ fontSize: '12px' }}>
        <thead
          style={{
            backgroundColor: 'var(--surface-subtle)',
            borderBottom: '1px solid var(--border-color)',
            fontSize: '11px',
            color: 'var(--text-secondary)',
          }}
        >
          <tr>
            <th style={{ padding: '8px 16px' }}>ITEM</th>
            <th style={{ textAlign: 'right', padding: '8px 12px', width: '130px' }}>COST (TP)</th>
            <th style={{ textAlign: 'right', padding: '8px 12px', width: '100px' }}>SALE PRICE</th>
            <th style={{ textAlign: 'center', padding: '8px 10px', width: '80px' }}>QTY</th>
            <th style={{ textAlign: 'right', padding: '8px 16px', width: '105px' }}>LOSS</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, idx) => (
            <tr
              key={`${it.medicine_id}-${idx}`}
              style={{ borderBottom: '1px solid var(--border-color)' }}
            >
              <td style={{ padding: '8px 16px' }}>
                <div className="fw-bold" style={{ color: 'var(--text-primary)' }}>
                  {it.name}
                </div>
                <div className="text-muted text-truncate" style={{ fontSize: '10.5px', maxWidth: '250px' }}>
                  {it.generic_name} {it.batch_number ? `· Batch ${it.batch_number}` : ''}
                </div>
              </td>
              <td className="text-end font-monospace" style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>
                <div>{formatCurrency(it.applicable_cost)}</div>
                {it.is_unit_sale && (it.pack_size || 1) > 1 && (
                  <div className="text-muted" style={{ fontSize: '10px' }}>
                    (Pack: {formatCurrency(it.pack_cost)})
                  </div>
                )}
              </td>
              <td className="text-end font-monospace fw-bold text-danger" style={{ padding: '8px 12px' }}>
                {formatCurrency(it.sale_price)}
              </td>
              <td className="text-center font-monospace" style={{ padding: '8px 10px' }}>
                <span className="fw-semibold">{it.quantity}</span>
                {it.unit_type && (
                  <span className="text-muted ms-1" style={{ fontSize: '10.5px' }}>
                    {it.unit_type}
                  </span>
                )}
              </td>
              <td className="text-end font-monospace fw-bold text-danger" style={{ padding: '8px 16px' }}>
                -{formatCurrency(it.total_loss)}
              </td>
            </tr>
          ))}
        </tbody>
        {items.length > 1 && (
          <tfoot style={{ backgroundColor: 'var(--surface-subtle)', fontWeight: 700 }}>
            <tr>
              <td colSpan={4} className="text-end py-2 px-3" style={{ fontSize: '12px' }}>
                Total Loss:
              </td>
              <td className="text-end py-2 px-3 font-monospace text-danger" style={{ fontSize: '13px' }}>
                -{formatCurrency(totalBillLoss)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </Modal>
  );
}
