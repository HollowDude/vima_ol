import * as Surveys from './sync.surveys';
import * as Pending from './sync.pending';
import * as Tasks from './sync.tasks';
import * as Master from './sync.masterdata';
import * as Clients from './sync.clients';
import * as Leads from './sync.leads';
import * as Utils from './sync.utils';
import * as Session from './sync.session';
import * as Comments from './sync.comments';
import * as Attachments from './sync.attachments';
import SyncHistory from './sync.history';
import { STORAGE_KEYS } from './sync.constants';
import StorageService from '../storage/storage.service';
import OdooService from '../api/odoo.service';

class SyncService {
  constructor() {}

  /** @deprecated No se usa en ningún lado. Todas las pantallas llaman a useSyncActions.syncAll().
   *  Además tiene un bug: recordPushPhase(syncEntry, 'PENDING', pendingResult) en línea 41
   *  pasa un string como segundo argumento donde se espera un objeto de operaciones. */
  async syncAll() {
    const startTime = Date.now();
    const syncEntry = SyncHistory.createSyncAllEntry(startTime);
    let finalEntry;
    
    try {
      // FASE 1: MASTER DATA (PULL)
      try {
        await this.syncMasterData();
        
        SyncHistory.recordPullPhase(syncEntry, 'MASTER', {
          'res.country': { count: 1, updated: 1 },
          'res.country.state': { count: 1, updated: 1 },
          'res.municipality': { count: 1, updated: 1 },
        });
      } catch (e) {
        syncEntry.pull.errors.push({ phase: 'MASTER', error: e.message });
      }

      // FASE 2: PENDING CHANGES (PUSH)
      try {
        const pendingResult = await this.syncPendingChanges(true);
        SyncHistory.recordPushPhase(syncEntry, pendingResult);
      } catch (e) {
        syncEntry.push.errors.push({ phase: 'PENDING', error: e.message });
      }

      // FASE 3: CLIENTS (PULL)
      try {
        const clientsResult = await this.syncClients();
        const clientCount = clientsResult?.clients?.length || 0;
        SyncHistory.recordPullPhase(syncEntry, 'CLIENTS', {
          'res.partner': { count: clientCount, created: clientCount }
        });
      } catch (e) {
        syncEntry.pull.errors.push({ phase: 'CLIENTS', error: e.message });
      }

      // FASE 4: TASKS (PULL)
      try {
        const tasksResult = await this.syncTasks();
        const taskCount = (tasksResult?.macrotasks?.length || 0) + (tasksResult?.subtasks?.length || 0);
        SyncHistory.recordPullPhase(syncEntry, 'TASKS', {
          'project.task': { count: taskCount }
        });
      } catch (e) {
        syncEntry.pull.errors.push({ phase: 'TASKS', error: e.message });
      }

      // FASE 5: LEADS (PULL)
      try {
        const leadsResult = await this.syncLeads();
        const leadCount = leadsResult?.leads?.length || 0;
        SyncHistory.recordPullPhase(syncEntry, 'LEADS', {
          'crm.lead': { count: leadCount }
        });
      } catch (e) {
        syncEntry.pull.errors.push({ phase: 'LEADS', error: e.message });
      }

      // FASE 6: COMMENTS (PULL)
      try {
        await Comments.syncComments();
        SyncHistory.recordPullPhase(syncEntry, 'COMMENTS', {
          'mail.message': { count: 0 }
        });
      } catch (e) {
        syncEntry.pull.errors.push({ phase: 'COMMENTS', error: e.message });
      }

      // FASE 7: SURVEYS (PULL)
      try {
        const surveysResult = await this.syncSurveys();
        const surveyCount = surveysResult?.length || 0;
        SyncHistory.recordPullPhase(syncEntry, 'SURVEYS', {
          'survey.survey': { count: surveyCount }
        });
      } catch (e) {
        syncEntry.pull.errors.push({ phase: 'SURVEYS', error: e.message });
      }

      // FASE 8: ATTACHMENTS (PULL)
      try {
        await this.syncAttachments();
        SyncHistory.recordPullPhase(syncEntry, 'ATTACHMENTS', {
          'ir.attachment': { count: 0 }
        });
      } catch (e) {
        syncEntry.pull.errors.push({ phase: 'ATTACHMENTS', error: e.message });
      }

      // GUARDAR ÚLTIMA SYNC
      try {
        await StorageService.setItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
      } catch (e) {}

      // FINALIZAR Y GUARDAR
      finalEntry = SyncHistory.finalizeSyncEntry(syncEntry);
      await SyncHistory.addSyncHistoryEntry(finalEntry);
      
      return {
        macrotasks: [],
        subtasks: [],
        surveys: [],
        leads: [],
        syncedAt: finalEntry.timestamp,
      };
    } catch (error) {
      console.error('❌ Error en syncAll:', error);
      finalEntry = SyncHistory.finalizeSyncEntry(syncEntry, 'failed');
      finalEntry.errors.push({ operation: 'syncAll', error: error.message });
      await SyncHistory.addSyncHistoryEntry(finalEntry);
      throw error;
    }
  }

