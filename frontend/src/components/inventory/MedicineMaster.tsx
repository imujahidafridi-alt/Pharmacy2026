import React, { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../../services/api';
import { Medicine } from '../../types';
import { useToast } from '../../context/ToastContext';
import { ItemEditorModal } from './ItemEditorModal';
import { StockAdjustModal } from './StockAdjustModal';
import { CATEGORIES } from '../../utils/catalog';
import { formatStockDisplay } from '../../utils/stockFormat';

export function MedicineMaster() {
  const toast = useToast();

  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // Filters
  const [search, setSearch] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All Categories');
  const [statusFilter, setStatusFilter] = useState<string>('1'); // '1' = Active, '0' = Inactive, '-1' = All

  // Selection
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(100);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalMedicine, setModalMedicine] = useState<Medicine | null>(null);
  const [isAdjustOpen, setIsAdjustOpen] = useState<boolean>(false);
  const [adjustMedicine, setAdjustMedicine] = useState<Medicine | null>(null);
  const [sortKey, setSortKey] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const searchInputRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Load medicines from backend
  const loadMedicines = async () => {
    setLoading(true);
    try {
      const catParam = categoryFilter === 'All Categories' ? '' : categoryFilter;
      const data = await api.getMedicines(debouncedSearch, catParam, statusFilter);
      setMedicines(data || []);
      // If selected item is not in the new list, clear or keep selection
      if (selectedId) {
        const found = (data || []).find((m) => m.id === selectedId);
        if (!found) setSelectedId(null);
      }
    } catch (err: any) {
      toast.error('Failed to load items: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Wait for the cashier to stop typing before asking the server
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setSelectedId(null);
    setCurrentPage(1);
    loadMedicines();
  }, [debouncedSearch, categoryFilter, statusFilter]);

  // Selected Medicine
  const selectedMed = useMemo(() => {
    return medicines.find((m) => m.id === selectedId) || null;
  }, [medicines, selectedId]);

  // List of existing generics for autocomplete
  const existingGenerics = useMemo(() => {
    const set = new Set<string>();
    medicines.forEach((m) => {
      if (m.generic_name && m.generic_name.trim()) {
        set.add(m.generic_name.trim());
      }
    });
    return Array.from(set).sort();
  }, [medicines]);

  // Sorting + pagination
  const sortedMedicines = useMemo(() => {
    const copy = [...medicines];
    const valueOf = (med: Medicine) => {
      if (sortKey !== 'margin') return (med as any)[sortKey];
      const sale = Number(med.sale_price || med.min_sale_rate || 0);
      const pack = med.pack_size || 1;
      const costPerUnit = Number(med.cost_price || med.min_purchase_rate || 0) / pack;
      return sale > 0 && costPerUnit > 0 ? ((sale - costPerUnit) / sale) * 100 : 0;
    };
    copy.sort((a, b) => {
      const av = valueOf(a);
      const bv = valueOf(b);
      const result =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av ?? '').localeCompare(String(bv ?? ''));
      return sortDir === 'asc' ? result : -result;
    });
    return copy;
  }, [medicines, sortKey, sortDir]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((direction) => (direction === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortHeader = (label: string, key: string, className: string, width: string, title?: string) => (
    <th
      className={`${className} sortable-header`}
      style={{ fontSize: '10.5px', letterSpacing: '0.4px', width, backgroundColor: 'var(--surface-subtle)', color: 'var(--text-secondary)', cursor: 'pointer' }}
      onClick={() => handleSort(key)}
      title={title || `Sort by ${label}`}
    >
      {label} <span className="sort-indicator">{sortKey === key ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
    </th>
  );

  const totalItems = sortedMedicines.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedMedicines = useMemo(() => {
    return sortedMedicines.slice(startIndex, startIndex + pageSize);
  }, [sortedMedicines, startIndex, pageSize]);

  // Actions
  const handleAddItem = () => {
    setModalMedicine(null);
    setIsModalOpen(true);
  };

  const handleEditItem = (medToEdit?: Medicine) => {
    const target = medToEdit || selectedMed;
    if (!target) return;
    setModalMedicine(target);
    setIsModalOpen(true);
  };

  const handleToggleStatus = async () => {
    if (!selectedMed) return;
    const goingInactive = selectedMed.is_active !== 0;
    const message = goingInactive
      ? `Hide "${selectedMed.name}" from the POS?\n\nIt will stay in your records and old bills. You can bring it back any time with the Activate button.`
      : `Show "${selectedMed.name}" in the POS again?`;
    if (!window.confirm(message)) return;
    try {
      const res = await api.toggleMedicineStatus(selectedMed.id);
      const isNowActive = res && res.is_active === 1;
      if (!isNowActive && statusFilter === '1') setStatusFilter('-1');
      toast.success(`"${selectedMed.name}" is now ${isNowActive ? 'active' : 'inactive'}.`);
      await loadMedicines();
    } catch (err: any) {
      toast.error('Could not change item status: ' + err.message);
    }
  };

  const handleOpenAdjust = () => {
    if (!selectedMed) return;
    setAdjustMedicine(selectedMed);
    setIsAdjustOpen(true);
  };

  const handleDeleteItem = async () => {
    if (!selectedMed) return;
    if (!window.confirm(
      `Permanently delete "${selectedMed.name}"?\n\nThis cannot be undone. Items with stock or old bills cannot be deleted — use Deactivate instead.`
    )) return;
    try {
      await api.deleteMedicine(selectedMed.id);
      toast.success('Item deleted.');
      setSelectedId(null);
      await loadMedicines();
    } catch (err: any) {
      toast.error(err.message || 'This item cannot be deleted.');
    }
  };

  const handleSaveModal = async (payload: Partial<Medicine>) => {
    if (modalMedicine && modalMedicine.id > 0) {
      await api.updateMedicine(modalMedicine.id, payload);
      toast.success(`Product "${payload.name}" updated successfully.`);
    } else {
      await api.createMedicine(payload);
      toast.success(`Product "${payload.name}" created successfully.`);
    }
    await loadMedicines();
  };

  // Keyboard navigation on table
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // If any modal is open, completely block background table shortcuts/keys!
    if (isModalOpen || document.body.classList.contains('modal-open') || document.querySelector('.modal.show')) {
      return;
    }
    if (paginatedMedicines.length === 0) return;

    const currentIndex = paginatedMedicines.findIndex((m) => m.id === selectedId);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIdx = currentIndex < paginatedMedicines.length - 1 ? currentIndex + 1 : 0;
      setSelectedId(paginatedMedicines[nextIdx].id);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIdx = currentIndex > 0 ? currentIndex - 1 : paginatedMedicines.length - 1;
      setSelectedId(paginatedMedicines[prevIdx].id);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedMed) handleEditItem(selectedMed);
    }
  };

  // Format pack size display
  const formatPackaging = (med: Medicine): string => {
    const size = med.pack_size || med.pieces_per_strip || 1;
    return `${size} ${size === 1 ? 'unit' : 'units'} / pack`;
  };

  // Currency helper
  const formatMoney = (val?: number): string => {
    const num = Number(val) || 0;
    return `Rs. ${num.toLocaleString('en-US', { minimumFractionDigits: num % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div
      ref={rootRef}
      className="items-module d-flex flex-column h-100 w-100"
      style={{
        backgroundColor: 'var(--app-bg)',
        color: 'var(--text-primary)',
        fontFamily: "'Inter', sans-serif",
      }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* ------------------------------------------------------------- */}
      {/* TOP FILTER & ACTION BAR matching Blueprint */}
      {/* ------------------------------------------------------------- */}
      <div
        className="items-toolbar d-flex align-items-center gap-2 px-3 py-2 border-bottom flex-shrink-0"
        style={{
          backgroundColor: 'var(--surface-bg)',
          minHeight: '44px',
          borderColor: 'var(--border-color)',
        }}
      >
        {/* Full-width Search Input */}
        <div className="flex-grow-1" style={{ maxWidth: '42%' }}>
          <div className="input-group input-group-sm">
            <span
              className="input-group-text border-end-0"
              style={{
                backgroundColor: 'var(--surface-subtle)',
                borderColor: 'var(--input-border)',
                color: 'var(--text-secondary)',
              }}
            >
              <i className="bi bi-search" style={{ fontSize: '11px' }}></i>
            </span>
            <input
              ref={searchInputRef}
              type="text"
              className="form-control form-control-sm border-start-0 ps-0"
              placeholder="Search by item name, barcode, code, or generic formula..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                fontSize: '12px',
                borderColor: 'var(--input-border)',
                backgroundColor: 'var(--input-bg)',
                color: 'var(--input-text)',
                boxShadow: 'none',
              }}
            />
            {search && (
              <button
                type="button"
                className="btn btn-sm border-start-0"
                onClick={() => setSearch('')}
                style={{
                  borderColor: 'var(--input-border)',
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--text-secondary)',
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Category Dropdown */}
        <div style={{ width: '180px' }}>
          <select
            className="form-select form-select-sm"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{
              fontSize: '12px',
              borderColor: 'var(--input-border)',
              backgroundColor: 'var(--input-bg)',
              color: 'var(--input-text)',
            }}
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Status Dropdown */}
        <div style={{ width: '160px' }}>
          <select
            className="form-select form-select-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              fontSize: '12px',
              borderColor: 'var(--input-border)',
              backgroundColor: 'var(--input-bg)',
              color: 'var(--input-text)',
            }}
          >
            <option value="1">Active Items Only</option>
            <option value="0">Inactive Items Only</option>
            <option value="-1">All Statuses</option>
          </select>
        </div>

        {/* Action Buttons */}
        <div className="d-flex align-items-center gap-2 ms-auto">
          {/* + Add Item Button (Solid Teal #0F766E) */}
          <button
            type="button"
            className="btn btn-sm text-white fw-bold d-flex align-items-center gap-1 px-3"
            onClick={handleAddItem}
            style={{
              backgroundColor: '#0F766E',
              borderColor: '#0F766E',
              fontSize: '12px',
              height: '30px',
              whiteSpace: 'nowrap',
            }}
          >
            <span>+</span> Add Item
          </button>

          {/* Edit Button */}
          <button
            type="button"
            className="btn btn-sm secondaryBtn d-flex align-items-center gap-1 px-3"
            disabled={!selectedMed}
            onClick={() => handleEditItem()}
            style={{
              fontSize: '12px',
              fontWeight: 600,
              height: '30px',
              whiteSpace: 'nowrap',
            }}
          >
            <span>✏️</span> Edit
          </button>

          {/* Deactivate / Activate Button */}
          <button
            type="button"
            className="btn btn-sm secondaryBtn d-flex align-items-center gap-1 px-3"
            disabled={!selectedMed}
            onClick={handleToggleStatus}
            style={{
              fontSize: '12px',
              fontWeight: 600,
              height: '30px',
              color: !selectedMed
                ? 'var(--text-muted)'
                : selectedMed.is_active === 0
                ? '#16A34A'
                : '#DC2626',
              whiteSpace: 'nowrap',
            }}
          >
            {selectedMed && selectedMed.is_active === 0 ? (
              <>
                <span>✓</span> Activate
              </>
            ) : (
              <>
                <span>✕</span> Deactivate
              </>
            )}
          </button>

          {/* Adjust Stock — deliberately separate from pricing */}
          <button
            type="button"
            className="btn btn-sm secondaryBtn d-flex align-items-center gap-1 px-3"
            disabled={!selectedMed}
            onClick={handleOpenAdjust}
            title="Add or remove stock for a specific batch — every change is recorded"
            style={{ fontSize: '12px', fontWeight: 600, height: '30px', whiteSpace: 'nowrap' }}
          >
            <i className="bi bi-boxes"></i> Adjust Stock
          </button>

          <button
            type="button"
            className="btn btn-sm secondaryBtn d-flex align-items-center gap-1 px-3"
            disabled={!selectedMed}
            onClick={handleDeleteItem}
            title="Permanently delete an unused item"
            style={{ fontSize: '12px', fontWeight: 600, height: '30px', whiteSpace: 'nowrap', color: 'var(--btn-danger-text)' }}
          >
            <i className="bi bi-trash3"></i> Delete
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 9-COLUMN DATA TABLE with 2-Line Smart Item/Formula Cell */}
      {/* ------------------------------------------------------------- */}
      <div className="flex-grow-1 overflow-auto" style={{ backgroundColor: 'var(--surface-bg)' }}>
        <table
          ref={tableRef}
          className="table table-hover table-sm mb-0 align-middle"
          style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}
        >
          <thead
            style={{
              position: 'sticky',
              top: 0,
              backgroundColor: 'var(--surface-subtle)',
              borderBottom: '2px solid var(--border-color)',
              zIndex: 10,
              boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
            }}
          >
            <tr style={{ height: '32px' }}>
              {sortHeader('CODE', 'code', 'ps-3 py-1 text-uppercase fw-bold', '90px')}
              {sortHeader('ITEM & FORMULA', 'name', 'ps-2 py-1 text-uppercase fw-bold', '220px')}
              {sortHeader('CATEGORY', 'category', 'ps-2 py-1 text-uppercase fw-bold', '160px')}
              {sortHeader('PACK', 'pack_size', 'ps-2 py-1 text-uppercase fw-bold', '120px', 'Number of base units in one pack')}
              {sortHeader('STOCK (units)', 'total_stock', 'pe-3 py-1 text-uppercase fw-bold text-end', '110px')}
              {sortHeader('MRP / pack', 'mrp', 'pe-3 py-1 text-uppercase fw-bold text-end', '130px', 'Printed price for one full pack')}
              {sortHeader('SALE / unit', 'sale_price', 'pe-3 py-1 text-uppercase fw-bold text-end', '110px', 'Price charged for one tablet or capsule')}
              {sortHeader('TP / pack', 'cost_price', 'pe-3 py-1 text-uppercase fw-bold text-end', '110px', 'Purchase cost for one full pack')}
              {sortHeader('MARGIN / unit', 'margin', 'pe-3 py-1 text-uppercase fw-bold text-end', '120px', 'Profit per base unit')}
              <th
                className="pe-3 py-1 text-uppercase fw-bold text-center"
                style={{ fontSize: '10.5px', letterSpacing: '0.4px', width: '90px', backgroundColor: 'var(--surface-subtle)', color: 'var(--text-secondary)' }}
              >
                STATUS
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="text-center py-5" style={{ color: 'var(--text-secondary)' }}>
                  <div className="spinner-border spinner-border-sm me-2 text-teal" role="status" />
                  Loading items catalog...
                </td>
              </tr>
            ) : paginatedMedicines.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-5" style={{ color: 'var(--text-secondary)' }}>
                  No items found matching your filter criteria.
                </td>
              </tr>
            ) : (
              paginatedMedicines.map((med) => {
                const isSelected = selectedId === med.id;
                const isActive = med.is_active !== 0;

                const cost = Number(med.cost_price || (med as any).tp || med.min_purchase_rate || 0);
                const sale = Number(med.sale_price || med.min_sale_rate || 0);
                const mrp = Number(med.mrp || sale);

                // TP is per pack, sale is per base unit -> compare on the same basis
                const costPerUnit = (med.pack_size || 1) > 0 ? cost / (med.pack_size || 1) : cost;
                let marginPct = 0;
                if (sale > 0 && costPerUnit > 0) {
                  marginPct = ((sale - costPerUnit) / sale) * 100;
                }

                const brandName = med.brand || med.manufacturer || '';
                const displayName = brandName && !med.name.includes(brandName)
                  ? `${med.name} (${brandName})`
                  : med.name;

                return (
                  <tr
                    key={med.id}
                    tabIndex={0}
                    onClick={() => {
                      setSelectedId(med.id);
                      rootRef.current?.focus();
                    }}
                    onFocus={() => setSelectedId(med.id)}
                    onDoubleClick={() => handleEditItem(med)}
                    className={isSelected ? 'pos-row-active' : ''}
                    style={{
                      height: '38px',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--ghost-row-border)',
                    }}
                  >
                    {/* Col 0: CODE */}
                    <td
                      className="ps-3 py-1 font-monospace"
                      style={{ fontSize: '11px', color: isSelected ? 'var(--brand-teal)' : 'var(--text-muted)', fontWeight: 600 }}
                    >
                      {med.code || `MED-${String(med.id).padStart(3, '0')}`}
                    </td>

                    {/* Col 1: 2-Line Smart Item Name & Generic Formula */}
                    <td className="ps-2 py-1">
                      <div
                        className="fw-bold text-truncate"
                        style={{
                          fontSize: '12px',
                          color: isSelected ? 'var(--brand-teal)' : isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                          maxWidth: '380px',
                        }}
                        title={displayName}
                      >
                        {displayName}
                      </div>
                      <div
                        className="text-truncate"
                        style={{
                          fontSize: '10.5px',
                          color: isSelected ? 'var(--brand-teal)' : 'var(--text-muted)',
                          maxWidth: '380px',
                          lineHeight: '1.2',
                        }}
                      >
                        {med.generic_name || '-'}
                      </div>
                    </td>

                    {/* Col 2: CATEGORY */}
                    <td
                      className="ps-2 py-1"
                      style={{ fontSize: '11.5px', color: isSelected ? 'var(--brand-teal)' : 'var(--text-secondary)' }}
                    >
                      {med.category || 'Tablets & Capsules'}
                    </td>

                    {/* Col 3: PACKAGING */}
                    <td
                      className="ps-2 py-1"
                      style={{ fontSize: '11px', color: isSelected ? 'var(--brand-teal)' : 'var(--text-secondary)' }}
                    >
                      {formatPackaging(med)}
                    </td>

                    {/* Col 3b: STOCK */}
                    <td
                      className="pe-3 py-1 text-end font-monospace fw-bold"
                      style={{
                        fontSize: '11.5px',
                        color: isSelected
                          ? 'var(--brand-teal)'
                          : (med.total_stock || 0) <= 0
                          ? '#DC2626'
                          : (med.total_stock || 0) <= (med.min_stock_alert ?? 10)
                          ? '#D97706'
                          : 'var(--text-primary)',
                      }}
                    >
                      <span title={`${med.total_stock ?? 0} base units in stock`}>
                        {formatStockDisplay(med.total_stock ?? 0, med.pack_size || 1, true)}
                      </span>
                    </td>

                    {/* Col 4: RETAIL PRICE (MRP) */}
                    <td
                      className="pe-3 py-1 text-end"
                      style={{ fontSize: '11.5px', color: isSelected ? 'var(--brand-teal)' : 'var(--text-muted)' }}
                    >
                      {formatMoney(mrp)}
                    </td>

                    {/* Col 5: SALE PRICE */}
                    <td
                      className="pe-3 py-1 text-end fw-bold"
                      style={{ fontSize: '12px', color: isSelected ? 'var(--brand-teal)' : 'var(--text-primary)' }}
                    >
                      {formatMoney(sale)}
                    </td>

                    {/* Col 6: COST (TP) */}
                    <td
                      className="pe-3 py-1 text-end"
                      style={{ fontSize: '11.5px', color: isSelected ? 'var(--brand-teal)' : 'var(--text-muted)' }}
                    >
                      {formatMoney(cost)}
                    </td>

                    {/* Col 7: MARGIN */}
                    <td
                      className="pe-3 py-1 text-end fw-bold"
                      style={{
                        fontSize: '11.5px',
                        color: isSelected
                          ? 'var(--brand-teal)'
                          : marginPct < 0
                          ? '#DC2626'
                          : marginPct === 0
                          ? 'var(--text-muted)'
                          : '#16A34A',
                      }}
                    >
                      {marginPct > 0 ? `+${marginPct.toFixed(1)}%` : `${marginPct.toFixed(1)}%`}
                    </td>

                    {/* Col 8: STATUS */}
                    <td className="pe-3 py-1 text-center">
                      <span
                        className="badge"
                        style={{
                          fontSize: '10.5px',
                          fontWeight: 700,
                          backgroundColor: isActive ? 'var(--surface-subtle)' : 'var(--btn-danger-hover-bg)',
                          color: isActive ? '#16A34A' : 'var(--btn-danger-text)',
                          border: `1px solid ${isActive ? 'var(--border-color)' : 'var(--btn-danger-border)'}`,
                        }}
                      >
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* PAGINATION FOOTER BAR matching Blueprint */}
      {/* ------------------------------------------------------------- */}
      <div
        className="d-flex align-items-center justify-content-between px-3 py-2 border-top flex-shrink-0"
        style={{
          backgroundColor: 'var(--surface-bg)',
          minHeight: '38px',
          borderColor: 'var(--border-color)',
          fontSize: '11px',
          color: 'var(--text-secondary)',
        }}
      >
        {/* Left: Showing info */}
        <div className="fw-semibold">
          {totalItems === 0
            ? 'Showing 0 items'
            : `Showing ${startIndex + 1} - ${Math.min(startIndex + pageSize, totalItems)} of ${totalItems} items (Page ${currentPage} of ${totalPages})`}
        </div>

        {/* Right: Page Size & Navigation */}
        <div className="d-flex align-items-center gap-2">
          <span className="fw-semibold" style={{ color: 'var(--text-secondary)' }}>Page Size:</span>
          <select
            className="form-select form-select-sm py-0"
            style={{
              width: '130px',
              fontSize: '11px',
              height: '26px',
              borderColor: 'var(--input-border)',
              backgroundColor: 'var(--input-bg)',
              color: 'var(--input-text)',
            }}
            value={pageSize}
            onChange={(e) => {
              setPageSize(parseInt(e.target.value, 10));
              setCurrentPage(1);
              setSelectedId(null);
            }}
          >
            <option value={100}>100 per page</option>
            <option value={250}>250 per page</option>
            <option value={500}>500 per page</option>
          </select>

          <button
            type="button"
            className="btn btn-sm secondaryBtn py-0 px-2"
            disabled={currentPage <= 1}
            onClick={() => {
              setCurrentPage((p) => Math.max(1, p - 1));
              setSelectedId(null);
            }}
            style={{ height: '26px', fontSize: '11px' }}
          >
            ◀ Previous
          </button>

          <button
            type="button"
            className="btn btn-sm secondaryBtn py-0 px-2"
            disabled={currentPage >= totalPages}
            onClick={() => {
              setCurrentPage((p) => Math.min(totalPages, p + 1));
              setSelectedId(null);
            }}
            style={{ height: '26px', fontSize: '11px' }}
          >
            Next ▶
          </button>
        </div>
      </div>

      {/* Add / Edit Product Modal */}
      <ItemEditorModal
        isOpen={isModalOpen}
        medicine={modalMedicine}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveModal}
        existingGenerics={existingGenerics}
      />

      <StockAdjustModal
        isOpen={isAdjustOpen}
        medicine={adjustMedicine}
        onClose={() => setIsAdjustOpen(false)}
        onAdjusted={loadMedicines}
      />
    </div>
  );
}
export default MedicineMaster;
