import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { Batch, Medicine } from '../../types';
import { Modal } from '../ui/Modal';
import { useToast } from '../../context/ToastContext';
import { useApp } from '../../context/AppContext';

interface StockAdjustModalProps {
  isOpen: boolean;
  medicine: Medicine | null;
  onClose: () => void;
  onAdjusted: () => void;
}

export function StockAdjustModal({ isOpen, medicine, onClose, onAdjusted }: StockAdjustModalProps) {
  const toast = useToast();
  const { refreshStats } = useApp();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchId, setBatchId] = useState<number>(0);
  const [direction, setDirection] = useState<'IN' | 'OUT'>('IN');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !medicine) return;
    setDirection('IN');
    setAmount('');
    setReason('');
    api.getBatches(medicine.id)
      .then((data) => {
        const usable = (data || []).filter((b) => b.quantity > 0);
        setBatches(usable);
        setBatchId(usable[0]?.id || 0);
      })
      .catch((err) => toast.error('Could not load batches: ' + err.message));
  }, [isOpen, medicine, toast]);

  const selected = batches.find((b) => b.id === batchId);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!medicine || !batchId) {
      toast.error('Please choose a batch first.');
      return;
    }
    const quantity = parseInt(amount, 10) || 0;
    if (quantity <= 0) {
      toast.error('Please enter how many units to add or remove.');
      return;
    }
    if (direction === 'OUT' && selected && quantity > selected.quantity) {
      toast.error(`This batch has only ${selected.quantity} units. Enter a smaller number.`);
      return;
    }
    if (!reason.trim()) {
      toast.error('Please write a short reason (for example: "received goods" or "damaged").');
      return;
    }

    setSaving(true);
    try {
      const result = await api.adjustStock(medicine.id, batchId, direction === 'IN' ? quantity : -quantity, reason.trim());
      toast.success(`Stock updated. Batch ${(result as any).batch_number || ''} now has ${(result as any).new_quantity} units.`);
      refreshStats();
      onClose();
      onAdjusted();
    } catch (err: any) {
      toast.error(err.message || 'Could not adjust stock.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <span className="d-flex align-items-center gap-2">
          <i className="bi bi-boxes"></i>
          <span>Adjust Stock — {medicine?.name || ''}</span>
        </span>
      }
      maxWidth="520px"
      footer={
        <div className="d-flex justify-content-end gap-2 w-100">
          <button type="button" className="btn btn-sm secondaryBtn px-3" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" form="stock-adjust-form" className="btn btn-sm text-white px-4 fw-bold" disabled={saving || !batchId}
            style={{ backgroundColor: '#0F766E', borderColor: '#0F766E', height: '30px', fontSize: '12px' }}>
            {saving ? 'Saving…' : 'Save Stock Change'}
          </button>
        </div>
      }
    >
      <form id="stock-adjust-form" onSubmit={handleSubmit} className="d-flex flex-column gap-3" style={{ fontSize: '12px' }}>
        <div className="alert alert-info py-2 px-3 mb-0" style={{ fontSize: '11.5px' }}>
          Use this only for real stock changes — goods received, damaged items, or a count correction.
          Every change is saved with your reason. Editing prices never changes stock.
        </div>

        <div>
          <label className="form-label small fw-semibold mb-1">Choose Batch</label>
          <select className="form-select form-select-sm" value={batchId} onChange={(e) => setBatchId(Number(e.target.value))}
            style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--input-border)', color: 'var(--input-text)' }}>
            {batches.length === 0 && <option value={0}>No stock batches yet — add through Purchases / GRN</option>}
            {batches.map((batch) => (
              <option key={batch.id} value={batch.id}>
                {batch.batch_number} — expiry {batch.expiry_date} — {batch.quantity} units
              </option>
            ))}
          </select>
          {selected && (
            <div className="small text-muted mt-1">
              This batch currently has <strong>{selected.quantity}</strong> units.
            </div>
          )}
        </div>

        <div>
          <label className="form-label small fw-semibold mb-1">What happened?</label>
          <div className="btn-group w-100">
            <button type="button" className={`btn btn-sm ${direction === 'IN' ? 'btn-success' : 'btn-outline-secondary'}`}
              onClick={() => setDirection('IN')}>
              <i className="bi bi-plus-circle me-1"></i> Stock came in
            </button>
            <button type="button" className={`btn btn-sm ${direction === 'OUT' ? 'btn-danger' : 'btn-outline-secondary'}`}
              onClick={() => setDirection('OUT')}>
              <i className="bi bi-dash-circle me-1"></i> Stock went out
            </button>
          </div>
        </div>

        <div>
          <label className="form-label small fw-semibold mb-1">How many units?</label>
          <input type="text" inputMode="numeric" className="form-control form-control-sm" value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="e.g. 20" style={{ width: '140px', backgroundColor: 'var(--input-bg)', borderColor: 'var(--input-border)', color: 'var(--input-text)' }} />
        </div>

        <div>
          <label className="form-label small fw-semibold mb-1">Reason <span className="text-danger">*</span></label>
          <input type="text" className="form-control form-control-sm" value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={direction === 'IN' ? 'e.g. Goods received from distributor' : 'e.g. Damaged strips removed'}
            style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--input-border)', color: 'var(--input-text)' }} />
        </div>
      </form>
    </Modal>
  );
}