  // Comentarios
  async getTaskComments(...args) { return Comments.getTaskComments(...args); }
  async createCommentLocally(...args) { return Comments.createCommentLocally(...args); }

  // Encuestas
  async syncSurveys() { return Surveys.syncSurveys(); }
  async getSurveyById(...args) { return Surveys.getSurveyById(...args); }
  async getSurveyQuestions(...args) { return Surveys.getSurveyQuestions(...args); }
  async getSurveyProgress(...args) { return Surveys.getSurveyProgress(...args); }
  async saveSurveyProgress(...args) { return Surveys.saveSurveyProgress(...args); }
  async completeSurvey(...args) { return Surveys.completeSurvey(...args); }
  async syncSurveyResponses(...args) { return Surveys.syncSurveyResponses(...args); }

  // Pendientes
  async syncPendingChanges(skipHistory = false, modelsAllowed = null) {
    const startTime = Date.now();
    const operationsData = {};
    let errors = [];
    
    try {
      // Encuestas
      const surveyResult = await Surveys.syncSurveyResponses(modelsAllowed);
      if (surveyResult) {
        operationsData['survey.user_input'] = {
          created: surveyResult.created || 0,
          updated: surveyResult.updated || 0,
          failed: surveyResult.failed || 0
        };
        if (surveyResult.failed) {
          errors.push({ model: 'survey.user_input', count: surveyResult.failed });
        }
      }
      
      // Otros cambios pendientes
      const otherResult = await Pending.syncPendingChangesNonSurvey(modelsAllowed);
      if (otherResult) {
        if (otherResult.byModel) {
          Object.entries(otherResult.byModel).forEach(([model, stats]) => {
            operationsData[model] = {
              created: stats.created || 0,
              updated: stats.updated || 0,
              deleted: stats.deleted || 0,
              failed: stats.failed || 0
            };
            if (stats.failed > 0) {
              errors.push({ model, count: stats.failed });
            }
          });
        }
      }
      
      const finalEntry = SyncHistory.finalizeSyncEntry({
        id: Date.now().toString(36),
        timestamp: new Date().toISOString(),
        type: 'syncPending',
        direction: 'push',
        duration: Date.now() - startTime,
        startTime,
        push: {
          totalRecords: (operationsData['survey.user_input']?.created || 0) + (operationsData['project.task']?.created || 0) + (operationsData['crm.lead']?.created || 0),
          totalModels: Object.keys(operationsData).length,
          models: operationsData,
          status: errors.length > 0 ? 'partial' : 'success',
          errors
        }
      });
      
      if (!skipHistory) {
        await SyncHistory.addSyncHistoryEntry(finalEntry);
      }
      
      return operationsData;
    } catch (error) {
      console.error('❌ Error en syncPendingChanges:', error);
      
      if (!skipHistory) {
        await SyncHistory.addSyncHistoryEntry({
        id: Date.now().toString(36),
        timestamp: new Date().toISOString(),
        type: 'syncPending',
        direction: 'push',
        status: 'failed',
        duration: Date.now() - startTime,
        error: error.message,
        push: { totalRecords: 0, totalModels: 0, models: operationsData, errors: [{ error: error.message }] }
      });
      
      throw error;
    }
  }}
  async addPendingChange(model, recordId, updates) { return Pending.addPendingChange(model, recordId, updates); }
  async createReasonWizard(model, wizardData) { return Pending.createReasonWizard(model, wizardData); }

