import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';

export type ToastType = 'success' | 'danger' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}

export interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  success: (msg: string, dur?: number) => void;
  error: (msg: string, dur?: number) => void;
  warning: (msg: string, dur?: number) => void;
  info: (msg: string, dur?: number) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

const MAX_VISIBLE = 4;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Set<number>>(new Set());

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'success', duration?: number) => {
    const resolvedDuration =
      duration ?? (type === 'danger' || type === 'error' || type === 'warning' ? 4000 : 2400);
    const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    setToasts((prev) => {
      // Replace an identical message instead of stacking duplicates (e.g. repeated scans)
      const withoutDuplicate = prev.filter((toast) => toast.message !== message || toast.type !== type);
      return [...withoutDuplicate, { id, message, type, duration: resolvedDuration }].slice(-MAX_VISIBLE);
    });

    if (resolvedDuration > 0) {
      const timer = window.setTimeout(() => {
        removeToast(id);
        timers.current.delete(timer);
      }, resolvedDuration);
      timers.current.add(timer);
    }
  }, [removeToast]);

  useEffect(() => {
    const active = timers.current;
    return () => {
      active.forEach((timer) => window.clearTimeout(timer));
      active.clear();
    };
  }, []);

  const success = useCallback((msg: string, dur?: number) => showToast(msg, 'success', dur), [showToast]);
  const error = useCallback((msg: string, dur?: number) => showToast(msg, 'error', dur), [showToast]);
  const warning = useCallback((msg: string, dur?: number) => showToast(msg, 'warning', dur), [showToast]);
  const info = useCallback((msg: string, dur?: number) => showToast(msg, 'info', dur), [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, success, error, warning, info }}>
      {children}
      <div
        className="app-toast-stack no-print"
        aria-live="polite"
        aria-relevant="additions"
      >
        {toasts.map((toast) => {
          const isError = toast.type === 'danger' || toast.type === 'error';
          const iconClass =
            toast.type === 'success'
              ? 'bi-check-circle-fill'
              : isError
              ? 'bi-x-circle-fill'
              : toast.type === 'warning'
              ? 'bi-exclamation-triangle-fill'
              : 'bi-info-circle-fill';

          return (
            <div
              key={toast.id}
              className={`app-toast app-toast-${toast.type}`}
              role={isError ? 'alert' : 'status'}
            >
              <i className={`bi ${iconClass} app-toast-icon`}></i>
              <span className="app-toast-message">{toast.message}</span>
              <button
                type="button"
                className="app-toast-close"
                onClick={() => removeToast(toast.id)}
                aria-label="Dismiss notification"
              >
                <i className="bi bi-x"></i>
              </button>
              {toast.duration > 0 && (
                <span
                  className="app-toast-progress"
                  style={{ animationDuration: `${toast.duration}ms` }}
                ></span>
              )}
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
