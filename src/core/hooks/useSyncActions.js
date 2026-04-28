import { useCallback, useRef } from 'react';
import { useSyncContext } from '../context/SyncContext';
import SyncService from '../sync/sync.service';
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
      return null;
    }
    if (isSyncingRef.current) return null;

    isSyncingRef.current = true;
    startSync();

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
      try {
        await withRetry(() => SyncService.syncMasterData(), 'Datos base');
        results.master.success = true;
      } catch (e) {
        results.master.error = e.message;
        
        // Verificar si es error de autorización
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
      try {
        const pendingResult = await withRetry(
          () => SyncService.syncPendingChanges(), 'Cambios pendientes'
        );
        const uploaded = (pendingResult?.otherResult?.success || 0) +
                         (pendingResult?.surveyResult?.success || 0);
        const failed   = (pendingResult?.otherResult?.failed  || 0) +
                         (pendingResult?.surveyResult?.failed  || 0);

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
        
        // Manejo de errores de pending con detección de autorización
        const errorResult = handleOdooError(e, {
          onLogout: onUnauthorized,
          onShowToast: showToast,
          onPermissionDenied: (error, context) => {
            // Error de permisos específico en encuestas/cambios
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
      const [clientsRes, tasksRes, leadsRes] = await Promise.allSettled([
        withRetry(() => SyncService.syncClients(), 'Clientes'),
        withRetry(() => SyncService.syncTasks(), 'Tareas'),
        withRetry(() => SyncService.syncLeads(), 'Oportunidades'),
      ]);

      if (clientsRes.status === 'fulfilled') {
        results.clients.success = true;
        results.clients.count   = clientsRes.value?.length || 0;
      } else {
        results.clients.error = clientsRes.reason?.message;
        handleOdooError(clientsRes.reason, {
          onLogout: onUnauthorized,
          onShowToast: showToast,
        }, { action: 'sincronizar clientes' });
        if (!handleOdooError(clientsRes.reason, {}, {}).shouldLogout) {
          showToast('Error sincronizando clientes', 'error', 4000);
        }
      }

      if (tasksRes.status === 'fulfilled') {
        results.tasks.success = true;
        results.tasks.count   = tasksRes.value?.subtasks?.length || 0;
        if (tasksRes.value?.subtasks?.length) {
          await SyncService.purgeExtendedTasksWithIds(tasksRes.value.subtasks.map(t => t.id));
        }
      } else {
        results.tasks.error = tasksRes.reason?.message;
        handleOdooError(tasksRes.reason, {
          onLogout: onUnauthorized,
          onShowToast: showToast,
        }, { action: 'sincronizar tareas' });
        if (!handleOdooError(tasksRes.reason, {}, {}).shouldLogout) {
          showToast('Error sincronizando tareas', 'error', 4000);
        }
      }

      if (leadsRes.status === 'fulfilled') {
        results.leads.success = true;
        results.leads.count   = Array.isArray(leadsRes.value) ? leadsRes.value.length : 0;
      } else {
        results.leads.error = leadsRes.reason?.message;
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
      try {
        await withRetry(() => SyncService.syncComments?.() || Promise.resolve(), 'Comentarios');
        results.comments.success = true;
      } catch (e) {
        results.comments.error = e.message;
      }

      // ── 5. Encuestas ───────────────────────────────────────────────────────
      updatePhase('SURVEYS');
      try {
        await withRetry(() => SyncService.syncSurveys(), 'Encuestas');
        results.surveys.success = true;
      } catch (e) {
        results.surveys.error = e.message;
        
        // Manejo específico de errores en encuestas
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
      try {
        await withRetry(() => SyncService.syncAttachments(), 'Adjuntos');
        results.attachments.success = true;
      } catch (e) {
        results.attachments.error = e.message;
      }

      // ── Resumen ────────────────────────────────────────────────────────────
      updatePhase('DONE');
      await StorageService.setItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());

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

    try {
      await SyncService.syncPendingChanges();
      await refreshPendingCount();
    } catch (e) {
      handleOdooError(e, {
        onLogout: onUnauthorized,
        onShowToast: showToast,
      });
    }

    try {
      let result;
      switch (moduleName) {
        case 'clients':
          result = await SyncService.syncClients();
          showToast(`Clientes actualizados (${result?.length || 0})`, 'success');
          break;
        case 'leads':
          result = await SyncService.syncLeads();
          showToast(`Oportunidades actualizadas`, 'success');
          break;
        case 'tasks':
          result = await SyncService.syncTasks();
          showToast(`Tareas actualizadas`, 'success');
          break;
        default:
          result = await SyncService.syncAll();
      }
      await refreshPendingCount();
      return result;
    } catch (err) {
      handleOdooError(err, {
        onLogout: onUnauthorized,
        onShowToast: showToast,
      }, { action: `actualizar ${LABEL_MAP[moduleName] || moduleName}` });
      return null;
    }
  }, [isOnline, showToast, refreshPendingCount, onUnauthorized]);

  const notifyLocalWrite = useCallback(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  return { syncAll, syncModule, notifyLocalWrite };
}

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