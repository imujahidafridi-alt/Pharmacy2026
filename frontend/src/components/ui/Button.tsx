import React, { ButtonHTMLAttributes, ReactNode } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'info' | 'light' | 'dark' | 'link' | 'ghost' | 'outline' | string;
  size?: 'sm' | 'md' | 'lg';
  shortcut?: string;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  shortcut,
  loading = false,
  disabled = false,
  className = '',
  onClick,
  type = 'button',
  ...props
}: ButtonProps) {
  // Normalize variants for Bootstrap
  const bsVariant =
    variant === 'ghost'
      ? 'btn-outline-secondary border-0'
      : variant === 'outline'
      ? 'btn-outline-primary'
      : `btn-${variant}`;

  const sizeClass = size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : '';

  const classes = ['btn', bsVariant, sizeClass, className].filter(Boolean).join(' ');

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      onClick={onClick}
      {...props}
    >
      {loading && (
        <span
          className="spinner-border spinner-border-sm me-1"
          role="status"
          aria-hidden="true"
        ></span>
      )}
      {children}
      {shortcut && <span className="kbd ms-1">{shortcut}</span>}
    </button>
  );
}
