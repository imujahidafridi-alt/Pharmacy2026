import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { Batch, Medicine } from '../../types';
import { Modal } from '../ui/Modal';
import { useToast } from '../../context/ToastContext';

interface BatchManageModalProps {
  isOpen: boolean;
  medicine: Medicine | null;
  onClose: () => void;
  onUpdated: () => void;
}

export function BatchManageModal({ isOpen, medicine, onClose, onUpdated }: BatchManageModalProps) {
  const toast = useToast();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [drafts, setDrafts] = useState<Record<number, { batch_number: string; expiry_date: string }>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen || !medicine) return;
    api.getBatches(medicine.id)
      .then((data) => {
        const rows = data || [];
        setBatches(rows);
        setDrafts(Object.fromEntries(rows.map((b) => [b.id, {
          batch_number: b.batch_number || '',
          expiry_date: b.expiry_date && b.expiry_date < '2090-01-01' ? b.expiry_date : '',
        }])));
      })
      .catch((err) => toast.error('Could not load batches: ' + err.message));
  }, [isOpen, medicine, toast]);

  const save = async (batch: Batch) => {
    const draft = drafts[batch.id];
    if (!draft) return;
    if (!draft.batch_number.trim()) {
      toast.error('Please enter a batch number.');
      return;
    }
    if (!draft.expiry_date) {
      toast.error('Please enter the expiry date.');
      return;
    }
    setSavingId(batch.id);
    try {
      await api.updateBatch(batch.id, {
        batch_number: draft.batch_number.trim(),
        expiry_date: draft.expiry_date,
      });
      toast.success('Batch details saved.');
      onUpdated();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Could not save this batch.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <span className="d-flex align-items-center gap-2">
          <i className="bi bi-qr-code"></i>
          <span>Batches — {medicine?.name || ''}</span>
        </span>
      }
      maxWidth="720px"
      footer={
        <button type="button" className="btn btn-sm secondaryBtn px-3" onClick={onClose}>Done</button>
      }
    >
      <div className="alert alert-info py-2 px-3 mb-3" style={{ fontSize: '11.5px' }}>
        Add the real batch number and expiry whenever you have them. Items created in a hurry use a default batch
        marked <strong>"No expiry set"</strong> — update it here before selling those units.
      </div>
      {batches.length === 0 ? (
        <div className="text-center py-4 text-secondary">This item has no stock batches yet.</div>
      ) : (
        <div className="table-responsive border rounded">
          <table className="table table-sm align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th>Batch Number</th>
                <th>Expiry Date</th>
                <th className="text-end">Units</th>
                <th className="text-end">Save</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => {
                const draft = drafts[batch.id] || { batch_number: '', expiry_date: '' };
                const unknownExpiry = !batch.expiry_date || batch.expiry_date >= '2090-01-01';
                return (
                  <tr key={batch.id}>
                    <td>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={draft.batch_number}
                        onChange={(e) => setDrafts((prev) => ({
                          ...prev,
                          [batch.id]: { ...draft, batch_number: e.target.value },
                        }))}
                        style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--input-border)', color: 'var(--input-text)' }}
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        className="form-control form-control-sm"
                        value={draft.expiry_date}
                        onChange={(e) => setDrafts((prev) => ({
                          ...prev,
                          [batch.id]: { ...draft, expiry_date: e.target.value },
                        }))}
                        style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--input-border)', color: 'var(--input-text)' }}
                      />
                      {unknownExpiry && (
                        <div className="small text-warning mt-1" style={{ fontSize: '10px' }}>No expiry set yet</div>
                      )}
                    </td>
                    <td className="text-end fw-bold">{batch.quantity}</td>
                    <td className="text-end">
                      <button
                        type="button"
                        className="btn btn-sm btn-primary px-3"
                        disabled={savingId === batch.id}
                        onClick={() => save(batch)}
                      >
                        {savingId === batch.id ? 'Saving…' : 'Save'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="small text-muted mt-2" style={{ fontSize: '10.5px' }}>
        To change the number of units, use the <strong>Adjust Stock</strong> button in the Items list.
      </div>
    </Modal>
  );
}
