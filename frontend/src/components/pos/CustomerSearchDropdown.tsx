import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { Customer } from '../../types';

export interface CustomerSearchDropdownProps {
  customers: Customer[];
  selectedCustomerId: number | string;
  onSelectCustomer: (id: number | string) => void;
}

export function CustomerSearchDropdown({
  customers = [],
  selectedCustomerId,
  onSelectCustomer,
}: CustomerSearchDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { formatCurrency } = useApp();

  const selectedCust = customers.find((c) => String(c.id) === String(selectedCustomerId));

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.phone && c.phone.includes(q))
    );
  });

  const handleSelect = (cust: Customer | null) => {
    onSelectCustomer(cust ? cust.id : '');
    setIsOpen(false);
  };

  return (
    <div className="d-flex align-items-center gap-1 position-relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        className="btn btn-sm btn-outline-primary d-flex align-items-center gap-1 shadow-xs py-1 px-2"
        onClick={() => setIsOpen(!isOpen)}
        style={{ fontSize: '0.82rem', minWidth: '175px', maxWidth: '230px' }}
        title="Select Walk-in or Credit Customer (Searchable)"
      >
        <i className="bi bi-person-fill text-primary"></i>
        <span className="text-truncate fw-semibold">
          {selectedCust ? selectedCust.name : 'Walk-in Customer'}
        </span>
        <i className="bi bi-chevron-down ms-auto" style={{ fontSize: '0.65rem' }}></i>
      </button>

      {/* Due badge if credit customer has outstanding debt */}
      {selectedCust && (selectedCust.current_balance || 0) > 0 && (
        <span className="badge text-bg-warning px-2 py-1 shadow-xs" style={{ fontSize: '0.72rem' }} title="Outstanding debt balance">
          Due: {formatCurrency(selectedCust.current_balance || 0)}
        </span>
      )}

      {/* Searchable Dropdown Popup */}
      {isOpen && (
        <div
          className="card shadow-lg border position-absolute bg-body"
          style={{
            top: '100%',
            left: 0,
            width: '320px',
            marginTop: '4px',
            zIndex: 1070,
            borderRadius: '8px',
          }}
        >
          {/* Search Input Box */}
          <div className="p-2 border-bottom bg-body-tertiary">
            <div className="input-group input-group-sm">
              <span className="input-group-text py-0 px-2 bg-body">
                <i className="bi bi-search text-secondary" style={{ fontSize: '0.75rem' }}></i>
              </span>
              <input
                ref={inputRef}
                type="text"
                className="form-control form-control-sm py-1"
                placeholder="Search name or phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ fontSize: '0.82rem' }}
              />
              {search && (
                <button
                  type="button"
                  className="btn btn-sm btn-link text-secondary p-0 px-1"
                  onClick={() => setSearch('')}
                >
                  <i className="bi bi-x-lg" style={{ fontSize: '0.7rem' }}></i>
                </button>
              )}
            </div>
          </div>

          {/* Customer List */}
          <div className="overflow-y-auto" style={{ maxHeight: '280px' }}>
            {/* Walk-in Option */}
            <div
              className={`p-2 px-3 border-bottom d-flex align-items-center justify-content-between cursor-pointer ${
                !selectedCustomerId ? 'bg-primary-subtle text-primary fw-bold' : 'hover-bg'
              }`}
              onClick={() => handleSelect(null)}
              style={{ cursor: 'pointer', fontSize: '0.82rem' }}
            >
              <div className="d-flex align-items-center gap-2">
                <i className="bi bi-person-circle fs-6"></i>
                <div>
                  <div className="fw-semibold">Walk-in Customer</div>
                  <div className="small text-secondary" style={{ fontSize: '0.7rem' }}>
                    Cash sale (No credit account)
                  </div>
                </div>
              </div>
              {!selectedCustomerId && <i className="bi bi-check2 text-primary fs-6"></i>}
            </div>

            {/* Registered Customer Items */}
            {filtered.length === 0 ? (
              <div className="p-3 text-center text-secondary small">
                No customer found matching "{search}"
              </div>
            ) : (
              filtered.map((c) => {
                const isSelected = String(c.id) === String(selectedCustomerId);
                const hasDue = (c.current_balance || 0) > 0;

                return (
                  <div
                    key={c.id}
                    className={`p-2 px-3 border-bottom d-flex align-items-center justify-content-between cursor-pointer ${
                      isSelected ? 'bg-primary-subtle text-primary fw-bold' : 'hover-bg'
                    }`}
                    onClick={() => handleSelect(c)}
                    style={{ cursor: 'pointer', fontSize: '0.82rem' }}
                  >
                    <div className="overflow-hidden pe-2">
                      <div className="fw-semibold text-truncate">{c.name}</div>
                      <div className="small text-secondary" style={{ fontSize: '0.7rem' }}>
                        {c.phone || 'No Phone'}
                      </div>
                    </div>

                    <div className="text-end flex-shrink-0">
                      {hasDue ? (
                        <span className="badge text-bg-warning px-1 py-0" style={{ fontSize: '0.68rem' }}>
                          Due: {formatCurrency(c.current_balance || 0)}
                        </span>
                      ) : (
                        <span className="badge text-bg-success px-1 py-0" style={{ fontSize: '0.68rem' }}>
                          Settled
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
