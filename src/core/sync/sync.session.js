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

        // Obtener el proyecto más reciente cuya fecha de inicio ya haya pasado.
        // Esto evita que un proyecto creado anticipadamente (ej. el día 21 para el
        // mes siguiente) desplace al proyecto del mes en curso.
        const projects = await OdooService.searchRead(
            'project.project',
            [['date_start', '<=', todayStr]],
            ['id', 'display_name', 'date_start'],
            1, 0, 'date_start desc'
        );

        return projects[0] || null;
    } catch (e) {
        console.error('Error obteniendo proyecto actual:', e);
        return null;
    }
}
