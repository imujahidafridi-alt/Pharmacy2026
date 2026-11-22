import React, { useEffect, ReactNode } from 'react';
import { Button } from './Button';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
  bodyClassName?: string;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  maxWidth = '600px',
  bodyClassName = 'p-3',
}: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    document.body.classList.add('modal-open');

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.classList.remove('modal-open');
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="modal d-block show"
      tabIndex={-1}
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.55)', backdropFilter: 'blur(3px)', zIndex: 1055 }}
      onClick={onClose}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div
        className="modal-dialog modal-dialog-centered modal-dialog-scrollable"
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content shadow-lg border">
          <div className="modal-header py-2 px-3 border-bottom">
            <h5 className="modal-title fw-bold fs-6">{title}</h5>
            <button
              type="button"
              className="btn-close"
              onClick={onClose}
              aria-label="Close"
            ></button>
          </div>
          <div className={`modal-body ${bodyClassName}`}>{children}</div>
          {footer !== undefined ? (
            <div className="modal-footer py-2 px-3 bg-body-tertiary border-top">{footer}</div>
          ) : (
            <div className="modal-footer py-2 px-3 bg-body-tertiary border-top">
              <Button variant="secondary" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
