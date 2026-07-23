import OdooService from '../api/odoo.service';
import StorageService from '../storage/storage.service';
import { STORAGE_KEYS } from './sync.constants';
import * as Pending from './sync.pending';
import { diffAndMerge, applyIncrementalDelta } from './sync.diff';

export async function syncLeads() {
  try {
    console.log('🔄 Sincronizando oportunidades (CRM Leads)...');

    try {
      await Pending.syncPendingChangesNonSurvey();
    } catch (pendingError) {
    }

    const syncStartedAt = new Date(Date.now() - 10_000).toISOString();
    const lastSync = await StorageService.getItem(STORAGE_KEYS.LAST_SYNC_LEADS);
    const isIncremental = !!lastSync;

    const domain = isIncremental
      ? ['|', ['active', '=', true], ['active', '=', false], ['write_date', '>', lastSync]]
      : [['active', '=', true]];

    const leads = await OdooService.searchRead(
      'crm.lead',
      domain,
      [
        'id', 'name', 'partner_id', 'user_id', 'stage_id',
        'expected_revenue', 'probability', 'date_deadline',
        'description', 'active', 'create_date', 'write_date',
        'tag_ids', 'company_currency',
        'task_ids',
        'email_from', 'phone', 'mobile',
        'partner_name', 'contact_name',
        'street', 'street2', 
        'country_id', 'state_id',
        'client_type',
        'function'
      ],
      1000
    );

    const previous = (await StorageService.getItem(STORAGE_KEYS.LEADS)) || [];
    const pending = (await StorageService.getItem(STORAGE_KEYS.PENDING_CHANGES)) || [];
    const protectedIds = new Set(pending.filter(p => p.model === 'crm.lead').map(p => p.recordId));

    const { merged, stats } = isIncremental
      ? applyIncrementalDelta(previous, leads, protectedIds)
      : diffAndMerge(previous, leads, protectedIds);

    await StorageService.setItem(STORAGE_KEYS.LEADS, merged);
    await StorageService.setItem(STORAGE_KEYS.LAST_SYNC_LEADS, syncStartedAt);
    console.log('✅ Leads sincronizados:', merged.length, `(creados: ${stats.created}, actualizados: ${stats.updated})`);
    
    return { leads: merged, stats };
  } catch (error) {
    console.error('❌ Error sincronizando leads:', error);
    throw error;
  }
}

/** Devuelve todos los leads almacenados localmente (propios + ajenos). */
export async function getLocalLeads() {
  try {
    const leads = await StorageService.getItem(STORAGE_KEYS.LEADS);
    return leads || [];
  } catch (error) {
    console.error('❌ Error leyendo leads locales:', error);
    return [];
  }
}

/**
 * Devuelve únicamente los leads cuyo user_id coincide con el usuario
 * autenticado actualmente. Se usa para restricción de edición.
 */
export async function getOwnLeads() {
  try {
    const leads = await getLocalLeads();
    const currentUserId = OdooService.uid;
    if (!currentUserId) return leads;
    return leads.filter(l => {
      const leadUserId = Array.isArray(l.user_id) ? l.user_id[0] : l.user_id;
      return leadUserId === currentUserId;
    });
  } catch (error) {
    console.error('❌ Error leyendo leads propios:', error);
    return [];
  }
}

export async function getLeadByTaskId(taskId) {
  try {
    const leads = await getLocalLeads();
    const associatedLead = leads.find(lead => {
      if (!lead.task_ids || lead.task_ids.length === 0) return false;
      return lead.task_ids.includes(taskId);
    });
    return associatedLead || null;
  } catch (error) {
    return null;
  }
}

export async function createLeadLocally(leadData = {}) {
  try {
    const tempId = -Math.floor(Math.random() * 1000000);
    const nowIso = new Date().toISOString();

    const lead = {
      id: tempId,
      ...leadData,
      active: true,
      create_date: nowIso,
      write_date: nowIso,
    };

    const leads = (await StorageService.getItem(STORAGE_KEYS.LEADS)) || [];
    leads.push(lead);
    await StorageService.setItem(STORAGE_KEYS.LEADS, leads);

    await Pending.addPendingChange('crm.lead', tempId, {
      ...leadData,
      _is_creation: true,
    });

    return lead;
  } catch (error) {
    throw error;
  }
}

/**
 * Actualiza un lead localmente y añade pending.
 * Solo se llama desde la UI para leads propios (la restricción se aplica
 * en LeadDetailModal antes de llegar aquí).
 */
