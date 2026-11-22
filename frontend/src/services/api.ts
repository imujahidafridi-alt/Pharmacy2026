import {
  Medicine,
  Batch,
  Invoice,
  Customer,
  CustomerLedgerEntry,
  Supplier,
  Purchase
} from '../types';

const API_BASE = '/api';

interface RequestOptions extends RequestInit {
  headers?: Record<string, string>;
}

async function request<T = any>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const config: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  try {
    const res = await fetch(url, config);
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const errMsg = (data && data.error) || `HTTP error ${res.status}`;
      throw new Error(errMsg);
    }
    return data as T;
  } catch (err) {
    console.error(`[API Error] ${endpoint}:`, err);
    throw err;
  }
}

export const api = {
  // Status
  getStatus: () => request('/status'),

  // Medicines
  getMedicines: (q = '', category = '', status = ''): Promise<Medicine[]> => {
    const params = new URLSearchParams();
    if (q) params.append('q', q);
    if (category) params.append('category', category);
    if (status !== '') params.append('status', status);
    return request<Medicine[]>(`/medicines?${params.toString()}`);
  },
  getMedicine: (id: number | string): Promise<Medicine> => request<Medicine>(`/medicines/${id}`),
  createMedicine: (data: Partial<Medicine>) => request('/medicines', { method: 'POST', body: JSON.stringify(data) }),
  updateMedicine: (id: number | string, data: Partial<Medicine>) => request(`/medicines/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleMedicineStatus: (id: number | string) => request(`/medicines/${id}/toggle-status`, { method: 'POST' }),
  deleteMedicine: (id: number | string) => request(`/medicines/${id}`, { method: 'DELETE' }),

  // Batches & Expiry
  getBatches: (medicineId: number | string = -1): Promise<Batch[]> => {
    const params = Number(medicineId) > 0 ? `?medicine_id=${medicineId}` : '';
    return request<Batch[]>(`/batches${params}`);
  },
  getExpiryWatchlist: (days = 90): Promise<Batch[]> => request<Batch[]>(`/batches/expiry?days=${days}`),
  createBatch: (data: Partial<Batch>) => request('/batches', { method: 'POST', body: JSON.stringify(data) }),
  updateBatch: (id: number | string, data: Partial<Batch>) => request(`/batches/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteBatch: (id: number | string) => request(`/batches/${id}`, { method: 'DELETE' }),

  // POS & Invoicing
  checkoutPOS: (invoiceData: Partial<Invoice>): Promise<Invoice> => request<Invoice>('/pos/checkout', { method: 'POST', body: JSON.stringify(invoiceData) }),
  getInvoices: (limit = 50, offset = 0, date = ''): Promise<Invoice[]> => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (date) params.append('date', date);
    return request<Invoice[]>(`/invoices?${params.toString()}`);
  },
  getInvoice: (id: number | string): Promise<Invoice> => request<Invoice>(`/invoices/${id}`),
  returnInvoice: (invoiceId: number | string, reason: string) => request('/pos/return', { method: 'POST', body: JSON.stringify({ invoice_id: invoiceId, reason }) }),

  // Parked Bills
  parkInvoice: (cartData: any) => request('/pos/park', { method: 'POST', body: JSON.stringify(cartData) }),
  getParkedInvoices: () => request<any[]>('/pos/parked'),
  deleteParkedInvoice: (id: number | string) => request(`/pos/parked/${id}`, { method: 'DELETE' }),

  // Customers & Khata
  getCustomers: (q = ''): Promise<Customer[]> => request<Customer[]>(`/customers${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  getCustomer: (id: number | string): Promise<Customer> => request<Customer>(`/customers/${id}`),
  createCustomer: (data: Partial<Customer>) => request('/customers', { method: 'POST', body: JSON.stringify(data) }),
  updateCustomer: (id: number | string, data: Partial<Customer>) => request(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getCustomerLedger: (id: number | string): Promise<CustomerLedgerEntry[]> => request<CustomerLedgerEntry[]>(`/customers/${id}/ledger`),
  recordCustomerPayment: (id: number | string, amount: number | string, paymentMode = 'CASH', notes = '') =>
    request(`/customers/${id}/payment`, {
      method: 'POST',
      body: JSON.stringify({ amount: Number(amount), payment_mode: paymentMode, notes }),
    }),

  // Suppliers & Khata
  getSuppliers: (q = ''): Promise<Supplier[]> => request<Supplier[]>(`/suppliers${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  getSupplier: (id: number | string): Promise<Supplier> => request<Supplier>(`/suppliers/${id}`),
  createSupplier: (data: Partial<Supplier>) => request('/suppliers', { method: 'POST', body: JSON.stringify(data) }),
  updateSupplier: (id: number | string, data: Partial<Supplier>) => request(`/suppliers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getSupplierLedger: (id: number | string) => request(`/suppliers/${id}/ledger`),
  recordSupplierPayment: (id: number | string, amount: number | string, paymentMode = 'CASH', notes = '') =>
    request(`/suppliers/${id}/payment`, {
      method: 'POST',
      body: JSON.stringify({ amount: Number(amount), payment_mode: paymentMode, notes }),
    }),

  // Purchases (GRN)
  createPurchase: (data: Partial<Purchase>) => request('/purchases', { method: 'POST', body: JSON.stringify(data) }),
  getPurchases: (limit = 50): Promise<Purchase[]> => request<Purchase[]>(`/purchases?limit=${limit}`),

  // Daybook & Cash Drawer
  getDaybook: (date = '') => request(`/daybook${date ? `?date=${date}` : ''}`),
  addDaybookEntry: (entryType: string, amount: number | string, direction: 'IN' | 'OUT', notes = '') =>
    request('/daybook', {
      method: 'POST',
      body: JSON.stringify({ entry_type: entryType, amount: Number(amount), direction, notes }),
    }),

  // Dashboard Reports
  getDashboardStats: () => request('/reports/dashboard'),

  // Settings
  getSettings: () => request('/settings'),
  updateSettings: (data: any) => request('/settings', { method: 'POST', body: JSON.stringify(data) }),
};
