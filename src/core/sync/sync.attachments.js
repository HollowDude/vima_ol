import OdooService from '../api/odoo.service';
import StorageService from '../storage/storage.service';
import { STORAGE_KEYS } from './sync.constants';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * Módulo de gestión de adjuntos (ir.attachment)
 * Maneja descarga, almacenamiento local y subida de archivos
 */

const ATTACHMENTS_DIR = `${FileSystem.documentDirectory}attachments/`;

/**
 * Asegura que el directorio de adjuntos existe
 */
async function ensureAttachmentsDir() {
  const dirInfo = await FileSystem.getInfoAsync(ATTACHMENTS_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(ATTACHMENTS_DIR, { intermediates: true });
    console.log(' Directori creado');
  }
}

/**
 * Descarga todos los adjuntos de las tareas actuales
 */
export async function syncAttachments() {
  try {
    
    await ensureAttachmentsDir();
    
    const tasks = await StorageService.getItem(STORAGE_KEYS.TASKS) || [];
    const taskIds = tasks.map(t => t.id).filter(id => id > 0);
    
    if (taskIds.length === 0) {
      await StorageService.setItem(STORAGE_KEYS.ATTACHMENTS, []);
      return [];
    }

    const attachments = await OdooService.searchRead(
      'ir.attachment',
      [
        ['res_model', '=', 'project.task'],
        ['res_id', 'in', taskIds]
      ],
      [
        'id', 'name', 'mimetype', 'file_size', 
        'res_id', 'res_model', 'create_date', 
        'write_date', 'type', 'description'
      ],
      1000
    );

    console.log(`✅ ${attachments.length} adjuntos encontrados`);
    
    const enrichedAttachments = await Promise.all(
      attachments.map(async (att) => {
        const localPath = `${ATTACHMENTS_DIR}${att.id}_${att.name}`;
        const fileInfo = await FileSystem.getInfoAsync(localPath);
        
        return {
          ...att,
          _local_path: fileInfo.exists ? localPath : null,
          _is_downloaded: fileInfo.exists,
        };
      })
    );
    
    await StorageService.setItem(STORAGE_KEYS.ATTACHMENTS, enrichedAttachments);
    
    return enrichedAttachments;
  } catch (error) {
    console.error('❌ Error sincronizando adjuntos:', error);
    throw error;
  }
}

/**
 * Obtiene adjuntos de una tarea específica
 */
export async function getTaskAttachments(taskId) {
  try {
    const allAttachments = await StorageService.getItem(STORAGE_KEYS.ATTACHMENTS) || [];
    return allAttachments.filter(a => a.res_id === taskId);
  } catch (error) {
    console.error('❌ Error obteniendo adjuntos de tarea:', error);
    return [];
  }
}

/**
 * Descarga el contenido de un adjunto específico
 */
