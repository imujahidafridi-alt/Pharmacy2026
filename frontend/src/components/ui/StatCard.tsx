import React, { ReactNode } from 'react';

export interface StatCardProps {
  title: string;
  value: ReactNode;
  subtext?: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  onClick?: () => void;
}

export function StatCard({ title, value, subtext, icon, badge, onClick }: StatCardProps) {
  return (
    <div
      className={`card shadow-sm border h-100 ${onClick ? 'stat-card-clickable' : ''}`}
      onClick={onClick}
    >
      <div className="card-body p-3 d-flex flex-column justify-content-between">
        <div className="d-flex align-items-center justify-content-between mb-2">
          <span className="text-uppercase text-body-secondary small fw-bold" style={{ fontSize: '0.75rem', letterSpacing: '0.04em' }}>
            {title}
          </span>
          {icon && <span className="fs-5">{icon}</span>}
        </div>
        <div className="fs-3 fw-bold text-body-emphasis mb-1" style={{ letterSpacing: '-0.02em' }}>
          {value}
        </div>
        {(subtext || badge) && (
          <div className="d-flex align-items-center justify-content-between mt-1">
            {subtext && <span className="text-secondary small">{subtext}</span>}
            {badge}
          </div>
        )}
      </div>
    </div>
  );
}
