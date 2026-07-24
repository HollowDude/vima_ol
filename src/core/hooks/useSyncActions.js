import { useCallback, useRef } from 'react';
import { useSyncContext } from '../context/SyncContext';
import SyncService from '../sync/sync.service';
import SyncHistory from '../sync/sync.history';
import useNetwork from './useNetwork';
import StorageService from '../storage/storage.service';
import { STORAGE_KEYS } from '../sync/sync.constants';
import { handleOdooError } from '../utils/odoo.error.handler';

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2000;

function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

export default function useSyncActions(onUnauthorized = () => {}) {
  const { isOnline } = useNetwork();
  const {
    startSync, finishSync, updatePhase,
    showToast, refreshPendingCount,
  } = useSyncContext();

  const isSyncingRef = useRef(false);

  const withRetry = useCallback(async (fn, label) => {
    let lastError;
    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        console.error(`⚠️ ${label} - Intento ${attempt}/${MAX_RETRIES + 1} falló:`, err.message);
        if (attempt <= MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS * attempt);
        }
      }
    }
    throw lastError;
  }, []);

  const syncAll = useCallback(async (opts = {}) => {
    if (!isOnline) {
      showToast('Sin conexión. Los cambios se guardarán para luego.', 'warning');
      await SyncHistory.addSyncHistoryEntry({
        type: 'syncAll',
        direction: 'both',
        status: 'cancelled',
        timestamp: new Date().toISOString(),
        duration: 0,
        error: 'Intento cancelado — sin conexión',
        pull: { totalModels: 0, totalRecords: 0, models: {}, status: 'cancelled', errors: [] },
        push: { totalModels: 0, totalRecords: 0, models: {}, status: 'cancelled', errors: [] },
        phaseSequence: [],
      });
      return null;
    }
    if (isSyncingRef.current) return null;

    isSyncingRef.current = true;
    startSync();

    const overallStartedAt = Date.now();
    const syncEntry = SyncHistory.createSyncAllEntry(overallStartedAt);

    const results = {
      pending:     { success: false, uploaded: 0,  failed: 0  },
      master:      { success: false },
      clients:     { success: false, count: 0 },
      tasks:       { success: false, count: 0 },
      leads:       { success: false, count: 0 },
      comments:    { success: false },
      surveys:     { success: false },
      attachments: { success: false },
    };

    try {
      // ── 1. Maestros ────────────────────────────────────────────────────────
      updatePhase('MASTER');
      const masterStartedAt = Date.now();
      try {
        const masterData = await withRetry(() => SyncService.syncMasterData(), 'Datos base');
        results.master.success = true;
        SyncHistory.recordPullPhase(syncEntry, 'MASTER', {
          'res.country': { count: 1, duration: Date.now() - masterStartedAt },
          'res.country.state': { count: 1, duration: Date.now() - masterStartedAt },
          'res.municipality': { count: 1, duration: Date.now() - masterStartedAt },
        });
      } catch (e) {
        results.master.error = e.message;
        syncEntry.pull.errors.push({ phase: 'MASTER', error: e.message });

        const errorResult = handleOdooError(e, {
          onLogout: onUnauthorized,
          onShowToast: showToast,
        }, { action: 'sincronizar datos base' });

        if (!errorResult.shouldLogout) {
          showToast('No se pudieron actualizar los datos base', 'warning', 4000);
        }
      }

      // ── 2. Subir pendientes ────────────────────────────────────────────────
      updatePhase('PENDING');
      const pendingStartedAt = Date.now();
      try {
        const pendingResult = await withRetry(
          () => SyncService.syncPendingChanges(true), 'Cambios pendientes'
        );

        const pushModels = {};
        let totalPushOps = 0;
        if (pendingResult) {
          Object.entries(pendingResult).forEach(([model, stats]) => {
            if (typeof stats === 'object' && stats !== null) {
              pushModels[model] = {
                created: stats.created || 0,
                updated: stats.updated || 0,
                deleted: stats.deleted || 0,
                failed: stats.failed || 0,
                duration: Date.now() - pendingStartedAt,
              };
              totalPushOps += (stats.created || 0) + (stats.updated || 0) + (stats.deleted || 0) + (stats.failed || 0);
            }
          });
        }
        SyncHistory.recordPushPhase(syncEntry, pushModels);

        const uploaded = totalPushOps;
        const failed   = Object.values(pushModels).reduce((s, m) => s + (m.failed || 0), 0);

        results.pending.success  = true;
        results.pending.uploaded = uploaded;
        results.pending.failed   = failed;

        if (uploaded > 0) {
          showToast(`${uploaded} cambio${uploaded > 1 ? 's' : ''} subido${uploaded > 1 ? 's' : ''} correctamente`, 'success');
        }
        if (failed > 0) {
          showToast(`${failed} cambio${failed > 1 ? 's' : ''} no se pudo${failed > 1 ? 'eron' : ''} subir`, 'warning', 5000);
        }

        await refreshPendingCount();
      } catch (e) {
        results.pending.error = e.message;
        syncEntry.push.errors.push({ phase: 'PENDING', error: e.message });

        const errorResult = handleOdooError(e, {
          onLogout: onUnauthorized,
          onShowToast: showToast,
          onPermissionDenied: (error, context) => {
            showToast(
              'No se pudieron guardar los cambios por falta de permisos. Ponte en contacto con un administrador.',
              'warning',
              6000
            );
          },
        }, { action: 'subir cambios pendientes' });

        if (!errorResult.shouldLogout) {
          showToast('Error subiendo cambios pendientes', 'error', 5000);
        }
      }

      // ── 3. Clientes, Tareas y Leads en paralelo ────────────────────────────
      updatePhase('CLIENTS');
      const dataPhaseStartedAt = Date.now();
      const [clientsRes, tasksRes, leadsRes] = await Promise.allSettled([
        withRetry(() => SyncService.syncClients(), 'Clientes'),
        withRetry(() => SyncService.syncTasks(), 'Tareas'),
        withRetry(() => SyncService.syncLeads(), 'Oportunidades'),
      ]);
      const dataPhaseDuration = Date.now() - dataPhaseStartedAt;

      if (clientsRes.status === 'fulfilled') {
        const clientData = clientsRes.value || {};
        const clientStats = clientData.stats || { created: 0, updated: 0 };
        results.clients.success = true;
        results.clients.count   = clientData.clients?.length || 0;
        SyncHistory.recordPullPhase(syncEntry, 'CLIENTS', {
          'res.partner': { count: results.clients.count, created: clientStats.created, updated: clientStats.updated, duration: dataPhaseDuration }
        });
      } else {
        results.clients.error = clientsRes.reason?.message;
        syncEntry.pull.errors.push({ phase: 'CLIENTS', error: clientsRes.reason?.message });
        handleOdooError(clientsRes.reason, {
          onLogout: onUnauthorized,
          onShowToast: showToast,
        }, { action: 'sincronizar clientes' });
        if (!handleOdooError(clientsRes.reason, {}, {}).shouldLogout) {
          showToast('Error sincronizando clientes', 'error', 4000);
        }
      }

      if (tasksRes.status === 'fulfilled') {
        const taskData = tasksRes.value || {};
        const taskStats = taskData.stats || { created: 0, updated: 0 };
        results.tasks.success = true;
        results.tasks.count   = taskData.subtasks?.length || 0;
        if (taskData.subtasks?.length) {
          await SyncService.purgeExtendedTasksWithIds(taskData.subtasks.map(t => t.id));
        }
        SyncHistory.recordPullPhase(syncEntry, 'TASKS', {
          'project.task': { count: results.tasks.count, created: taskStats.created, updated: taskStats.updated, duration: dataPhaseDuration }
        });
      } else {
        results.tasks.error = tasksRes.reason?.message;
        syncEntry.pull.errors.push({ phase: 'TASKS', error: tasksRes.reason?.message });
        handleOdooError(tasksRes.reason, {
          onLogout: onUnauthorized,
          onShowToast: showToast,
        }, { action: 'sincronizar tareas' });
        if (!handleOdooError(tasksRes.reason, {}, {}).shouldLogout) {
          showToast('Error sincronizando tareas', 'error', 4000);
        }
      }

      if (leadsRes.status === 'fulfilled') {
        const leadData = leadsRes.value || {};
        const leadStats = leadData.stats || { created: 0, updated: 0 };
        results.leads.success = true;
        results.leads.count   = leadData.leads?.length || 0;
        SyncHistory.recordPullPhase(syncEntry, 'LEADS', {
          'crm.lead': { count: results.leads.count, created: leadStats.created, updated: leadStats.updated, duration: dataPhaseDuration }
        });
      } else {
        results.leads.error = leadsRes.reason?.message;
        syncEntry.pull.errors.push({ phase: 'LEADS', error: leadsRes.reason?.message });
        handleOdooError(leadsRes.reason, {
          onLogout: onUnauthorized,
          onShowToast: showToast,
        }, { action: 'sincronizar oportunidades' });
        if (!handleOdooError(leadsRes.reason, {}, {}).shouldLogout) {
          showToast('Error sincronizando oportunidades', 'error', 4000);
        }
      }

      // ── 4. Comentarios ─────────────────────────────────────────────────────
      updatePhase('COMMENTS');
      const commentsStartedAt = Date.now();
      try {
        await withRetry(() => SyncService.syncComments?.() || Promise.resolve(), 'Comentarios');
        results.comments.success = true;
        SyncHistory.recordPullPhase(syncEntry, 'COMMENTS', {
          'mail.message': { count: 0, duration: Date.now() - commentsStartedAt }
        });
      } catch (e) {
        results.comments.error = e.message;
        syncEntry.pull.errors.push({ phase: 'COMMENTS', error: e.message });
      }

      // ── 5. Encuestas ───────────────────────────────────────────────────────
      updatePhase('SURVEYS');
      const surveysStartedAt = Date.now();
      try {
        await withRetry(() => SyncService.syncSurveys(), 'Encuestas');
        results.surveys.success = true;
        SyncHistory.recordPullPhase(syncEntry, 'SURVEYS', {
          'survey.survey': { count: 0, duration: Date.now() - surveysStartedAt }
        });
      } catch (e) {
        results.surveys.error = e.message;
        syncEntry.pull.errors.push({ phase: 'SURVEYS', error: e.message });

        handleOdooError(e, {
          onLogout: onUnauthorized,
          onShowToast: showToast,
          onPermissionDenied: () => {
            showToast(
              'No se pudieron guardar los avances de la encuesta por falta de permisos. Ponte en contacto con un administrador.',
              'warning',
              6000
            );
          },
        }, { action: 'procesar encuestas' });
      }

      // ── 6. Adjuntos ────────────────────────────────────────────────────────
      updatePhase('ATTACHMENTS');
      const attachmentsStartedAt = Date.now();
      try {
        await withRetry(() => SyncService.syncAttachments(), 'Adjuntos');
        results.attachments.success = true;
        SyncHistory.recordPullPhase(syncEntry, 'ATTACHMENTS', {
          'ir.attachment': { count: 0, duration: Date.now() - attachmentsStartedAt }
        });
      } catch (e) {
        results.attachments.error = e.message;
        syncEntry.pull.errors.push({ phase: 'ATTACHMENTS', error: e.message });
      }

      // ── Resumen ────────────────────────────────────────────────────────────
      updatePhase('DONE');
      await StorageService.setItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());

      const finalEntry = SyncHistory.finalizeSyncEntry(syncEntry);
      await SyncHistory.addSyncHistoryEntry(finalEntry);

      const successCount = Object.values(results).filter(r => r.success).length;
      const totalModules = Object.keys(results).length;

      if (successCount === totalModules) {
        showToast('Todo sincronizado correctamente ✓', 'success', 3000);
      } else {
        const failedModules = Object.entries(results)
          .filter(([, r]) => !r.success)
          .map(([k]) => LABEL_MAP[k] || k)
          .join(', ');
        showToast(
          `${successCount}/${totalModules} módulos sincronizados. Falló: ${failedModules}`,
          'warning',
          6000
        );
      }

      await finishSync(results);
      return results;

    } catch (fatalError) {
      handleOdooError(fatalError, {
        onLogout: onUnauthorized,
        onShowToast: showToast,
      });

      showToast('Error crítico en sincronización', 'error', 6000);
      updatePhase('ERROR');

      const failedEntry = SyncHistory.finalizeSyncEntry(syncEntry, 'failed');
      failedEntry.errors.push({ operation: 'syncAll', error: fatalError.message });
      await SyncHistory.addSyncHistoryEntry(failedEntry);

      await finishSync({ ...results, fatalError: fatalError.message });
      return null;
    } finally {
      isSyncingRef.current = false;
    }
  }, [isOnline, startSync, finishSync, updatePhase, showToast, refreshPendingCount, withRetry, onUnauthorized]);

  const syncModule = useCallback(async (moduleName) => {
    if (!isOnline) {
      showToast('Sin conexión', 'warning');
      return null;
    }
    if (isSyncingRef.current) return null;

    const config = MODULE_SYNC_CONFIG[moduleName];
    if (!config) {
      showToast(`Módulo desconocido: ${moduleName}`, 'error');
      return null;
    }

    isSyncingRef.current = true;
    startSync();

    const startedAt = Date.now();
    const results = { success: false };
    const syncEntry = {
      id: SyncHistory.createSyncAllEntry().id,
      timestamp: new Date().toISOString(),
      type: 'syncModule',
      moduleLabel: config.label,
      direction: 'pull',
      status: 'syncing',
      startedAt,
      phaseSequence: [moduleName.toUpperCase()],
      pull: { totalModels: 0, totalRecords: 0, models: {}, status: 'idle', errors: [] },
      push: { totalModels: 0, totalRecords: 0, models: {}, status: 'idle', errors: [] },
    };

    try {
      updatePhase('PENDING');
      try {
        await SyncService.syncPendingChanges(true, config.pushModels);
        await refreshPendingCount();
      } catch (e) {
        handleOdooError(e, {
          onLogout: onUnauthorized,
          onShowToast: showToast,
        });
      }

      updatePhase(config.phaseName);
      try {
        const result = await config.pull();
        results.success = true;
        showToast(`${config.label} actualizados`, 'success');
        SyncHistory.recordPullPhase(syncEntry, config.phaseName, {
          [config.odooModel]: {
            count: config.getCount(result),
            created: result?.stats?.created || 0,
            updated: result?.stats?.updated || 0,
            duration: Date.now() - startedAt,
          },
        });
      } catch (err) {
        syncEntry.pull.errors.push({ phase: config.phaseName, error: err.message });

        handleOdooError(err, {
          onLogout: onUnauthorized,
          onShowToast: showToast,
        }, { action: `actualizar ${config.label}` });
      }

      updatePhase('DONE');

      const finalEntry = SyncHistory.finalizeSyncEntry(syncEntry);
      await SyncHistory.addSyncHistoryEntry(finalEntry);

      await refreshPendingCount();
      await finishSync(results);
      return null;
    } catch (fatalError) {
      updatePhase('ERROR');

      const failedEntry = SyncHistory.finalizeSyncEntry(syncEntry, 'failed');
      failedEntry.errors.push({ operation: moduleName, error: fatalError.message });
      await SyncHistory.addSyncHistoryEntry(failedEntry);

      handleOdooError(fatalError, {
        onLogout: onUnauthorized,
        onShowToast: showToast,
      }, { action: `actualizar ${config.label}` });

      await finishSync({ ...results, fatalError: fatalError.message });
      return null;
    } finally {
      isSyncingRef.current = false;
    }
  }, [isOnline, startSync, finishSync, updatePhase, showToast, refreshPendingCount, onUnauthorized]);

  const notifyLocalWrite = useCallback(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  return { syncAll, syncModule, notifyLocalWrite };
}

