import React, { useState, useEffect, useRef } from 'react';
import { CustomerSelectModal } from './CustomerSelectModal';
import { BillDiscountModal } from './BillDiscountModal';
import { MutabadilModal } from './MutabadilModal';
import { BatchSelectorModal } from './BatchSelectorModal';
import { BelowCostWarningModal, BelowCostItemWarning, getApplicableCost } from './BelowCostWarningModal';
import { ThermalReceiptModal } from './ThermalReceiptModal';
import { ParkedBillsModal } from './ParkedBillsModal';
import { ReturnBillModal } from './ReturnBillModal';
import { useApp } from '../../context/AppContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../services/api';
import { Batch, CartItem, Customer, Invoice, Medicine } from '../../types';

export interface ParsedSearchCommand {
  query: string;
  qty: number;
  isReturn: boolean;
  isBarcode: boolean;
}

export function parseSearchInput(input: string): ParsedSearchCommand {
  const cmd: ParsedSearchCommand = {
    query: '',
    qty: 1,
    isReturn: false,
    isBarcode: false,
  };

  let val = input.trim();
  if (!val) return cmd;

  // 1. Check for Wapsi / Return prefix: e.g. "-Panadol" or "-2*Panadol"
  if (val.startsWith('-')) {
    cmd.isReturn = true;
    val = val.substring(1).trim();
  }

  // Check if waiting for item name e.g. "5*" or "10*"
  const waitMatch = val.match(/^(\d+)\s*\*$/);
  if (waitMatch) {
    cmd.qty = parseInt(waitMatch[1], 10) || 1;
    cmd.query = '';
    return cmd;
  }

  // 2. Check for Quantity prefix: e.g. "10*Panadol", "2*Arinac Forte"
  const prefixMatch = val.match(/^(\d+)\s*\*\s*(.+)$/);
  if (prefixMatch) {
    cmd.qty = parseInt(prefixMatch[1], 10) || 1;
    val = prefixMatch[2].trim();
  }

  cmd.query = val;

  // 3. Barcode check: all digits and length >= 4
  const allDigits = /^\d{4,}$/.test(cmd.query);
  cmd.isBarcode = allDigits;

  if (cmd.isReturn) {
    cmd.qty = -Math.abs(cmd.qty);
  }

  return cmd;
}

function formatPackingDisplay(item: Medicine): string {
  const size = item.pack_size || 1;
  return `${size} / pack`;
}

function formatProductBrandDisplay(item: Medicine): string {
  if (item.manufacturer && !item.name.includes(item.manufacturer)) {
    return `${item.name} (${item.manufacturer})`;
  }
  return item.name;
}

