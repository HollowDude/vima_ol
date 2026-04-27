import OdooService from '../api/odoo.service';
import StorageService from '../storage/storage.service';
import { STORAGE_KEYS } from './sync.constants';
import { getUserId, getCurrentProject } from './sync.session';

export async function syncMasterData() {
  try {
    const current_user = await getUserId();
    await StorageService.setItem(STORAGE_KEYS.CURRENT_USER, current_user);

    const countries = await OdooService.searchRead('res.country', [], ['id', 'name']);
    await StorageService.setItem(STORAGE_KEYS.MASTER_COUNTRIES, countries);

    const states = await OdooService.searchRead('res.country.state', [], ['id', 'name', 'country_id'], 1000);
    await StorageService.setItem(STORAGE_KEYS.MASTER_STATES, states);

    const municipalities = await OdooService.searchRead('res.municipality', [], ['id', 'name', 'province_id']);
    await StorageService.setItem(STORAGE_KEYS.MASTER_MUNICIPALITIES, municipalities);

    const clientTypes = await OdooService.searchRead('client.type', [], ['id', 'name']);
    await StorageService.setItem(STORAGE_KEYS.MASTER_CLIENT_TYPES, clientTypes);

    const tagsMTypes = await OdooService.searchRead('project.task.tags', [], ['id', 'name']);
    await StorageService.setItem(STORAGE_KEYS.MASTER_TASK_TAGS, tagsMTypes);

    const crmStages = await OdooService.call(
      'crm.stage',
      'search_read',
      [[]],
      {
        fields: ['id', 'name', 'sequence', 'fold', 'is_won', 'team_id'],
        context: { lang: 'es_ES' }
      }
    );
    await StorageService.setItem(STORAGE_KEYS.MASTER_CRM_STAGES, crmStages);

    const newProject = await getCurrentProject(); 
    await StorageService.setItem(STORAGE_KEYS.CURRENT_PROJECT, newProject);

    return { projectChanged: false, oldProject: null };

  } catch (error) {
    console.error('Error en syncMasterData', error);
    return { projectChanged: false, oldProject: null };
  }
}

export async function getMasterData(type) {
    try {
      switch (type) {
        case 'countries':
          return await StorageService.getItem(STORAGE_KEYS.MASTER_COUNTRIES) || [];
        case 'states':
          return await StorageService.getItem(STORAGE_KEYS.MASTER_STATES) || [];
        case 'municipalities':
          return await StorageService.getItem(STORAGE_KEYS.MASTER_MUNICIPALITIES) || [];
        case 'client_types':
          return await StorageService.getItem(STORAGE_KEYS.MASTER_CLIENT_TYPES) || [];
        case 'tags':
          return await StorageService.getItem(STORAGE_KEYS.MASTER_TASK_TAGS) || [];
        case 'crm_stages':
          return await StorageService.getItem(STORAGE_KEYS.MASTER_CRM_STAGES) || [];
        case 'current_project':
          return await StorageService.getItem(STORAGE_KEYS.CURRENT_PROJECT) || null;
        case 'user':
          return await StorageService.getItem(STORAGE_KEYS.CURRENT_USER) || null;
        default:
          return null;
      }
    } catch (error) {
      return null;
    }
}

export async function getManagementTags() {
    try {
      const tags = await getMasterData('tags'); 
      console.log('LOS TAGS:', tags);
      return tags;
    } catch (error) {
      return [];
    }
}

export async function getCrmStages() {
    try {
      const stages = await getMasterData('crm_stages');
      return stages.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
    } catch (error) {
      return [];
    }
}
