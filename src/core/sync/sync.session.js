import OdooService from '../api/odoo.service';
import StorageService from '../storage/storage.service';
import { STORAGE_KEYS } from './sync.constants';

export async function getCurrentUser() {
  try {
    const user = await StorageService.getItem(STORAGE_KEYS.CURRENT_USER);
    return user || [];
  } catch (error) {
    console.error('❌ Error obteniendo user:', error);
    return [];
  }
}

export async function getUserId(){
    const uid = await StorageService.getAuthData();
    const current_partner = await OdooService.searchRead(
        'res.users', 
        [['id', '=', uid.uid]], 
        ['partner_id'],
    );
    return current_partner;
}

export async function getCurrentProject(){
    try {
        const today = new Date();
        const y = today.getFullYear();
        const m = String(today.getMonth() + 1).padStart(2, '0');
        const d = String(today.getDate()).padStart(2, '0');
        const todayStr = `${y}-${m}-${d}`;

        // Proyecto activo: fecha_inicio <= hoy Y (fecha_fin >= hoy O fecha_fin es null/vacía)
        const projects = await OdooService.searchRead(
            'project.project',
            // ✅ Dominio corregido para Odoo
            ['&', 
             ['date_start', '<=', todayStr], 
             '|', 
             ['date', '>=', todayStr], 
             ['date', '=', false]
            ],
            ['id', 'display_name', 'date_start', 'date'],
            1, 0, 'date_start desc'
        );

        return projects[0] || null;
    } catch (e) {
        console.error('Error obteniendo proyecto actual:', e);
        return null;
    }
}