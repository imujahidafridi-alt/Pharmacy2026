import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useApp } from '../../context/AppContext';
import { Medicine } from '../../types';

export interface MutabadilModalProps {
  isOpen: boolean;
  onClose: () => void;
  genericFormula: string;
  currentItemName?: string;
  currentPrice?: number;
  onSelectAlternative: (item: Medicine) => void;
}

export function MutabadilModal({
  isOpen,
  onClose,
  genericFormula,
  currentItemName,
  currentPrice = 0,
  onSelectAlternative,
}: MutabadilModalProps) {
  const [results, setResults] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [searchFormula, setSearchFormula] = useState<string>(genericFormula || '');
  const toast = useToast();
  const { formatCurrency } = useApp();

  useEffect(() => {
    if (isOpen) {
      const formula = genericFormula || '';
      setSearchFormula(formula);
      if (formula.trim()) {
        fetchAlternatives(formula.trim());
      } else {
        setResults([]);
      }
    }
  }, [isOpen, genericFormula]);

  const fetchAlternatives = async (formula: string) => {
    setLoading(true);
    try {
      const meds = await api.getMedicines(formula);
      // Filter out only active medicines that match or have stock
      setResults(meds || []);
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to load Mutabadil alternatives: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchFormula.trim()) {
      fetchAlternatives(searchFormula.trim());
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="MUTABADIL ALTERNATIVES (GENERIC SUBSTITUTES)"
      maxWidth="780px"
      footer={
        <div className="d-flex justify-content-between align-items-center w-100">
          <span className="small text-secondary">
            Press <span className="kbd">Esc</span> to close • Select any brand to substitute into bill
          </span>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="d-flex flex-column gap-3">
        {/* Formula Search Strip */}
        <form onSubmit={handleSearchSubmit} className="input-group input-group-sm">
          <span className="input-group-text bg-body-tertiary fw-bold text-teal" style={{ color: '#0F766E' }}>
            <i className="bi bi-capsule-pill me-1"></i> Generic Formula:
          </span>
          <input
            type="text"
            className="form-control"
            placeholder="Type active generic formula or salt..."
            value={searchFormula}
            onChange={(e) => setSearchFormula(e.target.value)}
            autoFocus
          />
          <button type="submit" className="btn btn-primary" style={{ backgroundColor: '#0F766E', borderColor: '#0D5F59' }}>
            <i className="bi bi-search me-1"></i> Find Brands
          </button>
        </form>

        {currentItemName && (
          <div className="alert alert-info py-2 px-3 mb-0 small d-flex justify-content-between align-items-center">
            <div>
              <strong>Current Selection:</strong> {currentItemName}
              {genericFormula && <span className="text-secondary ms-2">({genericFormula})</span>}
            </div>
            {currentPrice > 0 && (
              <span className="fw-bold">Current Rate: {formatCurrency(currentPrice)}</span>
            )}
          </div>
        )}

        {/* Results Table */}
        <div className="border rounded overflow-hidden shadow-xs">
          {loading ? (
            <div className="text-center py-4 text-secondary">
              <div className="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
              Searching alternative brands...
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-5 text-secondary">
              <i className="bi bi-info-circle fs-3 d-block mb-2 text-muted"></i>
              No alternative brands found for "{searchFormula}".
            </div>
          ) : (
            <div className="table-responsive" style={{ maxHeight: '350px' }}>
              <table className="table table-hover align-middle mb-0" style={{ fontSize: '0.85rem' }}>
                <thead className="table-light sticky-top">
                  <tr>
                    <th>BRAND / PRODUCT</th>
                    <th>MANUFACTURER</th>
                    <th className="text-center">PACKING</th>
                    <th className="text-end">PRICE</th>
                    <th className="text-center">SAVINGS</th>
                    <th className="text-center">STOCK</th>
                    <th className="text-end">ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((med) => {
                    const isCurrent = med.name === currentItemName;
                    const price = med.min_sale_rate || 0;
                    const savings = currentPrice > 0 && price > 0 && price < currentPrice
                      ? currentPrice - price
                      : 0;
                    const stock = med.total_stock || 0;

                    return (
                      <tr
                        key={med.id}
                        className={isCurrent ? 'table-active' : ''}
                        style={{ cursor: stock > 0 ? 'pointer' : 'default' }}
                        onDoubleClick={() => {
                          if (stock > 0) {
                            onSelectAlternative(med);
                            onClose();
                          }
                        }}
                      >
                        <td>
                          <div className="fw-bold" style={{ color: 'var(--text-primary)' }}>
                            {med.name} {isCurrent && <span className="badge text-bg-teal" style={{ backgroundColor: 'var(--brand-teal)' }}>Current</span>}
                          </div>
                          <div className="text-secondary" style={{ fontSize: '0.75rem' }}>
                            {med.generic_name}
                          </div>
                        </td>
                        <td>{med.category || '-'}</td>
                        <td className="text-center">
                          <span className="badge border" style={{ backgroundColor: 'var(--badge-bg)', color: 'var(--badge-text)', borderColor: 'var(--badge-border)' }}>
                            {(med.pack_size || 1) > 1 ? `Pack of ${med.pack_size}` : '1 unit'}
                          </span>
                        </td>
                        <td className="text-end fw-semibold">
                          {price > 0 ? formatCurrency(price) : '-'}
                        </td>
                        <td className="text-center">
                          {savings > 0 ? (
                            <span className="fw-bold text-success">
                              Save {formatCurrency(savings)}
                            </span>
                          ) : (
                            <span className="text-muted">-</span>
                          )}
                        </td>
                        <td className="text-center">
                          {stock > 0 ? (
                            <span className="badge bg-success-subtle text-success border border-success-subtle">
                              {stock} units
                            </span>
                          ) : (
                            <span className="badge bg-danger-subtle text-danger border border-danger-subtle">
                              Out of Stock
                            </span>
                          )}
                        </td>
                        <td className="text-end">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary py-0 px-2 fw-semibold"
                            style={{ fontSize: '0.78rem' }}
                            disabled={stock <= 0}
                            onClick={() => {
                              onSelectAlternative(med);
                              onClose();
                            }}
                          >
                            <i className="bi bi-arrow-left-right me-1"></i> Swap
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
