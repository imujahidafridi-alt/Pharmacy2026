import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { api } from '../../services/api';
import { useApp } from '../../context/AppContext';
import { Batch, Medicine } from '../../types';

export interface BatchSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  medicine: Medicine | null;
  onSelectBatch: (batch: Batch) => void;
}

export function BatchSelectorModal({ isOpen, onClose, medicine, onSelectBatch }: BatchSelectorModalProps) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const { formatCurrency } = useApp();

  useEffect(() => {
    if (isOpen && medicine) {
      setLoading(true);
      api.getBatches(medicine.id)
        .then((data) => setBatches(data || []))
        .catch((err) => console.error(err))
        .finally(() => setLoading(false));
    }
  }, [isOpen, medicine]);

  if (!medicine) return null;

  const packSize = medicine.pack_size || 1;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Select Batch: ${medicine.name}`}
      maxWidth="700px"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      }
    >
      <div className="small text-secondary mb-3 d-flex justify-content-between align-items-center gap-2 flex-wrap">
        <span>
          System defaults to <strong>FEFO (First Expire First Out)</strong>. Override with a specific batch below.
        </span>
        <span className="badge bg-primary-subtle text-primary fw-semibold">
          1 pack = {packSize} base units
        </span>
      </div>

      {loading ? (
        <div className="text-center py-4">Loading batches...</div>
      ) : (
        <div className="table-responsive border rounded shadow-sm">
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th>Batch #</th>
                <th>Expiry Date</th>
                <th>Status</th>
                <th className="text-end">Stock (base)</th>
                <th className="text-end">Sale / unit</th>
                <th className="text-end">Sale / pack</th>
                <th className="text-end">Buy / pack</th>
                <th className="text-end">Action</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => {
                const isExpired = b.expiry_status === 'expired';
                const isOutOfStock = b.quantity <= 0;
                const canSelect = !isExpired && !isOutOfStock;

                return (
                  <tr
                    key={b.id}
                    className={isExpired ? 'table-danger' : undefined}
                    style={{ opacity: canSelect ? 1 : 0.6 }}
                  >
                    <td className="fw-semibold font-monospace">{b.batch_number}</td>
                    <td>{b.expiry_date}</td>
                    <td>
                      <Badge variant={b.expiry_status}>
                        {b.expiry_status === 'expired'
                          ? 'Expired'
                          : b.expiry_status === 'critical'
                          ? `Critical (${b.days_until_expiry}d)`
                          : b.expiry_status === 'warning'
                          ? `Near (${b.days_until_expiry}d)`
                          : 'Healthy'}
                      </Badge>
                    </td>
                    <td className="text-end fw-bold" title={`${b.quantity} loose units available`}>
                      {b.quantity}
                    </td>
                    <td className="text-end fw-semibold" style={{ color: 'var(--brand-teal)' }}>
                      {formatCurrency(b.sale_rate)}
                    </td>
                    <td className="text-end text-muted">{formatCurrency(b.sale_rate * packSize)}</td>
                    <td className="text-end text-muted">{formatCurrency(b.purchase_rate)}</td>
                    <td className="text-end">
                      <Button
                        variant={canSelect ? 'primary' : 'secondary'}
                        size="sm"
                        disabled={!canSelect}
                        onClick={() => {
                          onSelectBatch(b);
                          onClose();
                        }}
                      >
                        {isExpired ? 'Locked' : isOutOfStock ? 'Empty' : 'Select'}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