export async function downloadAttachment(attachmentId) {
  try {
    
    await ensureAttachmentsDir();
    
    const allAttachments = await StorageService.getItem(STORAGE_KEYS.ATTACHMENTS) || [];
    const attachment = allAttachments.find(a => a.id === attachmentId);
    
    if (!attachment) {
      throw new Error('Adjunto no encontrado');
    }

    // Obtener contenido desde Odoo
    const fullAttachment = await OdooService.read(
      'ir.attachment',
      [attachmentId],
      ['datas', 'name', 'mimetype']
    );

    if (!fullAttachment || fullAttachment.length === 0 || !fullAttachment[0].datas) {
      throw new Error('No se pudo obtener el contenido del archivo');
    }

    const base64Data = fullAttachment[0].datas;
    const localPath = `${ATTACHMENTS_DIR}${attachmentId}_${attachment.name}`;

    await FileSystem.writeAsStringAsync(localPath, base64Data, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Actualizar metadata
    const updatedAttachments = allAttachments.map(a => {
      if (a.id === attachmentId) {
        return {
          ...a,
          _local_path: localPath,
          _is_downloaded: true,
        };
      }
      return a;
    });

    await StorageService.setItem(STORAGE_KEYS.ATTACHMENTS, updatedAttachments);

    return localPath;
  } catch (error) {
    throw error;
  }
}

/**
 * Sube un nuevo adjunto a una tarea (se guarda localmente y se sincroniza después)
 */
export async function uploadAttachment(taskId, fileUri, fileName, mimeType) {
  try {
    
    await ensureAttachmentsDir();
    
    const tempId = -Math.floor(Math.random() * 1000000);
    
    // Leer archivo como base64
    const base64Data = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Obtener tamaño del archivo
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    const fileSize = fileInfo.size || 0;

    // Guardar localmente
    const localPath = `${ATTACHMENTS_DIR}${tempId}_${fileName}`;
    await FileSystem.copyAsync({
      from: fileUri,
      to: localPath,
    });

    // Crear metadata del adjunto
    const attachment = {
      id: tempId,
      name: fileName,
      mimetype: mimeType,
      file_size: fileSize,
      res_model: 'project.task',
      res_id: taskId,
      type: 'binary',
      create_date: new Date().toISOString(),
      write_date: new Date().toISOString(),
      _local_path: localPath,
      _is_downloaded: true,
      _is_local: true,
      _base64_data: base64Data, 
    };

    // Agregar a la lista local
    const allAttachments = await StorageService.getItem(STORAGE_KEYS.ATTACHMENTS) || [];
    allAttachments.push(attachment);
    await StorageService.setItem(STORAGE_KEYS.ATTACHMENTS, allAttachments);

    // Agregar a pending changes
    const pending = await StorageService.getItem(STORAGE_KEYS.PENDING_CHANGES) || [];
    pending.push({
      model: 'ir.attachment',
      recordId: tempId,
      updates: {
        name: fileName,
        datas: base64Data,
        mimetype: mimeType,
        res_model: 'project.task',
        res_id: taskId,
        type: 'binary',
        _is_creation: true,
      },
      timestamp: new Date().toISOString(),
    });
    await StorageService.setItem(STORAGE_KEYS.PENDING_CHANGES, pending);

    return attachment;
  } catch (error) {
    throw error;
  }
}

/**
 * Elimina un adjunto localmente (marca para eliminación en servidor)
 */
export async function deleteAttachment(attachmentId) {
  try {
    
    const allAttachments = await StorageService.getItem(STORAGE_KEYS.ATTACHMENTS) || [];
    const attachment = allAttachments.find(a => a.id === attachmentId);
    
    if (!attachment) {
      throw new Error('Adjunto no encontrado');
    }

    if (attachment._local_path) {
      const fileInfo = await FileSystem.getInfoAsync(attachment._local_path);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(attachment._local_path);
      }
    }

    // Remover de la lista
    const updatedAttachments = allAttachments.filter(a => a.id !== attachmentId);
    await StorageService.setItem(STORAGE_KEYS.ATTACHMENTS, updatedAttachments);

    // Si no es local (existe en servidor), agregar a pending
    if (attachmentId > 0) {
      const pending = await StorageService.getItem(STORAGE_KEYS.PENDING_CHANGES) || [];
      pending.push({
        model: 'ir.attachment',
        recordId: attachmentId,
        updates: { _is_deletion: true },
        timestamp: new Date().toISOString(),
      });
      await StorageService.setItem(STORAGE_KEYS.PENDING_CHANGES, pending);
    }

  } catch (error) {
    throw error;
  }
}

/**
 * Limpia el directorio de adjuntos (útil al cerrar sesión)
 */
export async function clearAttachmentsCache() {
  try {
    const dirInfo = await FileSystem.getInfoAsync(ATTACHMENTS_DIR);
    if (dirInfo.exists) {
      await FileSystem.deleteAsync(ATTACHMENTS_DIR, { idempotent: true });
    }
    await StorageService.setItem(STORAGE_KEYS.ATTACHMENTS, []);
  } catch (error) {
  }
}

export default {
  syncAttachments,
  getTaskAttachments,
  downloadAttachment,
  uploadAttachment,
  deleteAttachment,
  clearAttachmentsCache,
};