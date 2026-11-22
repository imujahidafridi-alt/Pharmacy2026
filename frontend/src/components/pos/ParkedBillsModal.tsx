import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';

export interface ParkedBillsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResumeCart: (cartObj: any) => void;
}

export function ParkedBillsModal({ isOpen, onClose, onResumeCart }: ParkedBillsModalProps) {
  const [parkedList, setParkedList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const loadParked = async () => {
    setLoading(true);
    try {
      const data = await api.getParkedInvoices();
      setParkedList(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadParked();
    }
  }, [isOpen]);

  const handleResume = async (parked: any) => {
    try {
      const cartObj = JSON.parse(parked.cart_data);
      await api.deleteParkedInvoice(parked.id);
      onResumeCart(cartObj);
      toast.success(`Resumed bill for ${parked.customer_name || 'Customer'}`);
      onClose();
    } catch {
      toast.error('Failed to parse parked cart data');
    }
  };

  const handleDelete = async (id: number | string) => {
    if (!window.confirm('Delete this parked bill?')) return;
    try {
      await api.deleteParkedInvoice(id);
      toast.info('Parked bill deleted');
      loadParked();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Parked / Suspended Bills"
      maxWidth="680px"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {loading ? (
        <div className="text-center py-4">Loading parked bills...</div>
      ) : parkedList.length === 0 ? (
        <div className="text-center py-5 text-secondary">
          No parked bills found. You can suspend active sales using the "Hold (F4)" button.
        </div>
      ) : (
        <div className="table-responsive border rounded shadow-sm">
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th>Customer / Label</th>
                <th>Time Parked</th>
                <th>Items Count</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {parkedList.map((p) => {
                let itemCount = 0;
                try {
                  const parsed = JSON.parse(p.cart_data);
                  itemCount = parsed.items ? parsed.items.length : 0;
                } catch {}

                return (
                  <tr key={p.id}>
                    <td className="fw-bold">{p.customer_name || 'Parked Sale'}</td>
                    <td className="small text-secondary">{p.created_at}</td>
                    <td>{itemCount} items</td>
                    <td className="text-end">
                      <div className="d-inline-flex gap-2">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleResume(p)}
                        >
                          Resume
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-danger"
                          onClick={() => handleDelete(p.id)}
                        >
                          <i className="bi bi-trash"></i>
                        </Button>
                      </div>
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