export async function updateLeadLocally(leadId, updates = {}, opts = {}) {
  try {
    const leads = (await StorageService.getItem(STORAGE_KEYS.LEADS)) || [];
    let found = false;
    
    const updatedLeads = leads.map(l => {
      if (l.id === leadId) {
        found = true;
        return {
          ...l,
          ...updates,
          write_date: new Date().toISOString(),
        };
      }
      return l;
    });

    if (!found) {
      throw new Error(`Lead con id ${leadId} no encontrado localmente`);
    }

    await StorageService.setItem(STORAGE_KEYS.LEADS, updatedLeads);

    if (!opts.noPending) {
      const normalizedUpdates = { ...updates };
      if (normalizedUpdates.stage_id) {
        if (Array.isArray(normalizedUpdates.stage_id)) {
          normalizedUpdates.stage_id = normalizedUpdates.stage_id[0];
        }
        normalizedUpdates._is_stage_change = true;
      }
      await Pending.addPendingChange('crm.lead', leadId, normalizedUpdates);
    }

    return updatedLeads.find(l => l.id === leadId);
  } catch (error) {
    throw error;
  }
}

export async function deleteLeadLocally(leadId) {
  try {
    
    const leads = (await StorageService.getItem(STORAGE_KEYS.LEADS)) || [];
    const lead = leads.find(l => l.id === leadId);
    
    if (!lead) {
      throw new Error(`Lead ${leadId} no encontrado`);
    }

    const taskIds = lead.task_ids || [];
    
    if (taskIds.length > 0) {
      const tasks = (await StorageService.getItem(STORAGE_KEYS.TASKS)) || [];
      const updatedTasks = tasks.filter(t => !taskIds.includes(t.id));
      await StorageService.setItem(STORAGE_KEYS.TASKS, updatedTasks);
      
      for (const taskId of taskIds) {
        if (taskId > 0) {
          await Pending.addPendingChange('project.task', taskId, { 
            _is_deletion: true 
          });
        }
      }
      
    }

    const updatedLeads = leads.filter(l => l.id !== leadId);
    await StorageService.setItem(STORAGE_KEYS.LEADS, updatedLeads);

    if (leadId > 0) {
      await Pending.addPendingChange('crm.lead', leadId, { 
        _is_deletion: true 
      });
    }

    return { deletedLead: lead, deletedTasksCount: taskIds.length };
  } catch (error) {
    throw error;
  }
}

export async function getLeadTasks(leadId) {
  try {
    const allTasks = await StorageService.getItem(STORAGE_KEYS.TASKS) || [];
    const lead = (await StorageService.getItem(STORAGE_KEYS.LEADS) || []).find(l => l.id === leadId);
    if (!lead || !lead.task_ids || lead.task_ids.length === 0) return [];
    const taskIds = lead.task_ids;
    return allTasks.filter(t => taskIds.includes(t.id));
  } catch (error) {
    return [];
  }
}

export async function associateTaskToLead(leadId, taskId) {
  try {
    const leads = (await StorageService.getItem(STORAGE_KEYS.LEADS)) || [];
    const leadIndex = leads.findIndex(l => l.id === leadId);
    if (leadIndex === -1) throw new Error(`Lead ${leadId} no encontrado`);

    const currentTaskIds = leads[leadIndex].task_ids || [];
    if (!currentTaskIds.includes(taskId)) {
      currentTaskIds.push(taskId);
      leads[leadIndex].task_ids = currentTaskIds;
      leads[leadIndex].write_date = new Date().toISOString();
      
      await StorageService.setItem(STORAGE_KEYS.LEADS, leads);
      await Pending.addPendingChange('crm.lead', leadId, { task_ids: [[4, taskId]] });
    }
  } catch (error) {
    throw error;
  }
}

export async function getLeadsStatsByStage() {
  try {
    const leads = await getLocalLeads();
    const stages = await StorageService.getItem(STORAGE_KEYS.MASTER_CRM_STAGES) || [];
    return stages.map(stage => {
      const count = leads.filter(lead => {
        const leadStageId = Array.isArray(lead.stage_id) ? lead.stage_id[0] : lead.stage_id;
        return leadStageId === stage.id;
      }).length;
      return { stageId: stage.id, stageName: stage.name, count };
    });
  } catch (error) {
    return [];
  }
}

export default {
  syncLeads,
  getLocalLeads,
  getOwnLeads,
  createLeadLocally,
  updateLeadLocally,
  deleteLeadLocally,
  getLeadTasks,
  associateTaskToLead,
  getLeadsStatsByStage,
  getLeadByTaskId,
};