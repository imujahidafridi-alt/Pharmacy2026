import React, { useState, useEffect, FormEvent } from 'react';
import { api } from '../../services/api';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useApp } from '../../context/AppContext';
import { useToast } from '../../context/ToastContext';

export function SettingsView() {
  const { settings, setSettings, refreshSettings } = useApp();
  const toast = useToast();

  const [form, setForm] = useState({
    pharmacy_name: '',
    phone: '',
    address: '',
    license_number: '',
    tax_number: '',
    currency_symbol: 'Rs.',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm({
        pharmacy_name: settings.pharmacy_name || '',
        phone: settings.phone || '',
        address: settings.address || '',
        license_number: settings.license_number || '',
        tax_number: settings.tax_number || '',
        currency_symbol: settings.currency_symbol === '₨' ? 'Rs.' : (settings.currency_symbol || 'Rs.'),
      });
    }
  }, [settings]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateSettings(form);
      setSettings((prev) => ({ ...prev, ...form }));
      toast.success('Pharmacy settings saved successfully!');
      refreshSettings();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto' }} className="d-flex flex-column gap-3">
      <div>
        <h2 className="fs-4 fw-bold mb-0">Pharmacy Configuration & Settings</h2>
        <p className="small text-secondary mb-0">
          Configure clinic/store profile, thermal receipt print header, tax registrations, and currency formatting.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card shadow-sm border p-4 d-flex flex-column gap-3">
        <Input
          label="Pharmacy / Clinic Name *"
          value={form.pharmacy_name}
          onChange={(e) => setForm({ ...form, pharmacy_name: e.target.value })}
          required
        />

        <div className="row g-2">
          <div className="col-8">
            <Input
              label="Contact Phone *"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              required
            />
          </div>
          <div className="col-4">
            <Input
              label="Currency Symbol *"
              value={form.currency_symbol}
              onChange={(e) => setForm({ ...form, currency_symbol: e.target.value })}
              helperText="e.g. Rs., $, ₹, €"
              required
            />
          </div>
        </div>

        <Input
          label="Physical Address (Printed on receipts)"
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
          required
        />

        <div className="row g-2">
          <div className="col-6">
            <Input
              label="Drug License Number"
              value={form.license_number}
              onChange={(e) => setForm({ ...form, license_number: e.target.value })}
            />
          </div>
          <div className="col-6">
            <Input
              label="Tax Registration / NTN / GST"
              value={form.tax_number}
              onChange={(e) => setForm({ ...form, tax_number: e.target.value })}
            />
          </div>
        </div>

        <div className="d-flex justify-content-end mt-2">
          <Button
            type="submit"
            variant="primary"
            loading={saving}
            className="d-inline-flex align-items-center"
          >
            <i className="bi bi-check2-circle me-1"></i> Save Settings
          </Button>
        </div>
      </form>
    </div>
  );
}
