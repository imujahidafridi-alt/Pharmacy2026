import React, { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { api } from '../../services/api';
import { useApp } from '../../context/AppContext';
import { Medicine } from '../../types';

export interface ParsedSearchCommand {
  query: string;
  qty: number;
  isReturn: boolean;
  hasExplicitUnit: boolean;
  unit: 'Loose' | 'Pack' | 'Strip';
  isBarcode: boolean;
}

export interface ItemSearchDropdownProps {
  onSelectItem: (item: Medicine, parsedCmd: ParsedSearchCommand) => void;
  onNavigateToCart?: () => void;
  onOpenMutabadil?: (formulaQuery: string) => void;
}

export function parseSearchInput(input: string): ParsedSearchCommand {
  const cmd: ParsedSearchCommand = {
    query: '',
    qty: 1,
    isReturn: false,
    hasExplicitUnit: false,
    unit: 'Loose',
    isBarcode: false,
  };

  let val = input.trim();
  if (!val) return cmd;

  // 1. Check for Wapsi / Return prefix: e.g. "-Panadol" or "-2*Panadol"
  if (val.startsWith('-')) {
    cmd.isReturn = true;
    val = val.substring(1).trim();
  }

  // Check if waiting for item name e.g. "5*"
  const waitMatch = val.match(/^(\d+)\s*\*$/);
  if (waitMatch) {
    cmd.qty = parseInt(waitMatch[1], 10) || 1;
    cmd.query = '';
    return cmd;
  }

  // 2. Check for Quantity prefix: e.g. "5*Panadol" or "5 * Panadol"
  const qtyMatch = val.match(/^(\d+)\s*\*\s*(.+)$/);
  if (qtyMatch) {
    cmd.qty = parseInt(qtyMatch[1], 10) || 1;
    val = qtyMatch[2].trim();
  }

  // 3. Check for Unit suffix: e.g. "*S" (Strip), "*B" (Box/Pack), "*T" or "*P" (Tablet/Piece)
  const unitMatch = val.match(/^(.*?)\s*\*\s*([SBTsbtPp])\s*$/);
  if (unitMatch) {
    val = unitMatch[1].trim();
    const uChar = unitMatch[2].toUpperCase();
    cmd.hasExplicitUnit = true;
    if (uChar === 'S') {
      cmd.unit = 'Strip';
    } else if (uChar === 'B') {
      cmd.unit = 'Pack';
    } else {
      cmd.unit = 'Loose';
    }
  }

  cmd.query = val;

  // 4. Barcode check: all digits and length >= 4
  const allDigits = /^\d{4,}$/.test(cmd.query);
  cmd.isBarcode = allDigits;

  if (cmd.isReturn) {
    cmd.qty = -Math.abs(cmd.qty);
  }

  return cmd;
}

export function ItemSearchDropdown({
  onSelectItem,
  onNavigateToCart,
  onOpenMutabadil,
}: ItemSearchDropdownProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Medicine[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { formatCurrency } = useApp();

  // Focus shortcuts F1, F3, Alt+M
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (document.body.classList.contains('modal-open') || document.querySelector('.modal.show')) return;
      if (e.key === 'F1' || e.key === 'F3') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (e.altKey && (e.key === 'm' || e.key === 'M')) {
        e.preventDefault();
        const cmd = parseSearchInput(query);
        onOpenMutabadil?.(cmd.query);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [query, onOpenMutabadil]);

  // Dismiss dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch results with debounce
  useEffect(() => {
    const parsed = parseSearchInput(query);
    if (!parsed.query || parsed.query.length < 1) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const meds = await api.getMedicines(parsed.query);
        setResults(meds || []);
        setIsOpen(true);
        setSelectedIndex(0);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setLoading(false);
      }
    }, 120);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (item: Medicine) => {
    const parsed = parseSearchInput(query);
    onSelectItem(item, parsed);
    setQuery('');
    setIsOpen(false);
    searchInputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (isOpen && results.length > 0) {
        setSelectedIndex((prev) => (prev + 1) % results.length);
      } else if (onNavigateToCart) {
        onNavigateToCart();
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (isOpen && results.length > 0) {
        setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (isOpen && results.length > 0 && results[selectedIndex]) {
        handleSelect(results[selectedIndex]);
      } else {
        const parsed = parseSearchInput(query);
        if (parsed.query) {
          // If query has exact match or single result, or first result
          if (results.length > 0) {
            handleSelect(results[0]);
          }
        }
      }
      return;
    }

    if (e.key === 'Escape') {
      if (isOpen) {
        setIsOpen(false);
      } else {
        setQuery('');
      }
      return;
    }
  };

  return (
    <div className="position-relative w-100" ref={containerRef}>
      <div className="input-group" style={{ height: '32px' }}>
        <span className="input-group-text bg-white py-1 px-2 border-end-0" style={{ borderColor: '#CBD5E1' }}>
          <i className="bi bi-search text-secondary" style={{ fontSize: '13px' }}></i>
        </span>
        <input
          ref={searchInputRef}
          type="text"
          className="form-control py-1 px-2 border-start-0"
          placeholder="Scan barcode or type 5*Item / -Wapsi / Alt+M for Generic (F3)..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            const parsed = parseSearchInput(query);
            if (parsed.query && results.length > 0) setIsOpen(true);
          }}
          style={{
            borderColor: '#CBD5E1',
            fontSize: '12px',
            boxShadow: 'none',
          }}
        />
        {query && (
          <button
            type="button"
            className="btn btn-sm btn-white border border-start-0 text-secondary px-2"
            style={{ borderColor: '#CBD5E1' }}
            onClick={() => {
              setQuery('');
              setIsOpen(false);
              searchInputRef.current?.focus();
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* 5-Column Live Suggestion Dropdown matching Qt PosSearchPopup */}
      {isOpen && results.length > 0 && (
        <div
          className="pos-search-popup shadow-lg"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            width: '100%',
            minWidth: '780px',
            backgroundColor: 'var(--surface-bg)',
            border: '1.5px solid var(--brand-teal)',
            borderRadius: '4px',
            zIndex: 1090,
            marginTop: '2px',
            overflow: 'hidden',
          }}
        >
          <div className="table-responsive" style={{ maxHeight: '320px' }}>
            <table className="table table-hover align-middle mb-0" style={{ fontSize: '12px' }}>
              <thead style={{ backgroundColor: 'var(--surface-subtle)', borderBottom: '2px solid var(--border-color)' }}>
                <tr className="text-secondary" style={{ fontSize: '11px', fontWeight: 700 }}>
                  <th style={{ padding: '6px 10px', width: '30%', backgroundColor: 'var(--surface-subtle)', color: 'var(--text-secondary)' }}>PRODUCT (BRAND)</th>
                  <th style={{ padding: '6px 10px', width: '32%', backgroundColor: 'var(--surface-subtle)', color: 'var(--text-secondary)' }}>GENERIC FORMULA</th>
                  <th style={{ padding: '6px 10px', width: '12%', textAlign: 'center', backgroundColor: 'var(--surface-subtle)', color: 'var(--text-secondary)' }}>PACKING</th>
                  <th style={{ padding: '6px 10px', width: '13%', textAlign: 'right', backgroundColor: 'var(--surface-subtle)', color: 'var(--text-secondary)' }}>PRICE</th>
                  <th style={{ padding: '6px 10px', width: '13%', textAlign: 'center', backgroundColor: 'var(--surface-subtle)', color: 'var(--text-secondary)' }}>STOCK</th>
                </tr>
              </thead>
              <tbody>
                {results.map((item, idx) => {
                  const isOutOfStock = (item.total_stock || 0) <= 0;
                  const isHighlighted = idx === selectedIndex;
                  const price = item.min_sale_rate || 0;

                  return (
                    <tr
                      key={item.id}
                      onClick={() => handleSelect(item)}
                      className={isHighlighted ? 'pos-row-active' : ''}
                      style={{
                        cursor: 'pointer',
                        opacity: isOutOfStock ? 0.6 : 1,
                      }}
                    >
                      <td style={{ padding: '6px 10px', fontWeight: 600 }}>
                        <div className="d-flex align-items-center gap-1">
                          <span style={{ color: isHighlighted ? 'var(--brand-teal)' : 'var(--text-primary)' }}>{item.name}</span>
                          {item.rack_location && (
                            <span className="badge px-1" style={{ fontSize: '10px', backgroundColor: 'var(--badge-bg)', color: 'var(--badge-text)', border: '1px solid var(--badge-border)' }}>
                              {item.rack_location}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '6px 10px', color: isHighlighted ? 'var(--brand-teal)' : 'var(--text-muted)' }}>
                        {item.generic_name || '-'}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'center', color: isHighlighted ? 'var(--brand-teal)' : 'var(--text-secondary)' }}>
                        {item.pack_size > 1 ? `Pack (${item.pack_size})` : '1 unit'}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: isHighlighted ? 'var(--brand-teal)' : 'var(--text-primary)' }}>
                        {price > 0 ? formatCurrency(price) : '-'}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                        {isOutOfStock ? (
                          <span className="badge bg-danger-subtle text-danger" style={{ fontSize: '10px' }}>
                            Out of Stock
                          </span>
                        ) : (
                          <span
                            className="badge"
                            style={{
                              backgroundColor: isHighlighted ? 'var(--brand-teal)' : 'var(--surface-subtle)',
                              color: isHighlighted ? '#FFFFFF' : 'var(--text-primary)',
                              border: '1px solid var(--border-color)',
                              fontSize: '11px',
                              fontWeight: 600,
                            }}
                          >
                            {item.total_stock}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div
            className="px-2 py-1 bg-light border-top d-flex justify-content-between align-items-center text-secondary"
            style={{ fontSize: '11px' }}
          >
            <span>
              Use <span className="kbd">↑</span> <span className="kbd">↓</span> to navigate, <span className="kbd">Enter</span> to select
            </span>
            <span>
              Press <span className="kbd">Alt+M</span> for Mutabadil Generic Alternatives
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
