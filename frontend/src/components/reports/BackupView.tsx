import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import { Modal } from '../ui/Modal';
import { useToast } from '../../context/ToastContext';
import { folderCanWrite, getFolderHandle, pickFolder, writeCopyToFolder } from '../../utils/backupFolder';

interface CopyRow {
  id: number;
  filename: string;
  label: string;
  kind: string;
  created_at: string;
  integrity: string;
  exists: boolean;
}

const when = (value: string) => {
  const date = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};

const kindLabel = (kind: string) => {
  if (kind === 'auto') return 'Automatic';
  if (kind === 'manual') return 'By you';
  if (kind === 'pre-restore') return 'Safety copy';
  return 'Restored';
};

const SYNCED_KEY = 'pharmacy_synced_copies';
const getSynced = (): string[] => {
  try { return JSON.parse(localStorage.getItem(SYNCED_KEY) || '[]'); } catch { return []; }
};
const setSynced = (files: string[]) => localStorage.setItem(SYNCED_KEY, JSON.stringify(files));

export function BackupView() {
  const toast = useToast();
  const [copies, setCopies] = useState<CopyRow[]>([]);
  const [folderHandle, setFolderHandle] = useState<any | null>(null);
  const [folderName, setFolderName] = useState('');
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [intervalHours, setIntervalHours] = useState(6);
  const [retention, setRetention] = useState(10);
  const [busy, setBusy] = useState(false);
  const [useCopy, setUseCopy] = useState<CopyRow | null>(null);
  const [understood, setUnderstood] = useState(false);

  const syncToFolder = useCallback(async (handle: any, rows: CopyRow[]) => {
    if (!handle) return;
    const synced = getSynced();
    let changed = false;
    for (const copy of rows) {
      if (!copy.exists || synced.includes(copy.filename)) continue;
      try {
        const response = await fetch(api.backupDownloadUrl(copy.filename));
        const bytes = await response.arrayBuffer();
        await writeCopyToFolder(handle, copy.filename, bytes);
        synced.push(copy.filename);
        changed = true;
      } catch {
        break;
      }
    }
    if (changed) setSynced(synced);
  }, []);

  const load = useCallback(async () => {
    try {
      const [list, status] = await Promise.all([api.listBackups(50), api.getBackupStatus()]);
      const rows = ((list as any)?.backups || []) as CopyRow[];
      setCopies(rows);
      const s = status as any;
      setAutoEnabled(!!s.auto_enabled);
      setIntervalHours(s.interval_hours || 6);
      setRetention(s.retention_count || 10);

      const handle = await getFolderHandle();
      if (await folderCanWrite(handle)) {
        setFolderHandle(handle);
        setFolderName(handle.name || 'Chosen folder');
        void syncToFolder(handle, rows);
      } else {
        setFolderHandle(null);
        setFolderName('');
      }
    } catch (err: any) {
      toast.error('Could not load your copies: ' + err.message);
    }
  }, [syncToFolder, toast]);

  useEffect(() => { load(); }, [load]);

  const saveSettings = async (nextAuto: boolean, nextInterval: number, nextRetention: number) => {
    setAutoEnabled(nextAuto);
    setIntervalHours(nextInterval);
    setRetention(nextRetention);
    try {
      await api.updateSettings({
        backup_auto_enabled: nextAuto ? '1' : '0',
        backup_interval_hours: String(nextInterval),
        backup_retention_count: String(nextRetention),
      });
    } catch (err: any) {
      toast.error('Could not save: ' + err.message);
    }
  };

  const handleSaveCopy = async () => {
    setBusy(true);
    try {
      const result = await api.createBackup('By you') as any;
      if (folderHandle) {
        try {
          const response = await fetch(api.backupDownloadUrl(result.filename));
          await writeCopyToFolder(folderHandle, result.filename, await response.arrayBuffer());
          setSynced([...getSynced(), result.filename]);
        } catch {
          toast.info('Copy saved in the app, but not in your chosen folder.');
        }
      }
      toast.success('Copy saved.');
      await load();
    } catch (err: any) {
      toast.error(err.message || 'Could not save a copy');
    } finally {
      setBusy(false);
    }
  };

  const handleChangeFolder = async () => {
    const handle = await pickFolder();
    if (!handle) {
      toast.info('No folder was chosen.');
      return;
    }
    setFolderHandle(handle);
    setFolderName(handle.name || 'Chosen folder');
    toast.success('Copies will also go to ' + (handle.name || 'your folder') + '.');
    void syncToFolder(handle, copies);
  };

  const handleDelete = async (copy: CopyRow) => {
    if (!window.confirm(`Delete the copy from ${when(copy.created_at)}?`)) return;
    try {
      await api.deleteBackup(copy.filename);
      setSynced(getSynced().filter((name) => name !== copy.filename));
      if (folderHandle && typeof folderHandle.removeEntry === 'function') {
        try { await folderHandle.removeEntry(copy.filename); } catch { /* already gone */ }
      }
      toast.success('Copy deleted.');
      await load();
    } catch (err: any) {
      toast.error(err.message || 'Could not delete the copy');
    }
  };

  const handleUseCopy = async () => {
    if (!useCopy || !understood) return;
    setBusy(true);
    try {
      await api.restoreBackup(useCopy.filename, 'RESTORE');
      toast.success('Your data was restored.');
      setUseCopy(null);
      setUnderstood(false);
      await load();
    } catch (err: any) {
      toast.error(err.message || 'Could not use this copy');
    } finally {
      setBusy(false);
    }
  };

  const cardClass = 'card shadow-sm border h-100';

  return (
    <div className="d-flex flex-column gap-3">
      <div>
        <h2 className="fs-4 fw-bold mb-0">Keep Your Data Safe</h2>
        <p className="small text-secondary mb-0">Your sales, stock and accounts stay safe.</p>
      </div>

      <div className="row g-3">
        <div className="col-md-6">
          <div className={cardClass}>
            <div className="card-body p-3 d-flex flex-column gap-3">
              <div className="fw-bold fs-6">Save a copy now</div>
              <button type="button" className="btn btn-lg text-white fw-bold w-100" onClick={handleSaveCopy} disabled={busy}
                style={{ backgroundColor: '#0F766E', borderColor: '#0F766E' }}>
                <i className="bi bi-cloud-download me-2"></i>{busy ? 'Saving…' : 'Save Copy'}
              </button>
              <div className="small text-success fw-semibold">✓ Checked and ready</div>
            </div>
          </div>
        </div>

        <div className="col-md-6">
          <div className={cardClass}>
            <div className="card-body p-3 d-flex flex-column gap-3">
              <div className="fw-bold fs-6">Where copies are kept</div>
              <div className="d-flex align-items-center gap-2">
                <i className="bi bi-folder2-open fs-4 text-warning"></i>
                <span className="fw-semibold">{folderName || 'This computer only'}</span>
              </div>
              <button type="button" className="btn btn-outline-secondary btn-sm px-3" onClick={handleChangeFolder}>
                <i className="bi bi-folder-plus me-1"></i> Change folder
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className={cardClass}>
        <div className="card-body p-3 d-flex flex-wrap align-items-center gap-3">
          <div className="fw-bold fs-6 me-auto">Automatic copies</div>
          <label className="form-check form-switch mb-0 d-flex align-items-center gap-2">
            <input className="form-check-input" type="checkbox" checked={autoEnabled}
              onChange={(e) => saveSettings(e.target.checked, intervalHours, retention)} />
            <span className="small fw-semibold">Save a copy automatically</span>
          </label>
          <div className="d-flex align-items-center gap-2">
            <span className="small text-secondary">Every</span>
            <select className="form-select form-select-sm" value={intervalHours} disabled={!autoEnabled}
              onChange={(e) => saveSettings(autoEnabled, Number(e.target.value), retention)}
              style={{ width: '110px', backgroundColor: 'var(--input-bg)', borderColor: 'var(--input-border)', color: 'var(--input-text)' }}>
              {[1, 3, 6, 12, 24].map((h) => <option key={h} value={h}>{h} hours</option>)}
            </select>
          </div>
          <div className="d-flex align-items-center gap-2">
            <span className="small text-secondary">Keep the last</span>
            <select className="form-select form-select-sm" value={retention}
              onChange={(e) => saveSettings(autoEnabled, intervalHours, Number(e.target.value))}
              style={{ width: '90px', backgroundColor: 'var(--input-bg)', borderColor: 'var(--input-border)', color: 'var(--input-text)' }}>
              {[3, 5, 10, 20, 50].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className={cardClass}>
        <div className="card-header bg-body-tertiary py-2 px-3 border-bottom fw-bold">Your copies</div>
        <div className="list-group list-group-flush">
          {copies.length === 0 ? (
            <div className="p-4 text-center text-secondary">No copies yet. Press <strong>Save Copy</strong> above.</div>
          ) : (
            copies.map((copy) => (
              <div className="list-group-item d-flex align-items-center gap-3 py-2 px-3" key={copy.id}>
                <i className="bi bi-file-earmark-check fs-5 text-success"></i>
                <div className="flex-grow-1">
                  <div className="fw-semibold small">{when(copy.created_at)}</div>
                  <div className="small text-secondary" style={{ fontSize: '11px' }}>
                    {kindLabel(copy.kind)} {copy.integrity === 'ok' && copy.exists ? '· ✓ Checked' : ''}
                  </div>
                </div>
                <a className="btn btn-sm btn-outline-secondary px-2" href={api.backupDownloadUrl(copy.filename)} title="Open or download this copy">
                  Open
                </a>
                <button type="button" className="btn btn-sm btn-outline-primary px-2" disabled={!copy.exists}
                  onClick={() => { setUseCopy(copy); setUnderstood(false); }}>
                  Use
                </button>
                <button type="button" className="btn btn-sm btn-outline-danger px-2" onClick={() => handleDelete(copy)}>
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <Modal
        isOpen={!!useCopy}
        onClose={() => { setUseCopy(null); setUnderstood(false); }}
        title="Use this copy"
        maxWidth="480px"
        footer={
          <div className="d-flex justify-content-end gap-2 w-100">
            <button type="button" className="btn btn-sm secondaryBtn px-3" onClick={() => { setUseCopy(null); setUnderstood(false); }}>Cancel</button>
            <button type="button" className="btn btn-sm btn-danger px-3 fw-bold" disabled={!understood || busy} onClick={handleUseCopy}>
              {busy ? 'Working…' : 'Use this copy'}
            </button>
          </div>
        }
      >
        <p className="mb-2" style={{ fontSize: '13px' }}>
          This replaces your current data with the copy from <strong>{useCopy ? when(useCopy.created_at) : ''}</strong>.
        </p>
        <p className="small text-secondary">A copy of your current data is saved first.</p>
        <label className="form-check d-flex align-items-center gap-2 mt-3">
          <input className="form-check-input" type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
          <span className="form-check-label small fw-semibold">I understand</span>
        </label>
      </Modal>
    </div>
  );
}

export default BackupView;
