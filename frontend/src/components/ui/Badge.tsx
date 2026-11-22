import React, { ReactNode } from 'react';

export interface BadgeProps {
  variant?: 'expired' | 'critical' | 'warning' | 'healthy' | 'paid' | 'low-stock' | 'credit' | 'rx' | string;
  children: ReactNode;
  className?: string;
}

export function Badge({ variant = 'healthy', children, className = '' }: BadgeProps) {
  let bsClass = 'badge text-bg-secondary';

  switch (variant) {
    case 'expired':
      bsClass = 'badge text-bg-danger';
      break;
    case 'critical':
      bsClass = 'badge bg-danger-subtle text-danger border border-danger-subtle';
      break;
    case 'warning':
      bsClass = 'badge text-bg-warning text-dark';
      break;
    case 'healthy':
    case 'paid':
      bsClass = 'badge text-bg-success';
      break;
    case 'low-stock':
      bsClass = 'badge bg-warning-subtle text-warning-emphasis border border-warning-subtle';
      break;
    case 'credit':
      bsClass = 'badge bg-primary-subtle text-primary border border-primary-subtle';
      break;
    case 'rx':
      bsClass = 'badge bg-danger text-white fw-bold';
      break;
    default:
      bsClass = `badge text-bg-${variant}`;
      break;
  }

  return (
    <span className={`${bsClass} px-2 py-1 text-uppercase ${className}`} style={{ fontSize: '0.72rem', letterSpacing: '0.03em' }}>
      {children}
    </span>
  );
}
