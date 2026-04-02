import OdooService from '../api/odoo.service';
import StorageService from '../storage/storage.service';
import { STORAGE_KEYS } from './sync.constants';

export async function syncComments() {
  try {
    console.log('🔄 Sincronizando comentarios...');
    
    const tasks = await StorageService.getItem(STORAGE_KEYS.TASKS) || [];
    const taskIds = tasks.map(t => t.id).filter(id => id > 0);
    
    if (taskIds.length === 0) {
      console.log('⚠️ No hay tareas para sincronizar comentarios');
      await StorageService.setItem(STORAGE_KEYS.COMMENTS, []);
      return [];
    }

    const comments = await OdooService.searchRead(
      'mail.message',
      [
        ['model', '=', 'project.task'],
        ['res_id', 'in', taskIds],
        ['message_type', 'in', ['comment', 'email']] 
      ],
      [
        'id', 
        'body', 
        'date', 
        'author_id', 
        'res_id', 
        'model', 
        'message_type',
        'subtype_id'
      ],
      1000,
      0,
      'date desc'
    );

    
    await StorageService.setItem(STORAGE_KEYS.COMMENTS, comments);
    
    return comments;
  } catch (error) {
    throw error;
  }
}

/**
 * Obtiene comentarios de una tarea específica desde storage local
 */
export async function getTaskComments(taskId) {
  try {
    const allComments = await StorageService.getItem(STORAGE_KEYS.COMMENTS) || [];
    
    const taskComments = allComments
      .filter(c => c.res_id === taskId)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    
    return taskComments;
  } catch (error) {
    return [];
  }
}

/**
 * Crea un comentario localmente (se sincronizará después)
 */
export async function createCommentLocally(taskId, commentText) {
  try {
    const tempId = -Math.floor(Math.random() * 1000000);
    
    const currentUser = await StorageService.getAuthData();
    
    const comment = {
      id: tempId,
      body: `<p>${commentText}</p>`,
      date: new Date().toISOString(),
      author_id: [currentUser.uid, currentUser.name || currentUser.username],
      res_id: taskId,
      model: 'project.task',
      message_type: 'comment',
      create_date: new Date().toISOString(),
      write_date: new Date().toISOString(),
      _is_local: true,
    };

    const allComments = await StorageService.getItem(STORAGE_KEYS.COMMENTS) || [];
    allComments.unshift(comment);
    await StorageService.setItem(STORAGE_KEYS.COMMENTS, allComments);

    const pending = await StorageService.getItem(STORAGE_KEYS.PENDING_CHANGES) || [];
    pending.push({
      model: 'mail.message',
      recordId: tempId,
      updates: {
        body: commentText,
        res_id: taskId,
        model: 'project.task',
        message_type: 'comment',
        _is_creation: true
      },
      timestamp: new Date().toISOString()
    });
    await StorageService.setItem(STORAGE_KEYS.PENDING_CHANGES, pending);

    return comment;
  } catch (error) {
    throw error;
  }
}


export default {
  syncComments,
  getTaskComments,
  createCommentLocally,
};