  // Tareas
  async createTaskLocally(taskData) { return Tasks.createTaskLocally(taskData); }
  async updateTaskLocally(taskId, updates, opts) { return Tasks.updateTaskLocally(taskId, updates, opts); }
  async getSurveysForTask(taskId) { return Surveys.getSurveysForTask(taskId); }
  async syncTasks(extraProjectId) {
    const result = await Tasks.syncTasks(extraProjectId);
    if (result?.subtasks?.length) {
      await Tasks.purgeExtendedTasksWithIds(result.subtasks.map(t => t.id));
    }
    return result;
  }
  async syncAllTasks(userId) { return Tasks.syncAllTasks(userId); }
  async getAllVisibleTasks() { return Tasks.getAllVisibleTasks(); }
  async replaceLocalTaskId(tempId, realId) { return Tasks.replaceLocalTaskId(tempId, realId); }

  // Maestros
  async syncMasterData() { return Master.syncMasterData(); }
  async getMasterData(type) { return Master.getMasterData(type); }
  async getManagementTags() { return Master.getManagementTags(); }
  async getCrmStages() { return Master.getCrmStages(); }

  // Clientes
  async syncClients() { return Clients.syncClients(); }
  async getLocalClients() { return Clients.getLocalClients(); }
  /** Sólo los clientes del usuario autenticado (para asignación en tareas/leads). */
  async getOwnClients() { return Clients.getOwnClients(); }
  async getLocalMacrotasks() { return Clients.getLocalMacrotasks(); }
  async getLocalSubtasks() { return Clients.getLocalSubtasks(); }
  async getLastSyncDate() { return Clients.getLastSyncDate(); }
  async updateClientLocally(clientId, updates, opts) { return Clients.updateClientLocally(clientId, updates, opts); }
  async getClientById(clientId) { return Clients.getClientById(clientId); }
  async createClientLocally(clientData) { return Clients.createClientLocally(clientData); }

  // Leads
  async syncLeads() { return Leads.syncLeads(); }
  async getLocalLeads() { return Leads.getLocalLeads(); }
  /** Sólo los leads del usuario autenticado (para restricción de edición). */
  async getOwnLeads() { return Leads.getOwnLeads(); }
  async createLeadLocally(leadData) { return Leads.createLeadLocally(leadData); }
  async updateLeadLocally(leadId, updates, opts) { return Leads.updateLeadLocally(leadId, updates, opts); }
  async deleteLeadLocally(leadId) { return Leads.deleteLeadLocally(leadId); }
  async getLeadTasks(leadId) { return Leads.getLeadTasks(leadId); }
  async associateTaskToLead(leadId, taskId) { return Leads.associateTaskToLead(leadId, taskId); }
  async disassociateTaskFromLead(leadId, taskId) { return Leads.disassociateTaskFromLead(leadId, taskId); }
  async getLeadsStatsByStage() { return Leads.getLeadsStatsByStage(); }
  async getLeadByTaskId(taskId) { return Leads.getLeadByTaskId(taskId); }
  async getLeadsByTaskId(taskId) { return Leads.getLeadsByTaskId(taskId); }
  async resolveOrCreatePartnerForLead(lead, options) { return Leads.resolveOrCreatePartnerForLead(lead, options); }

  // Utilidades
  sanitizeForOdoo(data) { return Utils.sanitizeForOdoo(data); }

  // Sesión
  async getCurrentUser() { return Session.getCurrentUser(); }
  async getUserId() { return Session.getUserId(); }
  async getCurrentProject() { return Session.getCurrentProject(); }

  // Adjuntos
  async syncAttachments() { return Attachments.syncAttachments(); }
  async getTaskAttachments(taskId) { return Attachments.getTaskAttachments(taskId); }
  async downloadAttachment(attachmentId) { return Attachments.downloadAttachment(attachmentId); }
  async uploadAttachment(...args) { return Attachments.uploadAttachment(...args); }
  async deleteAttachment(attachmentId) { return Attachments.deleteAttachment(attachmentId); }
  async clearAttachmentsCache() { return Attachments.clearAttachmentsCache(); }

  async clearProjectCacheSafe() {
    try {
      console.log('Limpieza de caché local por cambio de proyecto...');
      await StorageService.removeItem(STORAGE_KEYS.TASKS);
      await StorageService.removeItem(STORAGE_KEYS.MACROTASKS);
      await StorageService.removeItem(STORAGE_KEYS.LEADS);
      await StorageService.removeItem(STORAGE_KEYS.LAST_SYNC_TASKS);
      await StorageService.removeItem(STORAGE_KEYS.LAST_SYNC_LEADS);
    } catch (error) {
      console.error('Error limpiando caché de proyecto:', error);
    }
  }