const MODULE_SYNC_CONFIG = {
  clients: {
    pushModels: ['res.partner'],
    phaseName: 'CLIENTS',
    odooModel: 'res.partner',
    label: 'Clientes',
    getCount: (r) => r?.clients?.length || 0,
    pull: async () => {
      await SyncService.syncMasterData();
      return SyncService.syncClients();
    },
  },
  leads: {
    pushModels: ['crm.lead', 'project.task'],
    phaseName: 'LEADS',
    odooModel: 'crm.lead',
    label: 'Oportunidades',
    getCount: (r) => r?.leads?.length || 0,
    pull: async () => {
      await SyncService.syncMasterData();
      return SyncService.syncLeads();
    },
  },
  tasks: {
    pushModels: ['project.task', 'survey.user_input', 'reason.wizard', 'ir.attachment'],
    phaseName: 'TASKS',
    odooModel: 'project.task',
    label: 'Tareas',
    getCount: (r) => r?.subtasks?.length || 0,
    pull: async () => {
      await SyncService.syncMasterData();
      const result = await SyncService.syncTasks();
      await SyncService.syncSurveys();
      await SyncService.syncAttachments();
      return result;
    },
  },
};

const LABEL_MAP = {
  pending:     'Pendientes',
  master:      'Datos base',
  clients:     'Clientes',
  tasks:       'Tareas',
  leads:       'Oportunidades',
  comments:    'Comentarios',
  surveys:     'Encuestas',
  attachments: 'Adjuntos',
};