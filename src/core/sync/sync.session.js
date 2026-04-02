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
          const allProjects = await OdooService.searchRead(
              'project.project', 
              [], 
              ['id', 'display_name', 'date_start'], 
              100, // Ponemos un límite alto (ej. 100 o 1000) para ver la lista completa
              0, 
              'date_start desc'
          );
          console.log("=== LISTA DE TODOS LOS PROYECTOS ===");
          console.log(allProjects); // console.table facilita mucho la lectura de arrays de objetos
      } catch (e) {
          console.error("Error intentando imprimir todos los proyectos:", e);
      }
    const latestProject = await OdooService.searchRead(
      'project.project', 
      [], 
      ['id', 'display_name', 'date_start'], 
      1, 0, 'date_start desc'
    );

    console.log("EL PROYECTOOOO", latestProject[0]);
    return latestProject[0];
}