  async clearLocalData() {
    try {
      await StorageService.removeItem(STORAGE_KEYS.CLIENTS);
      await StorageService.removeItem(STORAGE_KEYS.TASKS);
      await StorageService.removeItem(STORAGE_KEYS.PREVIOUS_PROJECT_ID);
      await StorageService.removeItem(STORAGE_KEYS.CURRENT_PROJECT);
      await StorageService.removeItem(STORAGE_KEYS.MACROTASKS);
      await StorageService.removeItem(STORAGE_KEYS.LEADS);
      await StorageService.removeItem(STORAGE_KEYS.LAST_SYNC);
      await StorageService.removeItem(STORAGE_KEYS.PENDING_CHANGES);
      await StorageService.removeItem(STORAGE_KEYS.SURVEYS);
      await StorageService.removeItem(STORAGE_KEYS.SURVEY_QUESTIONS);
      await StorageService.removeItem(STORAGE_KEYS.SURVEY_ANSWERS);
      await StorageService.removeItem(STORAGE_KEYS.SURVEY_PROGRESS);
      await StorageService.removeItem(STORAGE_KEYS.LAST_SYNC_CLIENTS);
      await StorageService.removeItem(STORAGE_KEYS.LAST_SYNC_TASKS);
      await StorageService.removeItem(STORAGE_KEYS.LAST_SYNC_LEADS);
      await StorageService.removeItem(STORAGE_KEYS.MASTER_COUNTRIES);
      await StorageService.removeItem(STORAGE_KEYS.MASTER_STATES);
      await StorageService.removeItem(STORAGE_KEYS.MASTER_MUNICIPALITIES);
      await StorageService.removeItem(STORAGE_KEYS.MASTER_CLIENT_TYPES);
      await StorageService.removeItem(STORAGE_KEYS.MASTER_TASK_TAGS);
      await StorageService.removeItem(STORAGE_KEYS.MASTER_CRM_STAGES);
      await StorageService.removeItem(STORAGE_KEYS.CURRENT_USER);
      await StorageService.removeItem(STORAGE_KEYS.COMMENTS);
      await StorageService.removeItem(STORAGE_KEYS.SURVEY_RELS);
      await StorageService.removeItem(STORAGE_KEYS.SURVEY_USER_INPUTS);
      await StorageService.removeItem(STORAGE_KEYS.EXTENDED_TASKS);
      await StorageService.removeItem(STORAGE_KEYS.SYNC_HISTORY);
      await Attachments.clearAttachmentsCache();
    } catch (error) {
      console.error(' Error limpiando datos locales:', error);
    }
  }

  async clearProjectData() {
    try {
      await this.syncPendingChanges();
      await StorageService.removeItem(STORAGE_KEYS.TASKS);
      await StorageService.removeItem(STORAGE_KEYS.MACROTASKS);
      await StorageService.removeItem(STORAGE_KEYS.PENDING_CHANGES);
      await StorageService.removeItem(STORAGE_KEYS.SURVEYS);
      await StorageService.removeItem(STORAGE_KEYS.SURVEY_QUESTIONS);
      await StorageService.removeItem(STORAGE_KEYS.SURVEY_ANSWERS);
      await StorageService.removeItem(STORAGE_KEYS.SURVEY_PROGRESS);
    } catch (error) {
      console.error(' Error limpiando caché de proyecto:', error);
    }
  }

  async purgeExtendedTasksWithIds(ids)         { return Tasks.purgeExtendedTasksWithIds(ids); }
  async fetchAndCacheTasksForRange(from, to)   { return Tasks.fetchAndCacheTasksForRange(from, to); }
  async getExtendedTasks()                     { return Tasks.getExtendedTasks(); }
  async cleanExpiredExtendedTasks()            { return Tasks.cleanExpiredExtendedTasks(); }
  async touchBatchForTask(taskId)              { return Tasks.touchBatchForTask(taskId); }
  async updateExtendedTaskLocally(id, updates) { return Tasks.updateExtendedTaskLocally(id, updates); }
}

export default new SyncService();