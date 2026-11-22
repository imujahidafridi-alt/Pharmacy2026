import React, { forwardRef, InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: ReactNode;
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    error,
    helperText,
    icon,
    className = '',
    containerClassName = '',
    type = 'text',
    ...props
  },
  ref
) {
  return (
    <div className={`mb-2 ${containerClassName}`}>
      {label && <label className="form-label small fw-semibold mb-1">{label}</label>}
      {icon ? (
        <div className="input-group">
          <span className="input-group-text bg-body-tertiary">{icon}</span>
          <input
            ref={ref}
            type={type}
            className={`form-control ${error ? 'is-invalid' : ''} ${className}`}
            {...props}
          />
          {error && <div className="invalid-feedback">{error}</div>}
        </div>
      ) : (
        <>
          <input
            ref={ref}
            type={type}
            className={`form-control ${error ? 'is-invalid' : ''} ${className}`}
            {...props}
          />
          {error && <div className="invalid-feedback d-block">{error}</div>}
        </>
      )}
      {helperText && !error && <div className="form-text small">{helperText}</div>}
    </div>
  );
});

export interface SelectOption {
  value: string | number;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options?: SelectOption[];
  error?: string;
  helperText?: string;
  containerClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    label,
    options = [],
    error,
    helperText,
    className = '',
    containerClassName = '',
    children,
    ...props
  },
  ref
) {
  return (
    <div className={`mb-2 ${containerClassName}`}>
      {label && <label className="form-label small fw-semibold mb-1">{label}</label>}
      <select
        ref={ref}
        className={`form-select ${error ? 'is-invalid' : ''} ${className}`}
        {...props}
      >
        {children
          ? children
          : options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
      </select>
      {error && <div className="invalid-feedback d-block">{error}</div>}
      {helperText && !error && <div className="form-text small">{helperText}</div>}
    </div>
  );
});
