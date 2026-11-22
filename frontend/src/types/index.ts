export interface Medicine {
  id: number;
  code?: string;
  name: string;
  generic_name?: string;
  category?: string;
  brand?: string;
  manufacturer?: string;
  rack_location?: string;
  barcode?: string;
  dosage_form?: string;
  unit_type?: string;
  pack_size?: number;
  pieces_per_strip?: number;
  strips_per_box?: number;
  cost_price?: number;
  mrp?: number;
  sale_price?: number;
  strip_sale_price?: number;
  box_sale_price?: number;
  min_stock_alert?: number;
  is_prescription_required?: number | boolean;
  is_active?: number | boolean;
  discount_rule?: number;
  discount_pct?: number;
  total_stock?: number;
  current_stock?: number;
  nearest_expiry?: string;
  min_sale_rate?: number;
  max_sale_rate?: number;
  min_purchase_rate?: number;
  created_at?: string;
}

export interface Batch {
  id: number;
  medicine_id: number;
  medicine_name?: string;
  generic_name?: string;
  category?: string;
  rack_location?: string;
  batch_number: string;
  expiry_date: string;
  purchase_rate: number;
  sale_rate: number;
  quantity: number;
  pack_size?: number;
  unit_type?: string;
  days_until_expiry?: number;
  expiry_status?: 'expired' | 'critical' | 'warning' | 'healthy';
  is_quarantined?: number | boolean;
  created_at?: string;
}

export interface CartItem {
  medicine_id: number;
  batch_id: number;
  name: string;
  generic_name?: string;
  category?: string;
  rack_location?: string;
  batch_number: string;
  expiry_date: string;
  expiry_status?: string;
  quantity: number | string;
  unit_price: number;
  mrp: number;
  discount_percent: number | string;
  total: number;
  max_stock: number;
  cost_price?: number;
  unit_type?: string;
  pack_size?: number;
  pack_price?: number;
  pieces_per_strip?: number;
  strips_per_box?: number;
  strip_sale_price?: number;
  box_sale_price?: number;
  base_units_deducted?: number;
  is_prescription_required?: number | boolean;
  available_batches?: Batch[];
  is_return?: boolean;
}

export interface Customer {
  id: number;
  name: string;
  phone?: string;
  address?: string;
  credit_limit?: number;
  current_balance?: number;
  balance?: number;
  notes?: string;
  total_purchases?: number;
  created_at?: string;
}

export interface CustomerLedgerEntry {
  id: number;
  customer_id: number;
  date: string;
  transaction_type: 'SALE' | 'PAYMENT' | 'RETURN' | 'OPENING' | string;
  reference_id?: number | null;
  debit: number;
  credit: number;
  balance: number;
  notes?: string;
}

export interface Supplier {
  id: number;
  name: string;
  company?: string;
  phone?: string;
  email?: string;
  address?: string;
  payment_terms?: string;
  current_balance?: number;
  created_at?: string;
}

export interface InvoiceItem {
  id?: number;
  invoice_id?: number;
  medicine_id: number;
  batch_id: number;
  medicine_name: string;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  unit_type: string;
  pack_size: number;
  unit_price: number;
  discount_percent: number;
  total_price: number;
}

export interface Invoice {
  id?: number;
  invoice_number?: string;
  date?: string;
  customer_id?: number | null;
  customer_name: string;
  doctor_name?: string;
  subtotal: number;
  discount_amount: number;
  discount_percent?: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  change_amount: number;
  payment_mode: 'CASH' | 'CARD' | 'KHATA' | 'ONLINE';
  status?: string;
  notes?: string;
  items: InvoiceItem[];
}

export interface PurchaseItem {
  medicine_id: number;
  medicine_name?: string;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  bonus_quantity: number;
  unit_type: 'Pack' | 'Loose';
  pack_size: number;
  purchase_rate: number;
  sale_rate: number;
  total_amount: number;
}

export interface Purchase {
  id?: number;
  supplier_id: number;
  invoice_number: string;
  total_amount: number;
  paid_amount: number;
  payment_mode: string;
  items: PurchaseItem[];
  created_at?: string;
}

export interface ToastMessage {
  id: string;
  title?: string;
  message: string;
  type?: 'success' | 'danger' | 'warning' | 'info';
}
