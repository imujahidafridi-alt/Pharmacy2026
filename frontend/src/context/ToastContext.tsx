import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type ToastType = 'success' | 'danger' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

export interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  success: (msg: string, dur?: number) => void;
  error: (msg: string, dur?: number) => void;
  warning: (msg: string, dur?: number) => void;
  info: (msg: string, dur?: number) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'success', duration = 3500) => {
    const id = Date.now() + Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const success = useCallback((msg: string, dur?: number) => showToast(msg, 'success', dur), [showToast]);
  const error = useCallback((msg: string, dur?: number) => showToast(msg, 'danger', dur), [showToast]);
  const warning = useCallback((msg: string, dur?: number) => showToast(msg, 'warning', dur), [showToast]);
  const info = useCallback((msg: string, dur?: number) => showToast(msg, 'info', dur), [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, success, error, warning, info }}>
      {children}
      <div className="toast-container position-fixed top-0 end-0 p-3 no-print" style={{ zIndex: 1100, marginTop: '48px' }}>
        {toasts.map((t) => {
          const bgClass =
            t.type === 'success'
              ? 'text-bg-success'
              : t.type === 'danger' || t.type === 'error'
              ? 'text-bg-danger'
              : t.type === 'warning'
              ? 'text-bg-warning'
              : 'text-bg-primary';

          const iconClass =
            t.type === 'success'
              ? 'bi-check-circle-fill'
              : t.type === 'danger' || t.type === 'error'
              ? 'bi-x-circle-fill'
              : t.type === 'warning'
              ? 'bi-exclamation-triangle-fill'
              : 'bi-info-circle-fill';

          return (
            <div
              key={t.id}
              className={`toast show align-items-center ${bgClass} border-0 shadow mb-2`}
              role="alert"
              aria-live="assertive"
              aria-atomic="true"
            >
              <div className="d-flex">
                <div className="toast-body d-flex align-items-center gap-2 py-2 px-3 fw-semibold">
                  <i className={`bi ${iconClass} fs-6`}></i>
                  <span>{t.message}</span>
                </div>
                <button
                  type="button"
                  className="btn-close btn-close-white me-2 m-auto"
                  onClick={() => removeToast(t.id)}
                  aria-label="Close"
                ></button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextType {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
