import React, {
  createContext, useContext, useState,
  useCallback, useRef, useEffect,
} from 'react';
import StorageService from '../storage/storage.service';
import { STORAGE_KEYS } from '../sync/sync.constants';

const SyncContext = createContext(null);

export function useSyncContext() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSyncContext must be used inside SyncProvider');
  return ctx;
}

export const SYNC_PHASES = {
  IDLE:        { key: 'IDLE',        label: null },
  PENDING:     { key: 'PENDING',     label: 'Subiendo cambios...' },
  MASTER:      { key: 'MASTER',      label: 'Actualizando datos base...' },
  CLIENTS:     { key: 'CLIENTS',     label: 'Sincronizando clientes...' },
  TASKS:       { key: 'TASKS',       label: 'Sincronizando tareas...' },
  LEADS:       { key: 'LEADS',       label: 'Sincronizando oportunidades...' },
  COMMENTS:    { key: 'COMMENTS',    label: 'Cargando comentarios...' },
  SURVEYS:     { key: 'SURVEYS',     label: 'Procesando encuestas...' },
  ATTACHMENTS: { key: 'ATTACHMENTS', label: 'Sincronizando adjuntos...' },
  DONE:        { key: 'DONE',        label: 'Sincronización completa' },
  ERROR:       { key: 'ERROR',       label: 'Error en sincronización' },
};

export function SyncProvider({ children }) {
  const [phase, setPhase]               = useState(SYNC_PHASES.IDLE);
  const [isSyncing, setIsSyncing]       = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSync, setLastSync]         = useState(null);
  const [syncResult, setSyncResult]     = useState(null);
  const [toasts, setToasts]             = useState([]);
  const toastIdRef = useRef(0);

  // ── Leer estado desde storage ──────────────────────────────────────────────

  const refreshPendingCount = useCallback(async () => {
    try {
      const pending = await StorageService.getItem(STORAGE_KEYS.PENDING_CHANGES) || [];
      setPendingCount(pending.length);
    } catch (_) {
      setPendingCount(0);
    }
  }, []);

  const loadLastSync = useCallback(async () => {
    try {
      const stored = await StorageService.getItem(STORAGE_KEYS.LAST_SYNC);
      if (stored) setLastSync(new Date(stored));
    } catch (_) {}
  }, []);

  // Refresco combinado — útil para llamar desde el sidebar al abrirse
  const refreshSyncState = useCallback(async () => {
    await Promise.all([refreshPendingCount(), loadLastSync()]);
  }, [refreshPendingCount, loadLastSync]);

  // Carga inicial
  useEffect(() => {
    refreshSyncState();
  }, []);

  // ── Toasts ─────────────────────────────────────────────────────────────────

  const showToast = useCallback((message, type = 'info', duration = 3500) => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
    return id;
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // ── Control del ciclo de sync ──────────────────────────────────────────────

  const updatePhase = useCallback((phaseKey) => {
    setPhase(SYNC_PHASES[phaseKey] || SYNC_PHASES.IDLE);
  }, []);

  const startSync = useCallback(() => {
    setIsSyncing(true);
    setSyncResult(null);
  }, []);

  const finishSync = useCallback(async (result) => {
    setSyncResult(result);
    setIsSyncing(false);
    setPhase(SYNC_PHASES.IDLE);
    await refreshSyncState();
  }, [refreshSyncState]);

  const statusLabel = isSyncing ? (phase.label || 'Sincronizando...') : null;

  return (
    <SyncContext.Provider value={{
      phase,
      isSyncing,
      pendingCount,
      lastSync,
      syncResult,
      toasts,
      statusLabel,
      updatePhase,
      startSync,
      finishSync,
      showToast,
      dismissToast,
      refreshPendingCount,
      loadLastSync,
      refreshSyncState,   // ← nuevo: refresca pendientes + lastSync a la vez
    }}>
      {children}
    </SyncContext.Provider>
  );
}