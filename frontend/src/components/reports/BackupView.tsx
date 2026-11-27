import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { useToast } from '../../context/ToastContext';

interface BackupRow {
  id: number;
  filename: string;
  label: string;
  kind: string;
  created_at: string;
  size_bytes: number;
  checksum: string;
  integrity: string;
  exists: boolean;
  notes?: string;
}

interface BackupStatus {
  directory: string;
  database_size: number;
  wal_size: number;
  backup_count: number;
  last_backup: { filename: string; label: string; created_at: string; integrity: string } | null;
  auto_enabled: boolean;
  interval_hours: number;
  retention_count: number;
}

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export function BackupView() {
  const toast = useToast();
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [backups, setBackups] = useState<BackupRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState('');
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [intervalHours, setIntervalHours] = useState(6);
  const [retentionCount, setRetentionCount] = useState(10);
  const [savingSettings, setSavingSettings] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<BackupRow | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [current, list] = await Promise.all([api.getBackupStatus(), api.listBackups(50)]);
      const s = current as BackupStatus;
      setStatus(s);
      setBackups((list?.backups as BackupRow[]) || []);
      setAutoEnabled(!!s.auto_enabled);
      setIntervalHours(s.interval_hours || 6);
      setRetentionCount(s.retention_count || 10);
    } catch (err: any) {
      toast.error('Could not load backup information: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  const handleCreate = async () => {
    setBusy(true);
    try {
      const result = await api.createBackup(label.trim() || 'Manual backup');
      toast.success(`Backup saved: ${(result as any).filename}`);
      setLabel('');
      await load();
    } catch (err: any) {
      toast.error(err.message || 'Backup failed');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await api.updateSettings({
        backup_auto_enabled: autoEnabled ? '1' : '0',
        backup_interval_hours: String(intervalHours),
        backup_retention_count: String(retentionCount),
      });
      toast.success('Backup settings saved.');
      await load();
    } catch (err: any) {
      toast.error(err.message || 'Could not save backup settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleDelete = async (backup: BackupRow) => {
    if (!window.confirm(`Delete the backup "${backup.filename}"? This cannot be undone.`)) return;
    try {
      await api.deleteBackup(backup.filename);
      toast.success('Backup deleted.');
      await load();
    } catch (err: any) {
      toast.error(err.message || 'Could not delete backup');
    }
  };

  const handleRestore = async () => {
    if (!restoreTarget) return;
    if (confirmation !== 'RESTORE') {
      toast.error('Please type RESTORE to confirm.');
      return;
    }
    setBusy(true);
    try {
      const result = await api.restoreBackup(restoreTarget.filename, confirmation);
      toast.success(`Database restored. Safety copy: ${(result as any).safety_backup}`);
      setRestoreTarget(null);
      setConfirmation('');
      await load();
    } catch (err: any) {
      toast.error(err.message || 'Restore failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="d-flex flex-column gap-3">
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div>
          <h2 className="fs-4 fw-bold mb-0">Backup &amp; Recovery</h2>
          <p className="small text-secondary mb-0">Protect your sales, stock and accounts. Copies are kept on this computer.</p>
        </div>
        <Button variant="secondary" size="sm" className="secondaryBtn" onClick={load} disabled={loading}>
          <i className="bi bi-arrow-clockwise me-1"></i> Refresh
        </Button>
      </div>

      <div className="alert alert-warning py-2 px-3 mb-0" style={{ fontSize: '12px' }}>
        <i className="bi bi-shield-exclamation me-1"></i>
        Backups are saved in <strong>backend/backups</strong> on this computer. Copy one to a USB drive or another disk regularly — a single computer failure can still lose everything.
      </div>

      {/* Status cards */}
      <div className="row g-2">
        <div className="col-6 col-lg-3">
          <div className="card h-100 shadow-sm border"><div className="card-body p-3">
            <div className="small text-secondary text-uppercase fw-bold" style={{ fontSize: '10px' }}>Database Size</div>
            <div className="fs-5 fw-bold">{formatBytes(status?.database_size || 0)}</div>
          </div></div>
        </div>
        <div className="col-6 col-lg-3">
          <div className="card h-100 shadow-sm border"><div className="card-body p-3">
            <div className="small text-secondary text-uppercase fw-bold" style={{ fontSize: '10px' }}>Pending WAL</div>
            <div className="fs-5 fw-bold">{formatBytes(status?.wal_size || 0)}</div>
          </div></div>
        </div>
        <div className="col-6 col-lg-3">
          <div className="card h-100 shadow-sm border"><div className="card-body p-3">
            <div className="small text-secondary text-uppercase fw-bold" style={{ fontSize: '10px' }}>Backups Saved</div>
            <div className="fs-5 fw-bold">{status?.backup_count || 0}</div>
          </div></div>
        </div>
        <div className="col-6 col-lg-3">
          <div className="card h-100 shadow-sm border"><div className="card-body p-3">
            <div className="small text-secondary text-uppercase fw-bold" style={{ fontSize: '10px' }}>Last Backup</div>
            <div className="small fw-bold">{status?.last_backup?.created_at || 'Never'}</div>
          </div></div>
        </div>
      </div>

      <div className="row g-3">
        {/* Create backup */}
        <div className="col-lg-7">
          <div className="card shadow-sm border h-100">
            <div className="card-header bg-body-tertiary py-2 px-3 border-bottom fw-bold small">Create a Backup Now</div>
            <div className="card-body d-flex flex-wrap align-items-end gap-2">
              <div className="flex-grow-1" style={{ minWidth: '220px' }}>
                <label className="form-label small fw-semibold mb-1">Label (optional)</label>
                <input type="text" className="form-control form-control-sm" value={label}
                  onChange={(e) => setLabel(e.target.value)} placeholder="e.g. End of day"
                  style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--input-border)', color: 'var(--input-text)' }} />
              </div>
              <Button variant="primary" size="sm" onClick={handleCreate} disabled={busy}>
                <i className="bi bi-cloud-download me-1"></i> {busy ? 'Saving…' : 'Create Backup'}
              </Button>
              <div className="w-100 small text-muted" style={{ fontSize: '11px' }}>
                The copy is checked for errors and given a checksum before it is listed.
              </div>
            </div>
          </div>
        </div>

        {/* Settings */}
        <div className="col-lg-5">
          <div className="card shadow-sm border h-100">
            <div className="card-header bg-body-tertiary py-2 px-3 border-bottom fw-bold small">Automatic Backups</div>
            <div className="card-body d-flex flex-column gap-2" style={{ fontSize: '12px' }}>
              <div className="form-check form-switch">
                <input className="form-check-input" type="checkbox" id="autoBackupSwitch" checked={autoEnabled}
                  onChange={(e) => setAutoEnabled(e.target.checked)} />
                <label className="form-check-label fw-semibold" htmlFor="autoBackupSwitch">Create backups automatically</label>
              </div>
              <div className="row g-2">
                <div className="col-6">
                  <label className="form-label small fw-semibold mb-1">Every</label>
                  <select className="form-select form-select-sm" value={intervalHours} onChange={(e) => setIntervalHours(Number(e.target.value))}
                    style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--input-border)', color: 'var(--input-text)' }}>
                    {[1, 3, 6, 12, 24].map((h) => <option key={h} value={h}>{h} hours</option>)}
                  </select>
                </div>
                <div className="col-6">
                  <label className="form-label small fw-semibold mb-1">Keep last</label>
                  <select className="form-select form-select-sm" value={retentionCount} onChange={(e) => setRetentionCount(Number(e.target.value))}
                    style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--input-border)', color: 'var(--input-text)' }}>
                    {[3, 5, 10, 20, 50].map((n) => <option key={n} value={n}>{n} backups</option>)}
                  </select>
                </div>
              </div>
              <div>
                <Button variant="secondary" size="sm" className="secondaryBtn" onClick={handleSaveSettings} disabled={savingSettings}>
                  {savingSettings ? 'Saving…' : 'Save Backup Settings'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Backup list */}
      <div className="card shadow-sm border overflow-hidden">
        <div className="card-header bg-body-tertiary py-2 px-3 border-bottom fw-bold small">Saved Backups</div>
        <div className="table-responsive">
          <table className="table table-sm table-hover align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th>File</th>
                <th>Label</th>
                <th>Created</th>
                <th className="text-end">Size</th>
                <th>Check</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-4 text-secondary">Loading backups…</td></tr>
              ) : backups.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-4 text-secondary">No backups yet. Create one above.</td></tr>
              ) : (
                backups.map((backup) => (
                  <tr key={backup.id}>
                    <td className="font-monospace small fw-semibold">{backup.filename}</td>
                    <td className="small">{backup.label || '—'}</td>
                    <td className="small text-secondary">{backup.created_at}</td>
                    <td className="text-end small">{formatBytes(backup.size_bytes)}</td>
                    <td>
                      <Badge variant={backup.integrity === 'ok' && backup.exists ? 'healthy' : 'expired'}>
                        {backup.exists ? backup.integrity : 'missing'}
                      </Badge>
                    </td>
                    <td className="text-end">
                      <div className="d-inline-flex gap-1">
                        <a className="btn btn-sm secondaryBtn px-2" href={api.backupDownloadUrl(backup.filename)} title="Download this backup">
                          <i className="bi bi-download"></i>
                        </a>
                        <button type="button" className="btn btn-sm secondaryBtn px-2" disabled={!backup.exists}
                          onClick={() => { setRestoreTarget(backup); setConfirmation(''); }} title="Restore this backup">
                          <i className="bi bi-arrow-counterclockwise"></i>
                        </button>
                        <button type="button" className="btn btn-sm secondaryBtn px-2" onClick={() => handleDelete(backup)} title="Delete this backup">
                          <i className="bi bi-trash3"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Restore confirmation */}
      <Modal
        isOpen={!!restoreTarget}
        onClose={() => { setRestoreTarget(null); setConfirmation(''); }}
        title="Restore Database"
        maxWidth="520px"
        footer={
          <div className="d-flex justify-content-end gap-2 w-100">
            <Button variant="secondary" onClick={() => { setRestoreTarget(null); setConfirmation(''); }}>Cancel</Button>
            <Button variant="primary" onClick={handleRestore} disabled={busy || confirmation !== 'RESTORE'}>
              {busy ? 'Restoring…' : 'Restore Now'}
            </Button>
          </div>
        }
      >
        <div className="alert alert-danger py-2 px-3" style={{ fontSize: '12px' }}>
          <strong>This replaces all current data.</strong> A safety copy of the current database is created automatically before restoring.
        </div>
        <div className="small mb-2">Backup to restore: <strong className="font-monospace">{restoreTarget?.filename}</strong></div>
        <label className="form-label small fw-semibold mb-1">Type <strong>RESTORE</strong> to confirm</label>
        <input type="text" className="form-control form-control-sm" value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)} placeholder="RESTORE"
          style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--input-border)', color: 'var(--input-text)' }} />
      </Modal>
    </div>
  );
}

export default BackupView;
