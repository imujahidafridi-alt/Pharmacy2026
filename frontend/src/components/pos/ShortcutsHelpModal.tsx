import React from 'react';
import { Modal } from '../ui/Modal';

interface Shortcut {
  keys: string[];
  action: string;
}

const GROUPS: { title: string; icon: string; items: Shortcut[] }[] = [
  {
    title: 'Scanning & cart',
    icon: 'bi-upc-scan',
    items: [
      { keys: ['F1'], action: 'Focus the barcode / item search box' },
      { keys: ['5*Item'], action: 'Add 5 units of an item (quantity prefix)' },
      { keys: ['-Item'], action: 'Add a WAPSI / return line' },
      { keys: ['Enter'], action: 'Add the highlighted search result' },
      { keys: ['F2'], action: 'Edit quantity of the selected cart row' },
      { keys: ['↑', '↓'], action: 'Move between cart rows' },
      { keys: ['+', '-'], action: 'Increase / decrease selected quantity' },
      { keys: ['Del'], action: 'Remove the selected cart row' },
    ],
  },
  {
    title: 'Pricing & customers',
    icon: 'bi-cash-coin',
    items: [
      { keys: ['F4'], action: 'Bill discount' },
      { keys: ['F5'], action: 'Attach a customer / khata account' },
      { keys: ['Alt+M'], action: 'Mutabadil — generic alternatives' },
      { keys: ['Alt+R'], action: 'Round the bill to the nearest Rs. 5' },
    ],
  },
  {
    title: 'Billing & receipts',
    icon: 'bi-printer',
    items: [
      { keys: ['F7'], action: 'Hold / park the current bill' },
      { keys: ['F8'], action: 'Open parked bills' },
      { keys: ['F9'], action: 'Complete sale and print receipt' },
      { keys: ['Ctrl+P'], action: 'Reprint the last invoice' },
      { keys: ['F12'], action: 'Sell anyway in the below-cost alert' },
      { keys: ['Esc'], action: 'Close the active dialog' },
      { keys: ['?'], action: 'Show this shortcut guide' },
    ],
  },
];

export function ShortcutsHelpModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <span className="d-flex align-items-center gap-2">
          <i className="bi bi-keyboard"></i>
          <span>Keyboard Shortcuts</span>
          <span className="badge bg-primary-subtle text-primary fw-semibold" style={{ fontSize: '10px' }}>
            Press ? anytime
          </span>
        </span>
      }
      maxWidth="720px"
      footer={
        <button type="button" className="btn btn-primary px-4" onClick={onClose}>
          Got it
        </button>
      }
    >
      <div className="row g-3">
        {GROUPS.map((group) => (
          <div className="col-md-6" key={group.title}>
            <div className="border rounded h-100 p-3" style={{ backgroundColor: 'var(--surface-subtle)' }}>
              <div className="fw-bold text-uppercase mb-2" style={{ fontSize: '11px', letterSpacing: '0.08em', color: 'var(--brand-teal)' }}>
                <i className={`bi ${group.icon} me-1`}></i>
                {group.title}
              </div>
              <div className="d-flex flex-column gap-2">
                {group.items.map((item) => (
                  <div className="d-flex align-items-center justify-content-between gap-2" key={item.action} style={{ fontSize: '12px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{item.action}</span>
                    <span className="flex-shrink-0 d-flex gap-1">
                      {item.keys.map((key) => (
                        <kbd key={key}>{key}</kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
