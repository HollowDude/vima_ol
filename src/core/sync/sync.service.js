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
import { STORAGE_KEYS } from './sync.constants';
import StorageService from '../storage/storage.service';
import OdooService from '../api/odoo.service';

class SyncService {
  constructor() {}

  async syncAll() {
    try {
      const { projectChanged, oldProject } = await this.syncMasterData();

      const now = new Date();
      const dayOfMonth = now.getDate();
      const isLateMonth = dayOfMonth > 25;
      
      let projectToKeepId = null;

      if (isLateMonth) {
        if (projectChanged && oldProject) {
            console.log(`📅 Cambio post-día 25. Guardando ID proyecto anterior: ${oldProject.display_name}`);
            await StorageService.setItem(STORAGE_KEYS.PREVIOUS_PROJECT_ID, oldProject.id);
            projectToKeepId = oldProject.id;
        } else {
            const savedPrevId = await StorageService.getItem(STORAGE_KEYS.PREVIOUS_PROJECT_ID);
            if (savedPrevId) {
                console.log(`📅 Manteniendo tareas del proyecto anterior (Persistido ID: ${savedPrevId})`);
                projectToKeepId = savedPrevId;
            }
        }
      } else {
        await StorageService.removeItem(STORAGE_KEYS.PREVIOUS_PROJECT_ID);
        if (projectChanged) {
            console.log('🧹 Cambio de proyecto estándar (<= día 25). Limpiando caché antigua...');
            await this.clearProjectCacheSafe();
        }
      }

      try {
        await this.syncPendingChanges();
        console.log('✅ Cambios pendientes enviados');
      } catch (pendingError) {
        console.warn('⚠️ Error en cambios pendientes (continuando):', pendingError);
      }

      const [clientsResult, tasksResult, leadsResult] = await Promise.all([
        this.syncClients(),
        this.syncTasks(),
        this.syncLeads() 
      ]);

      await Comments.syncComments(); 
      const surveysResult = await this.syncSurveys();
      await this.syncAttachments();

      try {
        await StorageService.setItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
      } catch (e) {}

      return {
        clients: clientsResult,
        macrotasks: (tasksResult && tasksResult.macrotasks) ? tasksResult.macrotasks : [],
        subtasks: (tasksResult && tasksResult.subtasks) ? tasksResult.subtasks : [],
        surveys: surveysResult || [],
        leads: leadsResult || [],
        syncedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('❌ Error en syncAll:', error);
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
  async syncPendingChanges() {
    try {
      const surveyResult = await Surveys.syncSurveyResponses();
      const otherResult = await Pending.syncPendingChangesNonSurvey();
      return { surveyResult, otherResult };
    } catch (error) {
      console.error('❌ Error en syncPendingChanges:', error);
      throw error;
    }
  }
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

  // Leads
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
  async getLeadsStatsByStage() { return Leads.getLeadsStatsByStage(); }
  async getLeadByTaskId(taskId) { return Leads.getLeadByTaskId(taskId); }

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