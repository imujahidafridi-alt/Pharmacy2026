import React, { useState, useEffect, useRef } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Customer } from '../../types';
import { useApp } from '../../context/AppContext';

export interface CustomerSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  customers: Customer[];
  selectedCustomerId: string | number;
  onSelectCustomer: (customerId: string | number) => void;
}

export function CustomerSelectModal({
  isOpen,
  onClose,
  customers,
  selectedCustomerId,
  onSelectCustomer,
}: CustomerSelectModalProps) {
  const { formatCurrency } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setSelectedIndex(0);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const filtered = customers.filter((c) => {
    const term = searchTerm.toLowerCase();
    return (
      c.name.toLowerCase().includes(term) ||
      (c.phone && c.phone.includes(term))
    );
  });

  const handleChoose = (id: string | number) => {
    onSelectCustomer(id);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, filtered.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex === 0) {
        handleChoose('');
      } else if (filtered[selectedIndex - 1]) {
        handleChoose(filtered[selectedIndex - 1].id);
      }
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="CUSTOMER SELECTION (F5)"
      maxWidth="540px"
      footer={
        <div className="d-flex justify-content-between align-items-center w-100">
          <span className="small text-secondary">
            Use <span className="kbd">↑</span> <span className="kbd">↓</span> to navigate, <span className="kbd">Enter</span> to select
          </span>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="d-flex flex-column gap-2" onKeyDown={handleKeyDown}>
        <div className="input-group">
          <span className="input-group-text bg-body-tertiary">
            <i className="bi bi-search text-secondary"></i>
          </span>
          <input
            ref={searchInputRef}
            type="text"
            className="form-control"
            placeholder="Search customer name or phone number..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setSelectedIndex(0);
            }}
          />
        </div>

        <div className="border rounded overflow-y-auto" style={{ maxHeight: '320px' }}>
          {/* Default Walk-In Customer Option */}
          <div
            className={`p-2 border-bottom d-flex justify-content-between align-items-center ${
              selectedIndex === 0 ? 'bg-primary-subtle text-primary fw-bold' : ''
            }`}
            style={{ cursor: 'pointer' }}
            onClick={() => handleChoose('')}
          >
            <div>
              <i className="bi bi-person me-2"></i> Walk-In Customer (Cash Sale)
            </div>
            {!selectedCustomerId && (
              <span className="badge text-bg-teal" style={{ backgroundColor: '#0F766E' }}>Active</span>
            )}
          </div>

          {filtered.map((cust, idx) => {
            const isHighlighted = selectedIndex === idx + 1;
            const isSelected = String(cust.id) === String(selectedCustomerId);
            const balance = cust.balance ?? cust.current_balance ?? 0;

            return (
              <div
                key={cust.id}
                className={`p-2 border-bottom d-flex justify-content-between align-items-center ${
                  isHighlighted ? 'bg-primary-subtle' : ''
                }`}
                style={{ cursor: 'pointer' }}
                onClick={() => handleChoose(cust.id)}
              >
                <div>
                  <div className="fw-semibold" style={{ color: 'var(--text-primary)' }}>
                    {cust.name} {isSelected && <span className="badge text-bg-teal" style={{ backgroundColor: 'var(--brand-teal)' }}>Selected</span>}
                  </div>
                  <div className="text-secondary small">
                    {cust.phone ? `Phone: ${cust.phone}` : 'No phone registered'}
                  </div>
                </div>
                <div className="text-end">
                  {balance > 0 ? (
                    <span className="badge bg-danger-subtle text-danger border border-danger-subtle">
                      Baqaya: {formatCurrency(balance)}
                    </span>
                  ) : balance < 0 ? (
                    <span className="badge bg-success-subtle text-success border border-success-subtle">
                      Advance: {formatCurrency(Math.abs(balance))}
                    </span>
                  ) : (
                    <span className="badge bg-light text-secondary border">Clear</span>
                  )}
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && searchTerm && (
            <div className="text-center py-4 text-secondary">
              No registered customer matching "{searchTerm}".
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