export function POSTerminal() {
  const { formatCurrency, refreshStats } = useApp();
  const toast = useToast();

  // Search Input & In-Place Table Mode State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<Medicine[]>([]);
  const [searchSelectedIndex, setSearchSelectedIndex] = useState<number>(0);
  const [isSearchLoading, setIsSearchLoading] = useState<boolean>(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isSearching = searchQuery.trim().length > 0;

  // Active Cart State
  const [cart, setCart] = useState<any[]>([]);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number>(-1);
  const [discountPercent, setDiscountPercent] = useState<number | string>(0);
  const [taxPercent, setTaxPercent] = useState<number | string>(0);
  const [chillarRoundDiscount, setChillarRoundDiscount] = useState<number>(0);
  const [cashReceivedStr, setCashReceivedStr] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'ONLINE' | 'CREDIT'>('CASH');
  const [isProcessingCheckout, setIsProcessingCheckout] = useState<boolean>(false);

  // Bill Meta
  const [billNumber, setBillNumber] = useState<string>(() => {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `BILL-${today}-${rand}`;
  });

  // Customer Context
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | string>('');

  // Held Bills Counter
  const [heldBillsCount, setHeldBillsCount] = useState<number>(0);

  // Modals state
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState<boolean>(false);
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState<boolean>(false);
  const [isMutabadilModalOpen, setIsMutabadilModalOpen] = useState<boolean>(false);
  const [mutabadilFormula, setMutabadilFormula] = useState<string>('');
  const [mutabadilCurrentItem, setMutabadilCurrentItem] = useState<{ name: string; price: number } | null>(null);
  const [batchModalMed, setBatchModalMed] = useState<Medicine | null>(null);
  const [activeCartIdxForBatch, setActiveCartIdxForBatch] = useState<number>(-1);
  const [isBelowCostModalOpen, setIsBelowCostModalOpen] = useState<boolean>(false);
  const [belowCostWarningItems, setBelowCostWarningItems] = useState<BelowCostItemWarning[]>([]);
  const [pendingCheckoutAfterWarning, setPendingCheckoutAfterWarning] = useState<boolean>(false);
  const [pendingRevertIndex, setPendingRevertIndex] = useState<number | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState<boolean>(false);
  const [createdInvoice, setCreatedInvoice] = useState<Invoice | null>(null);
  const [lastCompletedInvoice, setLastCompletedInvoice] = useState<Invoice | null>(null);
  const [isParkedModalOpen, setIsParkedModalOpen] = useState<boolean>(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState<boolean>(false);

  // Qty and Price input refs for keyboard focus
  const qtyInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const priceInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Row DOM refs for auto-scrolling keyboard selection
  const searchRowRefs = useRef<(HTMLTableRowElement | null)[]>([]);
  const cartRowRefs = useRef<(HTMLTableRowElement | null)[]>([]);

  // Auto-scroll active search row into view on arrow navigation
  useEffect(() => {
    if (isSearching && searchRowRefs.current[searchSelectedIndex]) {
      searchRowRefs.current[searchSelectedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [searchSelectedIndex, isSearching]);

  // Auto-scroll active cart row into view on arrow navigation
  useEffect(() => {
    if (!isSearching && cartRowRefs.current[selectedRowIndex]) {
      cartRowRefs.current[selectedRowIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedRowIndex, isSearching]);

  // Focus Search Bar on Initial Mount & Fetch latest invoice for reprint
  useEffect(() => {
    searchInputRef.current?.focus();
    api.getInvoices(1)
      .then((invs) => {
        if (invs && invs.length > 0) {
          setLastCompletedInvoice(invs[0]);
        }
      })
      .catch(() => {});
  }, []);

  // Load Initial Data: Customers & Parked Bills Count
  const refreshHeldCount = async () => {
    try {
      const parked = await api.getParkedInvoices();
      setHeldBillsCount((parked || []).length);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    api.getCustomers().then((data) => setCustomers(data || [])).catch(console.error);
    refreshHeldCount();
  }, []);

  const selectedCustomer = customers.find((c) => String(c.id) === String(selectedCustomerId));

  // Live In-Place Search Query Debounce
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      setSearchSelectedIndex(0);
      setIsSearchLoading(false);
      return;
    }

    const parsed = parseSearchInput(trimmed);
    if (!parsed.query) {
      setSearchResults([]);
      setSearchSelectedIndex(0);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchLoading(true);
      try {
        const meds = await api.getMedicines(parsed.query, '', '1');
        setSearchResults(meds || []);
        setSearchSelectedIndex(0);
      } catch (err) {
        console.error('Search fetch error:', err);
      } finally {
        setIsSearchLoading(false);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset bill when transaction finishes or cleared
  const resetBill = () => {
    setCart([]);
    setSelectedRowIndex(-1);
    setSearchQuery('');
    setSearchResults([]);
    setDiscountPercent(0);
    setTaxPercent(0);
    setChillarRoundDiscount(0);
    setCashReceivedStr('');
    setPaymentMode('CASH');
    setSelectedCustomerId('');
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    setBillNumber(`BILL-${today}-${rand}`);
    refreshHeldCount();
    searchInputRef.current?.focus();
  };

  // Line Total Calculation
  const calculateLineTotal = (item: any): number => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unit_price) || 0;
    const raw = qty * price;
    const disc = raw * ((Number(item.discount_percent) || 0) / 100);
    return Math.round((raw - disc) * 100) / 100;
  };

  // Add Item to Cart with Command Parser & FEFO
  const handleSelectItem = async (medicine: Medicine, parsedCmd?: ParsedSearchCommand) => {
    try {
      const batches = await api.getBatches(medicine.id);
      const validBatches = (batches || []).filter(
        (b) => b.quantity > 0 && b.expiry_status !== 'expired'
      );

      if (validBatches.length === 0) {
        toast.error(`No valid non-expired stock available for ${medicine.name}!`);
        return;
      }

      validBatches.sort((a, b) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime());
      const nearestBatch = validBatches[0];

      const packSize = medicine.pack_size || 1;
      // Sale rate is always per base unit. MRP/TP are per pack, so convert MRP for display.
      const unitPrice = Number(medicine.sale_price || nearestBatch.sale_rate || 0);
      const packMrp = Number(medicine.mrp || 0);
      const baseMrp = packMrp > 0 ? Math.round((packMrp / packSize) * 100) / 100 : unitPrice;
      const costPrice = Number(nearestBatch.purchase_rate || medicine.cost_price || 0);
      const inputQty = parsedCmd ? parsedCmd.qty : 1;

      // Check if existing item in cart
      const existingIdx = cart.findIndex(
        (it) => it.medicine_id === medicine.id && it.batch_id === nearestBatch.id
      );

      if (existingIdx >= 0) {
        const updated = [...cart];
        const curQty = Number(updated[existingIdx].quantity) || 0;
        const newQty = curQty + inputQty;
        updated[existingIdx].quantity = newQty;
        if (!updated[existingIdx].cost_price && costPrice > 0) {
          updated[existingIdx].cost_price = costPrice;
        }
        updated[existingIdx].total = calculateLineTotal(updated[existingIdx]);
        setCart(updated);
        setSelectedRowIndex(existingIdx);
      } else {
        const newItem: CartItem = {
          medicine_id: medicine.id,
          name: medicine.name,
          generic_name: medicine.generic_name || '',
          rack_location: medicine.rack_location || '',
          category: medicine.category || '',
          is_prescription_required: medicine.is_prescription_required || 0,
          batch_id: nearestBatch.id,
          batch_number: nearestBatch.batch_number,
          expiry_date: nearestBatch.expiry_date,
          expiry_status: nearestBatch.expiry_status,
          pack_size: packSize,
          unit_type: 'Unit',
          pack_price: Math.round(unitPrice * packSize * 100) / 100,
          unit_price: unitPrice,
          cost_price: costPrice,
          mrp: baseMrp,
          quantity: inputQty,
          discount_percent: 0,
          total: Number((unitPrice * inputQty).toFixed(2)),
          max_stock: nearestBatch.quantity,
          is_return: parsedCmd?.isReturn || false,
        };
        setCart((prev) => [newItem, ...prev]);
        setSelectedRowIndex(0);
      }

      if (parsedCmd?.isReturn) {
        toast.info(`Added WAPSI return: ${medicine.name} (Qty: ${inputQty})`);
      }
    } catch (err: any) {
      toast.error('Failed to resolve medicine batch: ' + err.message);
    }
  };

  // Add Item Directly from In-Place Search Results Table
  const handleAddSearchResult = (medicine: Medicine) => {
    const parsedCmd = parseSearchInput(searchQuery);
    handleSelectItem(medicine, parsedCmd);
    setSearchQuery('');
    setSearchResults([]);
    setSearchSelectedIndex(0);
    searchInputRef.current?.focus();
  };

  // Quantity Change (supports deleting digits completely while typing)
  const handleQuantityChange = (idx: number, newQty: string | number) => {
    const updated = [...cart];
    if (newQty === '' || newQty === undefined) {
      updated[idx].quantity = '';
      updated[idx].total = 0;
      setCart(updated);
      return;
    }
    const clean = String(newQty).replace(/[^0-9-]/g, '');
    if (clean === '' || clean === '-') {
      updated[idx].quantity = clean;
      updated[idx].total = 0;
      setCart(updated);
      return;
    }
    const qty = parseInt(clean, 10);
    if (isNaN(qty)) return;

    updated[idx].quantity = qty;
    updated[idx].total = calculateLineTotal({ ...updated[idx], quantity: qty });
    setCart(updated);
  };

  const handleIncrementQty = (idx: number) => {
    const item = cart[idx];
    if (!item) return;
    const currentQty = Number(item.quantity) || 0;
    handleQuantityChange(idx, currentQty + 1);
  };

  const handleDecrementQty = (idx: number) => {
    const item = cart[idx];
    if (!item) return;
    const currentQty = Number(item.quantity) || 0;
    if (currentQty <= 1 && currentQty > 0) {
      handleRemoveItem(idx);
      return;
    }
    handleQuantityChange(idx, currentQty - 1);
  };

  // Line Discount Change
  const handleLineDiscountChange = (idx: number, disc: string | number) => {
    const updated = [...cart];
    if (disc === '' || disc === undefined) {
      updated[idx].discount_percent = '';
      updated[idx].total = calculateLineTotal({ ...updated[idx], discount_percent: 0 });
      setCart(updated);
      return;
    }
    const clean = String(disc).replace(/[^0-9.]/g, '');
    if (clean === '') {
      updated[idx].discount_percent = '';
      updated[idx].total = calculateLineTotal({ ...updated[idx], discount_percent: 0 });
      setCart(updated);
      return;
    }
    const parts = clean.split('.');
    const formatted = parts[0] + (parts.length > 1 ? '.' + parts.slice(1).join('') : '');
    const d = parseFloat(formatted);
    if (isNaN(d)) return;
    const clamped = Math.min(100, Math.max(0, d));
    // Retain typing string when in progress (e.g. trailing dot or zero)
    updated[idx].discount_percent = formatted;
    updated[idx].total = calculateLineTotal({ ...updated[idx], discount_percent: clamped });
    setCart(updated);
  };

  // Sale Price Override (pharmacist can negotiate or set counter rate)
  const handlePriceOverride = (idx: number, newPrice: string | number) => {
    const updated = [...cart];
    if (newPrice === '' || newPrice === undefined) {
      updated[idx].unit_price = '';
      updated[idx].total = 0;
      setCart(updated);
      return;
    }
    const clean = String(newPrice).replace(/[^0-9.]/g, '');
    if (clean === '') {
      updated[idx].unit_price = '';
      updated[idx].total = 0;
      setCart(updated);
      return;
    }
    const parts = clean.split('.');
    const formatted = parts[0] + (parts.length > 1 ? '.' + parts.slice(1).join('') : '');
    const price = parseFloat(formatted);
    if (isNaN(price)) return;

    // Preserve string formatting during typing so dots and decimal places are not truncated
    updated[idx].unit_price = formatted;
    updated[idx].total = calculateLineTotal({ ...updated[idx], unit_price: price });
    setCart(updated);
  };

  // Remove Item
  const handleRemoveItem = (idx: number) => {
    if (idx < 0 || idx >= cart.length) return;
    const removedName = cart[idx].name;
    setCart((prev) => prev.filter((_, i) => i !== idx));
    if (selectedRowIndex >= cart.length - 1) {
      setSelectedRowIndex(Math.max(0, cart.length - 2));
    }
    toast.info(`Removed '${removedName}' from cart`);
    searchInputRef.current?.focus();
  };

  // Pakistani Chillar Rounding (Alt+R): Round to nearest Rs. 5
  const handleChillarRound = () => {
    const rawSubtotal = cart.reduce((acc, it) => acc + (Number(it.total) || 0), 0);
    const regularDiscount = rawSubtotal * ((Number(discountPercent) || 0) / 100);
    const netPayable = Math.max(0, rawSubtotal - regularDiscount - chillarRoundDiscount);

    if (netPayable <= 0) {
      toast.warning('No payable amount to round.');
      return;
    }

    const rupees = Math.floor(netPayable);
    const remainder = rupees % 5;
    if (remainder > 0) {
      const newRound = chillarRoundDiscount + remainder;
      setChillarRoundDiscount(newRound);
      toast.info(`Chillar rounded to nearest Rs. 5 (Applied Rs. ${remainder} round-off discount)`);
    } else {
      toast.info('Bill is already rounded to nearest Rs. 5.');
    }
  };

  // Open Mutabadil
  const handleOpenMutabadil = (formula?: string) => {
    let targetFormula = formula || '';
    let currentItem = null;

    if (!targetFormula && selectedRowIndex >= 0 && cart[selectedRowIndex]) {
      targetFormula = cart[selectedRowIndex].generic_name || cart[selectedRowIndex].name;
      currentItem = {
        name: cart[selectedRowIndex].name,
        price: cart[selectedRowIndex].unit_price,
      };
    }

    setMutabadilFormula(targetFormula);
    setMutabadilCurrentItem(currentItem);
    setIsMutabadilModalOpen(true);
  };

  // Substitute alternative into bill
  const handleMutabadilSelect = (altItem: Medicine) => {
    if (selectedRowIndex >= 0 && cart[selectedRowIndex]) {
      const oldIdx = selectedRowIndex;
      setCart((prev) => prev.filter((_, i) => i !== oldIdx));
    }
    handleSelectItem(altItem);
    toast.success(`Substituted ${altItem.name} into bill`);
    searchInputRef.current?.focus();
  };

  // Batch Selection
  const handleBatchSelected = (selectedBatch: Batch) => {
    if (activeCartIdxForBatch >= 0 && cart[activeCartIdxForBatch]) {
      const updated = [...cart];
      const it = updated[activeCartIdxForBatch];
      it.batch_id = selectedBatch.id;
      it.batch_number = selectedBatch.batch_number;
      it.expiry_date = selectedBatch.expiry_date;
      it.expiry_status = selectedBatch.expiry_status;
      it.unit_price = selectedBatch.sale_rate;
      it.pack_price = Math.round(selectedBatch.sale_rate * (it.pack_size || 1) * 100) / 100;
      it.mrp = selectedBatch.sale_rate;
      it.cost_price = Number(selectedBatch.purchase_rate || it.cost_price || 0);
      it.max_stock = selectedBatch.quantity;
      it.total = calculateLineTotal(it);
      setCart(updated);
      toast.info(`Updated to Batch ${selectedBatch.batch_number}`);
      searchInputRef.current?.focus();
    }
  };

  // Finalize the sale directly from the right-side payment panel
  const handleCompleteCheckout = async () => {
    if (cart.length === 0 || isProcessingCheckout) return;

    if (paymentMode === 'CREDIT' && !selectedCustomerId) {
      toast.error('Select a customer account (F5) for a Credit / Khata sale.');
      setIsCustomerModalOpen(true);
      return;
    }

    if (paymentMode === 'CREDIT' && selectedCustomer) {
      const currentBalance = Number(selectedCustomer.balance ?? selectedCustomer.current_balance ?? 0);
      const projectedBalance = currentBalance + grandTotal;
      const creditLimit = Number(selectedCustomer.credit_limit || 10000);
      if (projectedBalance > creditLimit) {
        const proceed = window.confirm(
          `Warning: Customer credit balance will reach ${formatCurrency(
            projectedBalance
          )}, exceeding their credit limit of ${formatCurrency(
            creditLimit
          )}. Authorize credit sale anyway?`
        );
        if (!proceed) return;
      }
    }

    const paidAmount =
      paymentMode === 'CREDIT'
        ? 0
        : paymentMode === 'ONLINE'
        ? grandTotal
        : numCashReceived > 0
        ? Math.min(numCashReceived, grandTotal)
        : grandTotal;
    const changeAmount =
      paymentMode === 'CASH' && numCashReceived > grandTotal
        ? Math.round((numCashReceived - grandTotal) * 100) / 100
        : 0;

    setIsProcessingCheckout(true);
    try {
      const effectiveSubtotal = subtotal + totalMrpSavings;
      const invoicePayload = {
        customer_id: selectedCustomerId ? Number(selectedCustomerId) : 0,
        customer_name: selectedCustomer ? selectedCustomer.name : 'Walk-in Customer',
        subtotal: effectiveSubtotal > 0 ? effectiveSubtotal : subtotal,
        discount_amount: totalDiscount + totalMrpSavings,
        discount_percent: Number(discountPercent) || 0,
        tax_amount: taxAmount,
        total_amount: grandTotal,
        paid_amount: paidAmount,
        change_amount: changeAmount,
        payment_mode: paymentMode,
        items: cart.map((item) => ({
          medicine_id: item.medicine_id,
          batch_id: item.batch_id || 0,
          medicine_name: item.name,
          batch_number: item.batch_number || '',
          expiry_date: item.expiry_date || '',
          quantity: Number(item.quantity) || 1,
          unit_type: 'Unit',
          pack_size: 1,
          unit_price: Number(item.unit_price) || 0,
          discount_percent: Number(item.discount_percent) || 0,
          total_price: Number(item.total) || 0,
        })),
      };

      const result = await api.checkoutPOS(invoicePayload);
      toast.success(`Invoice ${result.invoice_number} created successfully!`);
      refreshStats();
      setLastCompletedInvoice(result);
      setCreatedInvoice(result);
      setIsReceiptModalOpen(true);
      resetBill();
      searchInputRef.current?.focus();
    } catch (err: any) {
      toast.error(err.message || 'Checkout failed');
    } finally {
      setIsProcessingCheckout(false);
    }
  };

  // Initiate Checkout with Below-Cost Price Verification
  const handleInitiateCheckout = () => {
    if (cart.length === 0) {
      toast.warning('Please scan or add items before checkout.');
      return;
    }

    // Check if any items are priced below trade/cost price
    const belowCostList: BelowCostItemWarning[] = [];
    for (let i = 0; i < cart.length; i++) {
      const it = cart[i];
      const applicableCost = getApplicableCost(it);
      const unitPrice = Number(it.unit_price) || 0;
      const discPct = Number(it.discount_percent) || 0;
      const effectivePrice = Number((unitPrice * (1 - discPct / 100)).toFixed(2));
      const qty = Math.abs(Number(it.quantity) || 1);
      const isWapsi = (Number(it.quantity) || 0) < 0 || it.is_return;
      const isUnitSale =
        (it.unit_type || '').toLowerCase() !== 'pack' &&
        (it.unit_type || '').toLowerCase() !== 'box' &&
        (it.pack_size || 1) > 1;

      if (applicableCost > 0 && effectivePrice < applicableCost && !isWapsi) {
        const unitLoss = Number((applicableCost - effectivePrice).toFixed(2));
        belowCostList.push({
          medicine_id: it.medicine_id,
          batch_id: it.batch_id,
          name: it.name,
          generic_name: it.generic_name,
          batch_number: it.batch_number,
          pack_cost: Number(it.cost_price || 0),
          applicable_cost: applicableCost,
          sale_price: effectivePrice,
          quantity: qty,
          unit_type: it.unit_type || 'Unit',
          pack_size: it.pack_size || 1,
          unit_loss: unitLoss,
          total_loss: Number((unitLoss * qty).toFixed(2)),
          is_unit_sale: isUnitSale,
        });
      }
    }

    if (belowCostList.length > 0) {
      setBelowCostWarningItems(belowCostList);
      setPendingRevertIndex(null);
      setPendingCheckoutAfterWarning(true);
      setIsBelowCostModalOpen(true);
      return;
    }

    void handleCompleteCheckout();
  };

  // Hold / Park Bill (F7)
  const handleHoldBill = async () => {
    if (cart.length === 0) {
      toast.warning('Cart is empty, nothing to hold.');
      return;
    }
    const defaultLabel = selectedCustomer ? selectedCustomer.name : 'Counter Hold';
    const note = prompt('Enter a customer name or note to hold this bill:', defaultLabel);
    if (note === null) return;

    try {
      await api.parkInvoice({
        customer_name: note || 'Held Sale',
        items: cart,
        discountPercent: Number(discountPercent) || 0,
        taxPercent: Number(taxPercent) || 0,
      });
      toast.info('Bill suspended. Ready for next customer.');
      resetBill();
    } catch (err: any) {
      toast.error('Failed to hold bill: ' + err.message);
    }
  };

  // Resume Parked Bill
  const handleResumeCart = (cartObj: any) => {
    if (cartObj.items) {
      setCart(cartObj.items);
      setDiscountPercent(cartObj.discountPercent || 0);
      setTaxPercent(cartObj.taxPercent || 0);
      if (cartObj.items.length > 0) setSelectedRowIndex(0);
      refreshHeldCount();
      searchInputRef.current?.focus();
    }
  };

  // Key Down in Search Input
  const handleSearchInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isSearching) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSearchSelectedIndex((prev) => Math.min(prev + 1, Math.max(0, searchResults.length - 1)));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSearchSelectedIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (searchResults.length > 0 && searchResults[searchSelectedIndex]) {
          handleAddSearchResult(searchResults[searchSelectedIndex]);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSearchQuery('');
        setSearchResults([]);
        return;
      }
    } else {
      // Not searching (empty query)
      if (e.key === 'ArrowDown') {
        if (cart.length > 0) {
          e.preventDefault();
          setSelectedRowIndex(0);
        }
      }
    }
  };

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if any modal is open globally or in POS
      if (
        document.body.classList.contains('modal-open') ||
        document.querySelector('.modal.show') ||
        isCustomerModalOpen ||
        isDiscountModalOpen ||
        isMutabadilModalOpen ||
        isParkedModalOpen ||
        isReturnModalOpen ||
        isReceiptModalOpen ||
        batchModalMed
      ) {
        return;
      }

      if (e.key === 'F1' || e.key === 'F3') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (e.key === 'F2') {
        e.preventDefault();
        if (selectedRowIndex >= 0 && qtyInputRefs.current[selectedRowIndex]) {
          qtyInputRefs.current[selectedRowIndex]?.focus();
          qtyInputRefs.current[selectedRowIndex]?.select();
        } else if (cart.length > 0) {
          setSelectedRowIndex(0);
          setTimeout(() => {
            qtyInputRefs.current[0]?.focus();
            qtyInputRefs.current[0]?.select();
          }, 50);
        }
      } else if (e.key === 'F4') {
        e.preventDefault();
        setIsDiscountModalOpen(true);
      } else if (e.key === 'F5') {
        e.preventDefault();
        setIsCustomerModalOpen(true);
      } else if (e.key === 'F7') {
        e.preventDefault();
        handleHoldBill();
      } else if (e.key === 'F8') {
        e.preventDefault();
        setIsParkedModalOpen(true);
      } else if (e.key === 'F9') {
        e.preventDefault();
        handleInitiateCheckout();
      } else if (e.key === 'Delete') {
        if (document.activeElement?.tagName !== 'INPUT' && selectedRowIndex >= 0) {
          e.preventDefault();
          handleRemoveItem(selectedRowIndex);
        }
      } else if (e.key === 'ArrowDown') {
        if (!isSearching && document.activeElement?.tagName !== 'INPUT' && cart.length > 0) {
          e.preventDefault();
          setSelectedRowIndex((prev) => Math.min(prev + 1, cart.length - 1));
        }
      } else if (e.key === 'ArrowUp') {
        if (!isSearching && document.activeElement?.tagName !== 'INPUT' && cart.length > 0) {
          e.preventDefault();
          setSelectedRowIndex((prev) => Math.max(prev - 1, 0));
        }
      } else if ((e.key === '+' || e.key === '=') && document.activeElement?.tagName !== 'INPUT') {
        if (selectedRowIndex >= 0) {
          e.preventDefault();
          handleIncrementQty(selectedRowIndex);
        }
      } else if (e.key === '-' && document.activeElement?.tagName !== 'INPUT') {
        if (selectedRowIndex >= 0) {
          e.preventDefault();
          handleDecrementQty(selectedRowIndex);
        }
      } else if (e.altKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        handleChillarRound();
      } else if (e.altKey && (e.key === 'm' || e.key === 'M')) {
        e.preventDefault();
        const parsed = parseSearchInput(searchQuery);
        handleOpenMutabadil(parsed.query);
      } else if (e.altKey && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault();
        setIsReturnModalOpen(true);
      } else if (e.ctrlKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        const invToPrint = createdInvoice || lastCompletedInvoice;
        if (invToPrint) {
          setCreatedInvoice(invToPrint);
          setIsReceiptModalOpen(true);
        } else {
          toast.info('No recent bill found to reprint.');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isSearching,
    cart,
    selectedRowIndex,
    isCustomerModalOpen,
    isDiscountModalOpen,
    isMutabadilModalOpen,
    isParkedModalOpen,
    isReturnModalOpen,
    isReceiptModalOpen,
    createdInvoice,
    lastCompletedInvoice,
    batchModalMed,
    discountPercent,
    chillarRoundDiscount,
    searchQuery,
  ]);

  // Calculations for Totals & MRP Savings
  const subtotal = cart.reduce((acc, it) => acc + (Number(it.total) || 0), 0);
  const totalItemsCount = cart.length;
  const totalUnits = cart.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);
  const regularDiscount = subtotal * ((Number(discountPercent) || 0) / 100);
  const totalDiscount = regularDiscount + chillarRoundDiscount;
  const afterDiscount = Math.max(0, subtotal - totalDiscount);
  const taxAmount = afterDiscount * ((Number(taxPercent) || 0) / 100);
  const grandTotal = Math.round((afterDiscount + taxAmount) * 100) / 100;

  const totalMrpSavings = cart.reduce((acc, it) => {
    const mrp = Number(it.mrp) || Number(it.unit_price) || 0;
    const sale = Number(it.unit_price) || 0;
    const qty = Number(it.quantity) || 0;
    return acc + (mrp > sale ? (mrp - sale) * qty : 0);
  }, 0);

  // Derived values for Right-Hand Cockpit (Tender & Change)
  const numCashReceived = parseFloat(cashReceivedStr) || 0;
  const changeToReturn = numCashReceived > grandTotal ? numCashReceived - grandTotal : 0;
  const remainingDue = grandTotal > numCashReceived && numCashReceived > 0 ? grandTotal - numCashReceived : 0;
  const selectedCartItem = selectedRowIndex >= 0 && cart[selectedRowIndex] ? cart[selectedRowIndex] : null;
  const isCreditContext = paymentMode === 'CREDIT' || !!selectedCustomer;

  return (
    <div
      className="d-flex flex-column h-100 w-100 overflow-hidden"
      style={{ backgroundColor: 'var(--app-bg)', color: 'var(--text-primary)', padding: '6px 8px', gap: '6px' }}
    >
      {/* 1. Sub-Header Context Row: Bill ID & Customer Info matching Qt SaleWindow */}
      <div
        className="d-flex align-items-center justify-content-between flex-shrink-0 px-1"
        style={{ minHeight: '24px' }}
      >
        {/* Left: Bill Number & Reprint Button */}
        <div className="d-flex align-items-center gap-2">
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>Bill #:</span>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--brand-teal)' }}>{billNumber}</span>
          {(lastCompletedInvoice || createdInvoice) && (
            <button
              type="button"
              className="btn btn-sm secondaryBtn d-flex align-items-center gap-1 ms-2"
              onClick={() => {
                setCreatedInvoice(createdInvoice || lastCompletedInvoice);
                setIsReceiptModalOpen(true);
              }}
              title={`Reprint Last Bill: ${(createdInvoice || lastCompletedInvoice)?.invoice_number} (Ctrl+P)`}
              style={{
                fontSize: '11px',
                padding: '1px 8px',
                height: '22px',
                lineHeight: '18px',
              }}
            >
              <i className="bi bi-printer"></i>
              <span>Reprint Last Bill ({(createdInvoice || lastCompletedInvoice)?.invoice_number})</span>
            </button>
          )}
        </div>

        {/* Right: current sale context only (counter/user are in the top bar) */}
        <div className="d-flex align-items-center gap-2">
          <span
            className="badge"
            style={{
              fontSize: '10px',
              backgroundColor: isCreditContext ? 'rgba(217, 119, 6, 0.12)' : 'rgba(15, 118, 110, 0.12)',
              color: isCreditContext ? '#D97706' : 'var(--brand-teal)',
              border: `1px solid ${isCreditContext ? 'rgba(217, 119, 6, 0.25)' : 'rgba(15, 118, 110, 0.25)'}`,
            }}
          >
            {isCreditContext ? 'Credit / Khata Sale' : `${paymentMode === 'ONLINE' ? 'Online' : 'Cash'} Sale`}
          </span>
        </div>
      </div>

      {/* 2. Main Workstation Body: Dual-Pane Workstation (72% Cart Grid / 28% Checkout Cockpit) */}
      <div className="d-flex flex-row flex-grow-1 overflow-hidden" style={{ minHeight: 0, gap: '8px' }}>
        {/* LEFT PANE: 72% Transaction Engine & Data Grid */}
        <div className="d-flex flex-column flex-grow-1 h-100 overflow-hidden" style={{ minWidth: 0, gap: '6px' }}>
          {/* Omni-Search Input (PosSearchBox) with clear button */}
          <div className="flex-shrink-0 position-relative w-100">
            <div className="input-group" style={{ height: '32px' }}>
          <input
            ref={searchInputRef}
            type="text"
            className="form-control px-2 py-1"
            placeholder="Scan barcode or type 5*Item / -Wapsi / Alt+M for Generic (F3)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchInputKeyDown}
            style={{
              borderColor: isSearching ? 'var(--brand-teal)' : 'var(--input-border)',
              borderWidth: '1.5px',
              borderRadius: '3px',
              fontSize: '12px',
              boxShadow: 'none',
              backgroundColor: 'var(--input-bg)',
              color: 'var(--input-text)',
            }}
          />
          {searchQuery && (
            <button
              type="button"
              className="btn btn-sm border border-start-0 px-2"
              style={{
                borderColor: 'var(--brand-teal)',
                borderWidth: '1.5px',
                backgroundColor: 'var(--input-bg)',
                color: 'var(--text-secondary)',
              }}
              onClick={() => {
                setSearchQuery('');
                setSearchResults([]);
                searchInputRef.current?.focus();
              }}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 3. Middle Area: Dynamic In-Place Workspace Table */}
      <div
        className="flex-grow-1 position-relative border rounded overflow-hidden shadow-xs"
        style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface-bg)', minHeight: 0 }}
      >
        <div className="h-100 overflow-y-auto">
          {isSearching ? (
            /* =========================================================================
               A. IN-PLACE SEARCH RESULTS TABLE (Matches media_1794763173249_26fefc16.png)
               ========================================================================= */
            <table
              className="table table-sm mb-0 align-middle w-100"
              style={{ fontSize: '12px', borderCollapse: 'collapse' }}
            >
              <thead
                className="sticky-top"
                style={{
                  backgroundColor: 'var(--surface-subtle)',
                  borderBottom: '2px solid var(--border-color)',
                  color: 'var(--text-secondary)',
                }}
              >
                <tr style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  <th style={{ textAlign: 'left', padding: '6px 10px', backgroundColor: 'var(--surface-subtle)' }}>
                    PRODUCT / GENERIC FORMULA
                  </th>
                  <th style={{ textAlign: 'center', padding: '6px 6px', width: '80px', backgroundColor: 'var(--surface-subtle)' }}>
                    RACK
                  </th>
                  <th style={{ textAlign: 'center', padding: '6px 6px', width: '90px', backgroundColor: 'var(--surface-subtle)' }}>
                    PACKING
                  </th>
                  <th style={{ textAlign: 'right', padding: '6px 10px', width: '90px', backgroundColor: 'var(--surface-subtle)' }}>
                    PRICE
                  </th>
                  <th style={{ textAlign: 'center', padding: '6px 8px', width: '105px', backgroundColor: 'var(--surface-subtle)' }}>
                    STOCK
                  </th>
                </tr>
              </thead>
              <tbody>
                {searchResults.map((item, idx) => {
                  const isSelected = idx === searchSelectedIndex;
                  const isOutOfStock = (item.total_stock || 0) <= 0;
                  const price = item.min_sale_rate || item.sale_price || 0;

                  return (
                    <tr
                      key={item.id}
                      ref={(el) => {
                        searchRowRefs.current[idx] = el;
                      }}
                      className={isSelected ? 'pos-row-active' : ''}
                      onClick={() => handleAddSearchResult(item)}
                      onMouseEnter={() => setSearchSelectedIndex(idx)}
                      style={{
                        cursor: 'pointer',
                        height: '38px',
                        borderBottom: '1px solid var(--ghost-row-border)',
                      }}
                    >
                      {/* 1. Product & Formula (2-Line Integrated Cell) */}
                      <td style={{ padding: '4px 10px' }}>
                        <div style={{ color: isSelected ? 'var(--brand-teal)' : 'var(--text-primary)', fontWeight: 700, fontSize: '12px' }}>
                          {formatProductBrandDisplay(item)}
                        </div>
                        {item.generic_name && (
                          <div
                            className="generic-name-text text-truncate"
                            style={{
                              fontSize: '10.5px',
                              color: isSelected ? 'var(--brand-teal)' : 'var(--text-muted)',
                              fontWeight: 500,
                              lineHeight: 1.2,
                              maxWidth: '380px',
                            }}
                          >
                            {item.generic_name}
                          </div>
                        )}
                      </td>

                      {/* 2. Rack Location */}
                      <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                        {item.rack_location ? (
                          <span
                            className="badge"
                            style={{
                              fontSize: '9.5px',
                              fontWeight: 600,
                              padding: '2px 6px',
                              backgroundColor: 'var(--badge-bg)',
                              color: 'var(--badge-text)',
                              border: '1px solid var(--badge-border)',
                            }}
                          >
                            {item.rack_location}
                          </span>
                        ) : (
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>-</span>
                        )}
                      </td>

                      {/* 3. Packing */}
                      <td
                        style={{
                          padding: '4px 8px',
                          textAlign: 'center',
                          fontSize: '11.5px',
                          color: isSelected ? 'var(--brand-teal)' : 'var(--text-secondary)',
                        }}
                      >
                        {formatPackingDisplay(item)}
                      </td>

                      {/* 4. Price */}
                      <td
                        className="price-text font-monospace"
                        style={{
                          padding: '4px 10px',
                          textAlign: 'right',
                          fontWeight: 700,
                          fontSize: '12px',
                          color: isSelected ? 'var(--brand-teal)' : 'var(--text-primary)',
                        }}
                      >
                        {price > 0 ? (price >= 1000 ? price.toLocaleString() : price.toFixed(2)) : '-'}
                      </td>

                      {/* 5. Stock Status Badge */}
                      <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                        {isOutOfStock ? (
                          <span
                            className="badge"
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '2px 6px',
                              backgroundColor: 'rgba(220, 38, 38, 0.12)',
                              color: '#DC2626',
                              border: '1px solid rgba(220, 38, 38, 0.25)',
                            }}
                          >
                            0 Avail
                          </span>
                        ) : (item.total_stock || 0) <= 10 ? (
                          <span
                            className="badge"
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '2px 6px',
                              backgroundColor: 'rgba(217, 119, 6, 0.12)',
                              color: '#D97706',
                              border: '1px solid rgba(217, 119, 6, 0.25)',
                            }}
                          >
                            {item.total_stock} Low
                          </span>
                        ) : (
                          <span
                            className="badge"
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '2px 6px',
                              backgroundColor: isSelected ? 'rgba(15, 118, 110, 0.15)' : 'rgba(22, 163, 74, 0.12)',
                              color: isSelected ? 'var(--brand-teal)' : '#16A34A',
                              border: `1px solid ${isSelected ? 'rgba(15, 118, 110, 0.3)' : 'rgba(22, 163, 74, 0.25)'}`,
                            }}
                          >
                            {item.total_stock} Avail
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {/* Ruled Gridlines (Ghost Rows) for Search Table */}
                {searchResults.length > 0 &&
                  Array.from({ length: Math.max(0, 14 - searchResults.length) }).map((_, ghostIdx) => {
                    const isEven = (searchResults.length + ghostIdx) % 2 === 0;
                    return (
                      <tr
                        key={`search-ghost-${ghostIdx}`}
                        style={{
                          height: '38px',
                          backgroundColor: isEven ? 'var(--ghost-row-even)' : 'var(--ghost-row-odd)',
                          borderBottom: '1px solid var(--ghost-row-border)',
                        }}
                      >
                        <td style={{ padding: '5px 10px' }}></td>
                        <td style={{ padding: '5px 10px' }}></td>
                        <td style={{ padding: '5px 10px' }}></td>
                        <td style={{ padding: '5px 10px' }}></td>
                        <td style={{ padding: '5px 10px' }}></td>
                      </tr>
                    );
                  })}

                {searchResults.length === 0 && !isSearchLoading && (
                  <tr>
                    <td colSpan={5} className="text-center py-5" style={{ color: 'var(--text-secondary)' }}>
                      <div className="fw-semibold">No medicines found matching "{searchQuery}"</div>
                      <div className="small mt-1" style={{ color: 'var(--text-muted)' }}>
                        Press <span className="kbd">Esc</span> to return to cart
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            /* =========================================================================
               B. CART ITEMS TABLE (Integrated 2-Line Item/Formula Grid)
               ========================================================================= */
            <table
              className="table table-sm mb-0 align-middle w-100"
              style={{ fontSize: '12px', borderCollapse: 'collapse' }}
            >
              <thead
                className="sticky-top"
                style={{
                  backgroundColor: 'var(--surface-subtle)',
                  borderBottom: '2px solid var(--border-color)',
                  color: 'var(--text-secondary)',
                }}
              >
                <tr style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  <th style={{ width: '32px', textAlign: 'center', padding: '5px 4px', backgroundColor: 'var(--surface-subtle)' }}>#</th>
                  <th style={{ textAlign: 'left', padding: '5px 8px', backgroundColor: 'var(--surface-subtle)' }}>PRODUCT / GENERIC FORMULA</th>
                  <th style={{ width: '75px', textAlign: 'center', padding: '5px 4px', backgroundColor: 'var(--surface-subtle)' }}>RACK</th>
                  <th style={{ width: '85px', textAlign: 'center', padding: '5px 4px', backgroundColor: 'var(--surface-subtle)' }}>BATCH</th>
                  <th style={{ width: '90px', textAlign: 'center', padding: '5px 4px', backgroundColor: 'var(--surface-subtle)' }}>EXPIRY</th>
                  <th style={{ width: '68px', textAlign: 'center', padding: '5px 4px', backgroundColor: 'var(--surface-subtle)' }}>QTY (F2)</th>
                  <th style={{ width: '75px', textAlign: 'right', padding: '5px 8px', backgroundColor: 'var(--surface-subtle)' }}>MRP</th>
                  <th style={{ width: '60px', textAlign: 'center', padding: '5px 4px', backgroundColor: 'var(--surface-subtle)' }}>DISC %</th>
                  <th style={{ width: '80px', textAlign: 'right', padding: '5px 8px', backgroundColor: 'var(--surface-subtle)' }}>SALE PRICE</th>
                  <th style={{ width: '95px', textAlign: 'right', padding: '5px 8px', backgroundColor: 'var(--surface-subtle)' }}>TOTAL</th>
                  <th style={{ width: '30px', textAlign: 'center', padding: '5px 4px', backgroundColor: 'var(--surface-subtle)' }}></th>
                </tr>
              </thead>
              <tbody>
                {cart.map((item, idx) => {
                  const isSelected = idx === selectedRowIndex;
                  const isWapsi = (Number(item.quantity) || 0) < 0 || item.is_return;

                  return (
                    <tr
                      key={`${item.medicine_id}-${item.batch_id}-${idx}`}
                      ref={(el) => {
                        cartRowRefs.current[idx] = el;
                      }}
                      className={isSelected ? 'pos-row-active' : ''}
                      onClick={() => setSelectedRowIndex(idx)}
                      style={{
                        cursor: 'pointer',
                        height: '38px',
                        borderBottom: '1px solid var(--ghost-row-border)',
                      }}
                    >
                      {/* 0. # */}
                      <td style={{ textAlign: 'center', fontWeight: 600, padding: '4px', color: isSelected ? 'var(--brand-teal)' : 'var(--text-muted)' }}>
                        {idx + 1}
                      </td>

                      {/* 1. PRODUCT & GENERIC FORMULA (2-Line Integrated Cell) */}
                      <td style={{ textAlign: 'left', padding: '3px 8px' }}>
                        <div className="d-flex flex-column">
                          <div className="d-flex align-items-center gap-1">
                            <span style={{ fontWeight: 700, fontSize: '12px', color: isSelected ? 'var(--brand-teal)' : 'var(--text-primary)' }}>
                              {item.name}
                            </span>
                            {isWapsi && (
                              <span
                                className="badge text-bg-danger ms-1"
                                style={{ fontSize: '9px', padding: '1px 4px' }}
                              >
                                WAPSI
                              </span>
                            )}
                          </div>
                          {item.generic_name && (
                            <span
                              className="generic-name-text text-truncate"
                              style={{
                                fontSize: '10.5px',
                                color: isSelected ? 'var(--brand-teal)' : 'var(--text-muted)',
                                fontWeight: 500,
                                opacity: 0.85,
                                maxWidth: '340px',
                                lineHeight: 1.2,
                              }}
                            >
                              {item.generic_name}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 2. RACK */}
                      <td style={{ textAlign: 'center', padding: '4px' }}>
                        {item.rack_location ? (
                          <span
                            className="badge"
                            style={{
                              fontSize: '10px',
                              fontWeight: 600,
                              padding: '2px 6px',
                              backgroundColor: 'var(--badge-bg)',
                              color: 'var(--badge-text)',
                              border: '1px solid var(--badge-border)',
                            }}
                          >
                            {item.rack_location}
                          </span>
                        ) : (
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>-</span>
                        )}
                      </td>

                      {/* 3. BATCH */}
                      <td
                        style={{ textAlign: 'center', padding: '4px', cursor: 'pointer' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setBatchModalMed({ id: item.medicine_id, name: item.name } as Medicine);
                          setActiveCartIdxForBatch(idx);
                        }}
                        title="Click to select another batch"
                      >
                        <span
                          className="font-monospace"
                          style={{
                            fontSize: '11px',
                            color: isSelected ? 'var(--brand-teal)' : 'var(--text-muted)',
                          }}
                        >
                          {item.batch_number || '-'}
                        </span>
                      </td>

                      {/* 4. EXPIRY */}
                      <td
                        style={{
                          textAlign: 'center',
                          padding: '4px',
                          fontSize: '11px',
                          color: isSelected ? 'var(--brand-teal)' : 'var(--text-muted)',
                        }}
                      >
                        {item.expiry_date || '-'}
                      </td>

                      {/* 5. QTY (F2) */}
                      <td style={{ textAlign: 'center', padding: '2px 4px' }}>
                        <input
                          ref={(el) => {
                            qtyInputRefs.current[idx] = el;
                          }}
                          type="text"
                          inputMode="numeric"
                          className="form-control form-control-sm text-center fw-bold py-0 px-1 font-monospace"
                          style={{
                            width: '52px',
                            height: '24px',
                            fontSize: '12px',
                            margin: '0 auto',
                            borderColor: 'var(--input-border)',
                            borderWidth: '1px',
                            backgroundColor: 'var(--input-bg)',
                            color: isWapsi ? '#DC2626' : 'var(--input-text)',
                            boxShadow: 'none',
                          }}
                          value={item.quantity}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => handleQuantityChange(idx, e.target.value)}
                          onBlur={() => {
                            if (item.quantity === '' || Number(item.quantity) === 0) {
                              handleQuantityChange(idx, 1);
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>

                      {/* 6. MRP */}
                      <td style={{ textAlign: 'right', padding: '4px 8px', color: 'var(--text-muted)' }}>
                        <div>{Number(item.mrp || item.unit_price).toFixed(2)}</div>
                        {Number(item.mrp) > Number(item.unit_price) && (
                          <div style={{ fontSize: '9px', color: '#16A34A', fontWeight: 600, lineHeight: 1 }}>
                            -{(Number(item.mrp) - Number(item.unit_price)).toFixed(0)} off
                          </div>
                        )}
                      </td>

                      {/* 7. DISC % */}
                      <td style={{ textAlign: 'center', padding: '2px 4px' }}>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="form-control form-control-sm text-center py-0 px-1 font-monospace"
                          style={{
                            width: '44px',
                            height: '24px',
                            fontSize: '11px',
                            margin: '0 auto',
                            borderColor: 'var(--input-border)',
                            backgroundColor: 'var(--input-bg)',
                            color: 'var(--input-text)',
                          }}
                          value={item.discount_percent}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => handleLineDiscountChange(idx, e.target.value)}
                          onBlur={() => {
                            if (item.discount_percent === '') {
                              handleLineDiscountChange(idx, 0);
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>

                      {/* 8. SALE PRICE (Rate Override) */}
                      <td style={{ textAlign: 'right', padding: '2px 4px' }} onClick={(e) => e.stopPropagation()}>
                        {(() => {
                          const applicableCost = getApplicableCost(item);
                          const isBelowCost =
                            applicableCost > 0 &&
                            Number(item.unit_price) < applicableCost &&
                            !isWapsi;

                          return (
                            <input
                              ref={(el) => {
                                priceInputRefs.current[idx] = el;
                              }}
                              type="text"
                              inputMode="decimal"
                              className="form-control form-control-sm text-end fw-bold py-0 px-1 font-monospace"
                              style={{
                                width: '70px',
                                height: '24px',
                                fontSize: '12px',
                                margin: '0 0 0 auto',
                                borderColor: isBelowCost ? '#DC2626' : 'var(--input-border)',
                                backgroundColor: isBelowCost ? 'rgba(220, 38, 38, 0.08)' : 'var(--input-bg)',
                                color: isBelowCost
                                  ? '#DC2626'
                                  : isSelected
                                  ? 'var(--brand-teal)'
                                  : 'var(--text-primary)',
                              }}
                              value={item.unit_price}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => handlePriceOverride(idx, e.target.value)}
                              onBlur={() => {
                                if (item.unit_price === '' || Number(item.unit_price) <= 0) {
                                  handlePriceOverride(idx, item.mrp || 0);
                                  return;
                                }
                                const curPrice = Number(item.unit_price);
                                if (applicableCost > 0 && curPrice < applicableCost && !isWapsi) {
                                  const unitLoss = Number((applicableCost - curPrice).toFixed(2));
                                  const qty = Math.abs(Number(item.quantity) || 1);
                                  const isUnitSale =
                                    (item.unit_type || '').toLowerCase() !== 'pack' &&
                                    (item.unit_type || '').toLowerCase() !== 'box' &&
                                    (item.pack_size || 1) > 1;

                                  setBelowCostWarningItems([
                                    {
                                      medicine_id: item.medicine_id,
                                      batch_id: item.batch_id,
                                      name: item.name,
                                      generic_name: item.generic_name,
                                      batch_number: item.batch_number,
                                      pack_cost: Number(item.cost_price || 0),
                                      applicable_cost: applicableCost,
                                      sale_price: curPrice,
                                      quantity: qty,
                                      unit_type: item.unit_type || 'Unit',
                                      pack_size: item.pack_size || 1,
                                      unit_loss: unitLoss,
                                      total_loss: Number((unitLoss * qty).toFixed(2)),
                                      is_unit_sale: isUnitSale,
                                    },
                                  ]);
                                  setPendingRevertIndex(idx);
                                  setPendingCheckoutAfterWarning(false);
                                  setIsBelowCostModalOpen(true);
                                }
                              }}
                              title={
                                isBelowCost
                                  ? `⚠️ Warning: Below Cost Price (Cost TP: Rs. ${applicableCost})`
                                  : 'Edit sale price (Rate Override)'
                              }
                            />
                          );
                        })()}
                      </td>

                      {/* 9. TOTAL */}
                      <td
                        style={{
                          textAlign: 'right',
                          padding: '4px 8px',
                          fontWeight: 700,
                          color: isWapsi ? '#DC2626' : 'var(--brand-teal)',
                        }}
                      >
                        {formatCurrency(item.total)}
                      </td>

                      {/* 10. REMOVE (✕) */}
                      <td style={{ textAlign: 'center', padding: '2px' }}>
                        <button
                          type="button"
                          className="btn btn-link text-muted p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveItem(idx);
                          }}
                          title="Remove item from bill (Del)"
                          style={{ fontSize: '12px', textDecoration: 'none', opacity: 0.6 }}
                          onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                          onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {/* Ruled Gridlines (Ghost Rows) to eliminate empty void */}
                {Array.from({ length: Math.max(0, 14 - cart.length) }).map((_, ghostIdx) => {
                  const isEven = (cart.length + ghostIdx) % 2 === 0;
                  return (
                    <tr
                      key={`cart-ghost-${ghostIdx}`}
                      style={{
                        height: '38px',
                        backgroundColor: isEven ? 'var(--ghost-row-even)' : 'var(--ghost-row-odd)',
                        borderBottom: '1px solid var(--ghost-row-border)',
                      }}
                    >
                      <td style={{ textAlign: 'center', padding: '4px' }}></td>
                      <td style={{ padding: '4px 8px' }}>
                        {cart.length === 0 && ghostIdx === 0 && (
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            🛒 Ready to scan items (type in search box or scan barcode)...
                          </span>
                        )}
                      </td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

        {/* Active Item Selection Context Bar */}
        <div
          className="px-2 py-1 rounded d-flex align-items-center justify-content-between flex-shrink-0"
          style={{
            height: '26px',
            backgroundColor: 'var(--surface-subtle)',
            border: '1px solid var(--border-color)',
            fontSize: '11px',
          }}
        >
          {selectedCartItem ? (
            <div className="d-flex align-items-center gap-3 text-truncate">
              <span className="fw-bold" style={{ color: 'var(--brand-teal)' }}>
                📌 {selectedCartItem.name}
              </span>
              <span style={{ color: 'var(--text-muted)' }}>
                Batch: <strong className="text-body">{selectedCartItem.batch_number || 'N/A'}</strong>
              </span>
              <span style={{ color: 'var(--text-muted)' }}>
                Exp: <strong className="text-body">{selectedCartItem.expiry_date || 'N/A'}</strong>
              </span>
              {selectedCartItem.rack_location && (
                <span style={{ color: 'var(--text-muted)' }}>
                  Rack: <strong className="text-body">{selectedCartItem.rack_location}</strong>
                </span>
              )}
              {selectedCartItem.max_stock !== undefined && (
                <span style={{ color: 'var(--text-muted)' }}>
                  Shelf Stock: <strong className="text-success">{selectedCartItem.max_stock} units</strong>
                </span>
              )}
            </div>
          ) : (
            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
              No row selected — use <kbd>↑</kbd> <kbd>↓</kbd> to select a cart line.
            </span>
          )}

          <div className="d-flex align-items-center gap-2 flex-shrink-0">
            <span style={{ color: 'var(--text-muted)' }}>Items in cart:</span>
            <strong style={{ color: 'var(--text-primary)' }}>{cart.length}</strong>
          </div>
        </div>
      </div>

      {/* RIGHT PANE: 28% Checkout & Customer Cockpit */}
      <div
        className="d-flex flex-column h-100 flex-shrink-0"
        style={{ width: '335px', gap: '8px', overflowY: 'auto' }}
      >
        {/* 1. Customer Dossier Card */}
        <div
          className="border rounded p-2 d-flex flex-column gap-2"
          style={{
            backgroundColor: 'var(--surface-bg)',
            borderColor: 'var(--border-color)',
            fontSize: '11.5px',
          }}
        >
          <div className="d-flex align-items-center justify-content-between">
            <span className="fw-bold text-uppercase" style={{ fontSize: '10.5px', letterSpacing: '0.4px', color: 'var(--text-muted)' }}>
              👤 Customer Account
            </span>
            <button
              type="button"
              className="btn btn-sm secondaryBtn py-0 px-2"
              onClick={() => setIsCustomerModalOpen(true)}
              style={{ fontSize: '10.5px', height: '20px', color: 'var(--brand-teal)', fontWeight: 600 }}
            >
              Change (F5)
            </button>
          </div>

          <div className="d-flex align-items-center justify-content-between">
            <span className="fw-bold text-truncate" style={{ fontSize: '13px', color: 'var(--text-primary)', maxWidth: '190px' }}>
              {selectedCustomer ? selectedCustomer.name : 'Walk in Customer'}
            </span>
            <span
              className="badge"
              style={{
                fontSize: '9.5px',
                backgroundColor: selectedCustomer ? 'var(--badge-bg)' : 'var(--surface-subtle)',
                color: selectedCustomer ? 'var(--brand-teal)' : 'var(--text-muted)',
                border: '1px solid var(--border-color)',
              }}
            >
              {selectedCustomer ? 'Registered Khata' : 'Walk-in'}
            </span>
          </div>

          {selectedCustomer && (
            <div
              className="p-1 rounded"
              style={{
                backgroundColor: (selectedCustomer.balance ?? selectedCustomer.current_balance ?? 0) > 0 ? 'var(--btn-danger-hover-bg)' : 'var(--surface-subtle)',
                border: `1px solid ${(selectedCustomer.balance ?? selectedCustomer.current_balance ?? 0) > 0 ? 'var(--btn-danger-border)' : 'var(--border-color)'}`,
              }}
            >
              <div className="d-flex align-items-center justify-content-between">
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Previous Khata Due:</span>
                <span className="fw-bold font-monospace" style={{ fontSize: '12px', color: (selectedCustomer.balance ?? selectedCustomer.current_balance ?? 0) > 0 ? '#DC2626' : '#16A34A' }}>
                  {formatCurrency(selectedCustomer.balance ?? selectedCustomer.current_balance ?? 0)}
                </span>
              </div>
              {selectedCustomer.credit_limit && (
                <div className="d-flex align-items-center justify-content-between mt-1" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                  <span>Credit Limit: {formatCurrency(selectedCustomer.credit_limit)}</span>
                  <span>Max allowed</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 2. Hero Total Payable Card */}
        <div
          id="totalDisplayCard"
          className="border rounded p-3 d-flex flex-column justify-content-between shadow-xs"
          style={{
            backgroundColor: 'var(--surface-bg)',
            borderColor: 'var(--border-color)',
          }}
        >
          <div className="d-flex align-items-center justify-content-between mb-1">
            <span className="text-uppercase fw-bold" style={{ fontSize: '11px', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>
              Net Total Payable
            </span>
            <span
              className="badge bg-primary-subtle text-primary border border-primary-subtle"
              style={{ fontSize: '10px', padding: '2px 6px' }}
            >
              {totalItemsCount} items ({totalUnits} units)
            </span>
          </div>

          <div className="my-1">
            <div
              id="totalDisplayAmount"
              className="font-monospace fw-bold"
              style={{
                fontSize: '30px',
                color: 'var(--brand-teal)',
                lineHeight: 1.1,
                letterSpacing: '-0.5px',
              }}
            >
              {formatCurrency(grandTotal)}
            </div>
          </div>

          {/* Financial Breakdown */}
          <div className="d-flex flex-column gap-1 pt-2 mt-1 border-top" style={{ borderColor: 'var(--border-color)', fontSize: '11.5px' }}>
            <div className="d-flex align-items-center justify-content-between">
              <span style={{ color: 'var(--text-muted)' }}>Subtotal:</span>
              <span className="font-monospace fw-semibold" style={{ color: 'var(--text-primary)' }}>
                {formatCurrency(subtotal)}
              </span>
            </div>

            <div className="d-flex align-items-center justify-content-between">
              <div className="d-flex align-items-center gap-1">
                <span style={{ color: 'var(--text-muted)' }}>Discount:</span>
                <button
                  type="button"
                  className="btn btn-link p-0 text-decoration-none"
                  onClick={() => setIsDiscountModalOpen(true)}
                  style={{ fontSize: '10.5px', color: 'var(--brand-teal)' }}
                >
                  (F4)
                </button>
              </div>
              <span className="font-monospace fw-semibold" style={{ color: totalDiscount > 0 ? '#16A34A' : 'var(--text-muted)' }}>
                -{formatCurrency(totalDiscount)}
              </span>
            </div>

            {totalMrpSavings > 0 && (
              <div
                className="d-flex align-items-center justify-content-between mt-1 px-2 py-1 rounded"
                style={{
                  backgroundColor: 'rgba(22, 163, 74, 0.1)',
                  border: '1px solid rgba(22, 163, 74, 0.25)',
                  fontSize: '11px',
                }}
              >
                <span style={{ color: '#16A34A', fontWeight: 600 }}>🎁 MRP Savings:</span>
                <span className="font-monospace fw-bold" style={{ color: '#16A34A' }}>
                  {formatCurrency(totalMrpSavings)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 3. Payment Mode (Cash / Online / Credit) */}
        <div
          className="border rounded p-2"
          style={{ backgroundColor: 'var(--surface-bg)', borderColor: 'var(--border-color)' }}
        >
          <div className="d-flex align-items-center justify-content-between mb-2">
            <span className="fw-bold text-uppercase" style={{ fontSize: '10.5px', letterSpacing: '0.4px', color: 'var(--text-muted)' }}>
              Payment Mode
            </span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>F9 to confirm</span>
          </div>
          <div className="d-flex gap-1">
            {([
              { id: 'CASH', label: 'Cash', icon: 'bi-cash' },
              { id: 'ONLINE', label: 'Online', icon: 'bi-phone-fill' },
              { id: 'CREDIT', label: 'Credit', icon: 'bi-journal-text' },
            ] as const).map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={`btn flex-grow-1 py-1 small fw-semibold d-flex align-items-center justify-content-center gap-1 ${
                  paymentMode === mode.id ? 'btn-primary' : 'btn-outline-secondary'
                }`}
                onClick={() => {
                  setPaymentMode(mode.id);
                  if (mode.id === 'CREDIT' && !selectedCustomerId) {
                    setIsCustomerModalOpen(true);
                  }
                  searchInputRef.current?.focus();
                }}
                style={{ fontSize: '11px' }}
              >
                <i className={`bi ${mode.icon}`}></i>
                <span>{mode.label}</span>
              </button>
            ))}
          </div>
          {paymentMode === 'CREDIT' && (
            <div className="mt-2 pt-1 border-top" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              {selectedCustomer
                ? 'Full bill amount will be posted to this customer’s khata.'
                : 'Select a customer (F5) to post this credit sale.'}
            </div>
          )}
        </div>

        {/* 4. Tender & Change Return Calculator */}
        <div
          className="border rounded p-2 d-flex flex-column gap-2"
          style={{
            backgroundColor: 'var(--surface-bg)',
            borderColor: 'var(--border-color)',
            fontSize: '11.5px',
          }}
        >
          <div className="d-flex align-items-center justify-content-between">
            <span className="fw-bold text-uppercase" style={{ fontSize: '10.5px', letterSpacing: '0.4px', color: 'var(--text-muted)' }}>
              {paymentMode === 'CREDIT' ? '🧾 CREDIT SALE' : '💵 TENDER & CHANGE'}
            </span>
            {paymentMode !== 'CREDIT' && numCashReceived > 0 && (
              <button
                type="button"
                className="btn btn-link p-0 text-decoration-none"
                onClick={() => setCashReceivedStr('')}
                style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}
              >
                Clear
              </button>
            )}
          </div>

          {paymentMode === 'CREDIT' ? (
            <div
              className="p-2 rounded text-center"
              style={{
                backgroundColor: 'rgba(217, 119, 6, 0.12)',
                border: '1px solid rgba(217, 119, 6, 0.3)',
                fontSize: '10.5px',
                color: '#D97706',
              }}
            >
              {selectedCustomer
                ? `Full amount (${formatCurrency(grandTotal)}) will be added to this customer's khata.`
                : 'Select a customer (F5) to post this credit sale.'}
            </div>
          ) : (
            <>
              {/* Tendered Input */}
          <div className="input-group input-group-sm">
            <span className="input-group-text px-2 font-monospace fw-bold" style={{ fontSize: '11px', backgroundColor: 'var(--surface-subtle)', borderColor: 'var(--input-border)', color: 'var(--text-secondary)' }}>
              Received
            </span>
            <input
              type="text"
              inputMode="numeric"
              className="form-control font-monospace fw-bold text-end"
              placeholder="0.00"
              value={cashReceivedStr}
              onFocus={(e) => e.target.select()}
              onChange={(e) => {
                const clean = e.target.value.replace(/[^0-9.]/g, '');
                setCashReceivedStr(clean);
              }}
              style={{
                fontSize: '13.5px',
                backgroundColor: 'var(--input-bg)',
                borderColor: 'var(--input-border)',
                color: 'var(--input-text)',
              }}
            />
          </div>

          {/* Quick Cash Denomination Chips */}
          <div className="d-flex align-items-center gap-1 flex-wrap">
            <button
              type="button"
              className="btn btn-sm secondaryBtn py-0 px-2 flex-grow-1"
              onClick={() => setCashReceivedStr(grandTotal > 0 ? String(grandTotal) : '')}
              style={{ fontSize: '10.5px', height: '22px' }}
            >
              Exact
            </button>
            <button
              type="button"
              className="btn btn-sm secondaryBtn py-0 px-2 flex-grow-1"
              onClick={() => setCashReceivedStr('500')}
              style={{ fontSize: '10.5px', height: '22px' }}
            >
              500
            </button>
            <button
              type="button"
              className="btn btn-sm secondaryBtn py-0 px-2 flex-grow-1"
              onClick={() => setCashReceivedStr('1000')}
              style={{ fontSize: '10.5px', height: '22px' }}
            >
              1,000
            </button>
            <button
              type="button"
              className="btn btn-sm secondaryBtn py-0 px-2 flex-grow-1"
              onClick={() => setCashReceivedStr('5000')}
              style={{ fontSize: '10.5px', height: '22px' }}
            >
              5,000
            </button>
          </div>

          {/* Return Change Display Tile */}
          {numCashReceived > 0 ? (
            changeToReturn >= 0 && numCashReceived >= grandTotal ? (
              <div
                className="p-2 rounded d-flex align-items-center justify-content-between"
                style={{
                  backgroundColor: 'rgba(22, 163, 74, 0.12)',
                  border: '1px solid rgba(22, 163, 74, 0.3)',
                }}
              >
                <span className="fw-bold" style={{ fontSize: '11px', color: '#16A34A' }}>
                  RETURN CHANGE:
                </span>
                <span className="font-monospace fw-bold" style={{ fontSize: '16px', color: '#16A34A' }}>
                  {formatCurrency(changeToReturn)}
                </span>
              </div>
            ) : (
              <div
                className="p-2 rounded d-flex align-items-center justify-content-between"
                style={{
                  backgroundColor: 'rgba(217, 119, 6, 0.12)',
                  border: '1px solid rgba(217, 119, 6, 0.3)',
                }}
              >
                <span className="fw-bold" style={{ fontSize: '11px', color: '#D97706' }}>
                  REMAINING DUE:
                </span>
                <span className="font-monospace fw-bold" style={{ fontSize: '15px', color: '#D97706' }}>
                  {formatCurrency(remainingDue)}
                </span>
              </div>
            )
          ) : (
            <div
              className="p-1 text-center rounded"
              style={{
                backgroundColor: 'var(--surface-subtle)',
                border: '1px dashed var(--border-color)',
                fontSize: '10.5px',
                color: 'var(--text-muted)',
              }}
            >
              Enter customer tendered cash for change
            </div>
          )}
            </>
          )}
        </div>

        {/* 5. Primary Checkout & Hold Actions Card */}
        <div className="d-flex flex-column gap-2 mt-auto">
          <button
            type="button"
            id="primaryCheckoutBtn"
            className="btn w-100 text-white fw-bold shadow-sm d-flex align-items-center justify-content-center gap-2"
            onClick={handleInitiateCheckout}
            disabled={isProcessingCheckout}
            style={{
              height: '44px',
              fontSize: '13.5px',
              backgroundColor: '#0F766E',
              borderColor: '#0D5F59',
              borderRadius: '4px',
            }}
          >
            <i className="bi bi-printer-fill" style={{ fontSize: '16px' }}></i>
            <span>PAY &amp; PRINT (F9 / ENTER)</span>
          </button>

          <div className="d-flex align-items-center gap-2">
            <button
              type="button"
              className="btn pos-footer-btn flex-grow-1"
              onClick={handleHoldBill}
              style={{ height: '36px', fontSize: '12px' }}
            >
              <kbd>F7</kbd>
              <span>Hold Bill</span>
            </button>

            <button
              type="button"
              className="btn pos-footer-btn flex-grow-1"
              onClick={() => setIsParkedModalOpen(true)}
              style={{ height: '36px', fontSize: '12px' }}
            >
              <kbd>F8</kbd>
              <span>Held</span>
              {heldBillsCount > 0 && (
                <span
                  className="badge bg-danger rounded-pill ms-1"
                  style={{ fontSize: '10px', padding: '2px 6px' }}
                >
                  {heldBillsCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>

    {/* 3. Sleek Keyboard Accelerators Bar */}
    <div className="d-flex align-items-center pos-footer-dock flex-shrink-0">
      <button
        type="button"
        className="btn pos-footer-btn flex-grow-1"
        onClick={() => {
          if (selectedRowIndex >= 0 && qtyInputRefs.current[selectedRowIndex]) {
            qtyInputRefs.current[selectedRowIndex]?.focus();
            qtyInputRefs.current[selectedRowIndex]?.select();
          } else if (cart.length > 0) {
            setSelectedRowIndex(0);
            qtyInputRefs.current[0]?.focus();
          }
        }}
      >
        <kbd>F2</kbd>
        <span>Quantity</span>
      </button>

      <button
        type="button"
        className="btn pos-footer-btn flex-grow-1"
        onClick={() => setIsDiscountModalOpen(true)}
      >
        <kbd>F4</kbd>
        <span>Discount</span>
      </button>

      <button
        type="button"
        className="btn pos-footer-btn flex-grow-1"
        onClick={() => setIsCustomerModalOpen(true)}
      >
        <kbd>F5</kbd>
        <span>Customer</span>
      </button>

      <button
        type="button"
        className="btn pos-footer-btn flex-grow-1"
        onClick={() => {
          const parsed = parseSearchInput(searchQuery);
          handleOpenMutabadil(parsed.query);
        }}
      >
        <kbd>Alt+M</kbd>
        <span>Mutabadil</span>
      </button>

      <button
        type="button"
        className="btn pos-footer-btn flex-grow-1"
        onClick={handleChillarRound}
      >
        <kbd>Alt+R</kbd>
        <span>Round 5</span>
      </button>

      <button
        type="button"
        className="btn pos-footer-btn flex-grow-1"
        onClick={() => setIsReturnModalOpen(true)}
      >
        <kbd>Alt+W</kbd>
        <span>Wapsi</span>
      </button>

      <button
        type="button"
        className="btn pos-footer-btn pos-footer-btn-danger flex-grow-1"
        onClick={() => {
          if (selectedRowIndex >= 0) {
            handleRemoveItem(selectedRowIndex);
          }
        }}
      >
        <kbd>Del</kbd>
        <span>Remove Row</span>
      </button>

      <button
        type="button"
        className="btn pos-footer-btn px-3"
        onClick={() => {
          if (cart.length > 0) {
            if (confirm('Clear current active bill?')) {
              resetBill();
            }
          }
        }}
        title="Clear entire cart (Esc)"
      >
        <kbd>Esc</kbd>
        <span>Clear</span>
      </button>
    </div>

      {/* --- MODALS --- */}
      {/* 1. Customer Selection Modal (F5) */}
      <CustomerSelectModal
        isOpen={isCustomerModalOpen}
        onClose={() => {
          setIsCustomerModalOpen(false);
          searchInputRef.current?.focus();
        }}
        customers={customers}
        selectedCustomerId={selectedCustomerId}
        onSelectCustomer={(id) => {
          setSelectedCustomerId(id);
          searchInputRef.current?.focus();
        }}
      />

      {/* 2. Bill Discount Modal (F4) */}
      <BillDiscountModal
        isOpen={isDiscountModalOpen}
        onClose={() => {
          setIsDiscountModalOpen(false);
          searchInputRef.current?.focus();
        }}
        subtotal={subtotal}
        currentDiscountPercent={Number(discountPercent) || 0}
        onApplyDiscount={(pct) => {
          setDiscountPercent(pct);
          searchInputRef.current?.focus();
        }}
      />

      {/* 3. Mutabadil Alternatives Modal (Alt+M) */}
      <MutabadilModal
        isOpen={isMutabadilModalOpen}
        onClose={() => {
          setIsMutabadilModalOpen(false);
          searchInputRef.current?.focus();
        }}
        genericFormula={mutabadilFormula}
        currentItemName={mutabadilCurrentItem?.name}
        currentPrice={mutabadilCurrentItem?.price}
        onSelectAlternative={handleMutabadilSelect}
      />

      {/* 4. Batch Selector Modal */}
      {batchModalMed && (
        <BatchSelectorModal
          isOpen={Boolean(batchModalMed)}
          onClose={() => {
            setBatchModalMed(null);
            setActiveCartIdxForBatch(-1);
            searchInputRef.current?.focus();
          }}
          medicine={batchModalMed}
          onSelectBatch={handleBatchSelected}
        />
      )}

      {/* 4.5. Below Cost Price Warning Modal */}
      <BelowCostWarningModal
        isOpen={isBelowCostModalOpen}
        onClose={() => {
          setIsBelowCostModalOpen(false);
          setPendingCheckoutAfterWarning(false);
          const targetIdx = pendingRevertIndex !== null ? pendingRevertIndex : selectedRowIndex;
          setPendingRevertIndex(null);
          setTimeout(() => {
            if (targetIdx >= 0 && priceInputRefs.current[targetIdx]) {
              priceInputRefs.current[targetIdx]?.focus();
              priceInputRefs.current[targetIdx]?.select();
            } else {
              searchInputRef.current?.focus();
            }
          }, 60);
        }}
        items={belowCostWarningItems}
        onConfirmSellAnyway={() => {
          setIsBelowCostModalOpen(false);
          if (pendingCheckoutAfterWarning) {
            setPendingCheckoutAfterWarning(false);
            void handleCompleteCheckout();
          }
          setPendingRevertIndex(null);
        }}
        onRevertToCost={() => {
          if (pendingRevertIndex !== null && cart[pendingRevertIndex]) {
            const applicableCost = getApplicableCost(cart[pendingRevertIndex]);
            handlePriceOverride(pendingRevertIndex, applicableCost || cart[pendingRevertIndex].mrp || 0);
          } else {
            // Revert all below-cost items to their applicable cost
            const updated = [...cart];
            updated.forEach((it, idx) => {
              const applicableCost = getApplicableCost(it);
              const curPrice = Number(it.unit_price) || 0;
              const isWapsi = (Number(it.quantity) || 0) < 0 || it.is_return;
              if (applicableCost > 0 && curPrice < applicableCost && !isWapsi) {
                updated[idx].unit_price = applicableCost;
                updated[idx].total = calculateLineTotal({ ...updated[idx], unit_price: applicableCost });
              }
            });
            setCart(updated);
          }
          setIsBelowCostModalOpen(false);
          setPendingRevertIndex(null);
          setPendingCheckoutAfterWarning(false);
        }}
      />

      {/* 5. Receipt Modal */}
      {(createdInvoice || lastCompletedInvoice) && (
        <ThermalReceiptModal
          isOpen={isReceiptModalOpen}
          onClose={() => {
            setIsReceiptModalOpen(false);
            setCreatedInvoice(null);
            searchInputRef.current?.focus();
          }}
          invoice={createdInvoice || lastCompletedInvoice}
          onNewSale={() => {
            setIsReceiptModalOpen(false);
            setCreatedInvoice(null);
            resetBill();
            searchInputRef.current?.focus();
          }}
        />
      )}

      {/* 7. Parked Bills Modal (F8) */}
      <ParkedBillsModal
        isOpen={isParkedModalOpen}
        onClose={() => {
          setIsParkedModalOpen(false);
          refreshHeldCount();
          searchInputRef.current?.focus();
        }}
        onResumeCart={handleResumeCart}
      />

      {/* 8. Return Bill Modal */}
      <ReturnBillModal
        isOpen={isReturnModalOpen}
        onClose={() => {
          setIsReturnModalOpen(false);
          searchInputRef.current?.focus();
        }}
      />
    </div>
  );
}

export default POSTerminal;
