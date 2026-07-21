import OdooService from '../api/odoo.service';
import StorageService from '../storage/storage.service';
import { STORAGE_KEYS } from './sync.constants';
import { sanitizeForOdoo } from './sync.utils';

export async function addPendingChange(model, recordId, updates) {
  try {
    if (typeof model !== 'string') {
      console.error('❌ INTENTO DE GUARDAR MODELO INVÁLIDO:', model);
      throw new Error('El modelo debe ser un string (ej: "project.task")');
    }

    const pending = await StorageService.getItem(STORAGE_KEYS.PENDING_CHANGES) || [];
    const existingIndex = pending.findIndex(
      p => p.model === model && p.recordId === recordId
    );

    if (existingIndex >= 0) {
      pending[existingIndex].updates = { ...pending[existingIndex].updates, ...updates };
      pending[existingIndex].timestamp = new Date().toISOString();
    } else {
      pending.push({ model, recordId, updates, timestamp: new Date().toISOString() });
    }

    await StorageService.setItem(STORAGE_KEYS.PENDING_CHANGES, pending);
  } catch (error) {
    console.error(' Error agregando cambio pendiente:', error);
    throw error;
  }
}

export async function createReasonWizard(model, wizardData = {}) {
  try {
    if (typeof model !== 'string') {
      console.error(" Error: createReasonWizard recibió un objeto en lugar de un nombre de modelo.", model);
      throw new Error(`createReasonWizard: 'model' debe ser un string. Recibido: ${typeof model}`);
    }

    const tempId = -Math.floor(Math.random() * 1000000);
    const updates = { ...wizardData, _is_wizard: true };
    
    await addPendingChange(model, tempId, updates);
    return tempId;
  } catch (error) {
    console.error(' Error creando wizard de razón localmente:', error);
    throw error;
  }
}

export async function syncPendingChangesNonSurvey() {
  try {
    const pending = await StorageService.getItem(STORAGE_KEYS.PENDING_CHANGES) || [];
    if (pending.length === 0) return { success: 0, failed: 0, byModel: {} };

    
    const allQuestions = await StorageService.getItem(STORAGE_KEYS.SURVEY_QUESTIONS) || [];

    let success = 0;
    let failed = 0;
    const byModel = {};
    function bump(model, key) {
      byModel[model] = byModel[model] || { created: 0, updated: 0, deleted: 0, failed: 0 };
      byModel[model][key]++;
    }
    const remainingPending = [];
    
    const taskIdMapping = {};

    //  ORDEN DE PROCESAMIENTO :
    // 1. Crear tareas
    // 2. Completar encuestas (necesitan task_id )
    // 3. Completar tareas (necesitan encuestas completadas)
    // 4. Otros cambios
    // Ni una NC mas Maurice

    for (const change of pending) {
      try {
        if (typeof change.model !== 'string') {
          continue;
        }

        if (change.model === 'project.task' && change.updates._is_creation) {
          const tempId = change.recordId;
          const creationData = { ...change.updates };
          delete creationData._is_creation;
          const sanitized = sanitizeForOdoo(creationData);
          
          const realId = await OdooService.create(change.model, sanitized);
          
          taskIdMapping[tempId] = realId;
          
          success++;
          bump(change.model, 'created');
        }
      } catch (err) {
        if (typeof change.model === 'string' && change.model === 'project.task' && change.updates._is_creation) {
          remainingPending.push(change);
        }
        failed++;
        bump(change.model, 'failed');
      }
    }

    for (const change of pending) {
      try {
        if (typeof change.model !== 'string') continue;
        
        if (change.model === 'project.task' && change.updates._is_creation) {
          continue;
        }

        if (change.updates._is_survey_completion) {
          console.log(`📝 Procesando encuesta pendiente (Local ID: ${change.recordId})`);
          
          const { survey_id, relation_id, answers } = change.updates;

          if (!relation_id || !survey_id) {
            throw new Error('Faltan datos críticos (relation_id o survey_id) en la encuesta pendiente');
          }

          const realUserInputId = await OdooService.create('survey.user_input', {
            survey_id: survey_id,
            state: 'done',
          });


          const answerQuestionIds = Object.keys(answers).map(k => parseInt(k));
          const relevantQuestions = allQuestions.filter(q => answerQuestionIds.includes(q.id));

          for (const question of relevantQuestions) {
            const answerData = answers[question.id];
            if (!answerData) continue;

            if (question.question_type === 'multiple_choice') {
              const selectedIds = answerData.value_suggested_multiple || [];
              for (const valId of selectedIds) {
                await OdooService.create('survey.user_input.line', {
                  user_input_id: realUserInputId,
                  question_id: question.id,
                  answer_type: 'suggestion',
                  suggested_answer_id: valId, 
                  skipped: false
                });
              }
              continue; 
            }

            if (question.question_type === 'matrix') {
               const matrixKeys = Object.keys(answerData).filter(k => k.startsWith('matrix_') && answerData[k] === true);
               for (const mKey of matrixKeys) {
                 const parts = mKey.split('_');
                 if (parts.length === 3) {
                   await OdooService.create('survey.user_input.line', {
                     user_input_id: realUserInputId,
                     question_id: question.id,
                     answer_type: 'suggestion',
                     matrix_row_id: parseInt(parts[1]),
                     suggested_answer_id: parseInt(parts[2]),
                     skipped: false
                   });
                 }
               }
               continue;
            }

            const linePayload = {
              user_input_id: realUserInputId,
              question_id: question.id,
              skipped: false
            };

            switch (question.question_type) {
              case 'char_box':
                linePayload.answer_type = 'char_box';
                linePayload.value_char_box = answerData.value_char_box;
                break;
              case 'text_box':
                linePayload.answer_type = 'text_box';
                linePayload.value_text_box = answerData.value_text_box;
                break;
              case 'numerical_box':
              case 'scale':
                linePayload.answer_type = 'numerical_box';
                //  Usar value_numerical_box y validar
                const numValue = answerData.value_numerical_box;
                if (numValue === undefined || numValue === null || numValue === '') {
                  linePayload.value_numerical_box = 0;
                } else {
                  linePayload.value_numerical_box = parseFloat(numValue);
                }
                break;
              case 'date':
                linePayload.answer_type = 'date';
                linePayload.value_date = answerData.value_date;
                break;
              case 'datetime':
                linePayload.answer_type = 'datetime';
                linePayload.value_datetime = answerData.value_datetime;
                break;
              case 'simple_choice':
                linePayload.answer_type = 'suggestion';
                linePayload.suggested_answer_id = answerData.value_suggested;
                break;
              default:
                console.warn(`Tipo no manejado: ${question.question_type}, se omite.`);
                continue; 
            }
            
            await OdooService.create('survey.user_input.line', linePayload);
          }

          if (relation_id) {
             await OdooService.write('project.task.survey.rel', [relation_id], {
               survey_user_input_id: realUserInputId
             });
          }

          success++;
          bump(change.model, 'updated');
          continue; 
        }
      } catch (err) {
        console.error(`❌ Error procesando encuesta:`, err);
        if (typeof change.model === 'string') {
          remainingPending.push(change);
        }
        failed++;
        bump(change.model, 'failed');
      }
    }

    for (const change of pending) {
      try {
        if (typeof change.model !== 'string') continue;
        
        // Skip ya procesados
        if ((change.model === 'project.task' && change.updates._is_creation) || 
            change.updates._is_survey_completion) {
          continue;
        }

        //  Completar tarea (debe ir DESPUÉS de encuestas)
        if (change.updates._is_task_completion) {
          const taskUpdates = { state: change.updates.state };
          await OdooService.write(change.model, [change.recordId], taskUpdates);
          console.log(`✅ Tarea completada: ${change.model} #${change.recordId}`);
          success++;
          bump(change.model, 'updated');
          continue;
        }
      } catch (err) {
        console.error(`❌ Error completando tarea:`, err);
        if (typeof change.model === 'string') {
          remainingPending.push(change);
        }
        failed++;
        bump(change.model, 'failed');
      }
    }

    for (const change of pending) {
      try {
        if (typeof change.model !== 'string') continue;
        
        // Skip ya procesados
        if ((change.model === 'project.task' && change.updates._is_creation) ||
            change.updates._is_survey_completion ||
            change.updates._is_task_completion) {
          continue;
        }

        // Cambio de etapa CRM
        if (change.model === 'crm.lead' && change.updates._is_stage_change) {
          console.log(`  cambio de etapa CRM Lead #${change.recordId}`);
          
          const stagePayload = {
            stage_id: change.updates.stage_id
          };

          await OdooService.call(
            'crm.lead',
            'web_save',
            [[change.recordId], stagePayload],
            {
              context: { 
                lang: 'es_ES',
                default_type: 'opportunity'
              },
              specification: {}
            }
          );

          success++;
          bump(change.model, 'updated');
          continue;
        }

        // Eliminaciones
        if (change.updates._is_deletion) {
          console.log(` Eliminando ${change.model} #${change.recordId}...`);
          await OdooService.unlink(change.model, [Number(change.recordId)]);
          console.log(` Registro eliminado en Odoo: ${change.model} #${change.recordId}`);
          success++;
          bump(change.model, 'deleted');
          continue;
        }

        // Actualización normal de CRM Lead
        if (change.model === 'crm.lead' && !change.updates._is_stage_change && !change.updates._is_creation && !change.updates._is_deletion) {
          
          const updateData = { ...change.updates };
          
          delete updateData._is_stage_change;
          delete updateData._is_deletion;
          delete updateData._is_creation;
          
          if (updateData.task_ids && Array.isArray(updateData.task_ids)) {
            updateData.task_ids = updateData.task_ids.map(cmd => {
              if (Array.isArray(cmd) && cmd[0] === 4 && cmd[1] < 0) {
                const tempTaskId = cmd[1];
                const realTaskId = taskIdMapping[tempTaskId];
                
                if (realTaskId) {
                  return [4, realTaskId];
                } else {
                  return null;
                }
              }
              return cmd;
            }).filter(Boolean);
          }
          
          const sanitized = sanitizeForOdoo(updateData);
          await OdooService.write('crm.lead', [change.recordId], sanitized);
          
          success++;
          bump(change.model, 'updated');
          continue;
        }

        // Creaciones (no tareas)
        if (change.updates._is_creation) {
          const tempId = change.recordId;
          const creationData = { ...change.updates };
          
          delete creationData._is_creation;
          delete creationData._is_deletion;
          delete creationData._is_stage_change;
          
          if (change.model === 'crm.lead' && creationData.task_ids && Array.isArray(creationData.task_ids)) {
            creationData.task_ids = creationData.task_ids.map(cmd => {
              if (Array.isArray(cmd) && cmd[0] === 6 && Array.isArray(cmd[2])) {
                const mappedIds = cmd[2].map(id => {
                  if (id < 0 && taskIdMapping[id]) {
                    return taskIdMapping[id];
                  }
                  return id;
                }).filter(id => id > 0);
                return [6, 0, mappedIds];
              }
              return cmd;
            });
          }
          
          const sanitized = sanitizeForOdoo(creationData);
          const realId = await OdooService.create(change.model, sanitized);
          success++;
          bump(change.model, 'created');
          continue;
        }

        if (change.updates._is_wizard) {
          const { _is_wizard, ...wizardData } = change.updates;
          const sanitizedWizard = sanitizeForOdoo(wizardData);
          
          if (typeof change.model !== 'string') {
             throw new Error("Modelo inválido en wizard");
          }

          await OdooService.create(change.model, sanitizedWizard);
          success++;
          bump(change.model, 'created');
          continue;
        }

        const updateData = { ...change.updates };
        
        delete updateData._is_stage_change;
        delete updateData._is_deletion;
        delete updateData._is_creation;
        delete updateData._is_task_completion;
        delete updateData._is_wizard;
        delete updateData._is_survey_completion;
        
        const sanitized = sanitizeForOdoo(updateData);
        await OdooService.write(change.model, [change.recordId], sanitized);
        success++;
        bump(change.model, 'updated');

      } catch (err) {
        console.error(`❌ Error procesando pendiente (${JSON.stringify(change.model)}):`, err);
        if (typeof change.model === 'string') {
          remainingPending.push(change);
        }
        failed++;
        bump(change.model, 'failed');
      }
    }

    await StorageService.setItem(STORAGE_KEYS.PENDING_CHANGES, remainingPending);
    
    // Actualizar IDs temporales en storage local
    if (Object.keys(taskIdMapping).length > 0) {
      try {
        const tasks = await StorageService.getItem(STORAGE_KEYS.TASKS) || [];
        const leads = await StorageService.getItem(STORAGE_KEYS.LEADS) || [];
        
        const updatedTasks = tasks.map(task => {
          if (task.id < 0 && taskIdMapping[task.id]) {
            return { ...task, id: taskIdMapping[task.id] };
          }
          return task;
        });
        
        const updatedLeads = leads.map(lead => {
          if (lead.task_ids && lead.task_ids.length > 0) {
            const updatedTaskIds = lead.task_ids.map(id => {
              if (id < 0 && taskIdMapping[id]) {
                return taskIdMapping[id];
              }
              return id;
            });
            return { ...lead, task_ids: updatedTaskIds };
          }
          return lead;
        });
        
        await StorageService.setItem(STORAGE_KEYS.TASKS, updatedTasks);
        await StorageService.setItem(STORAGE_KEYS.LEADS, updatedLeads);
        
      } catch (err) {
        console.warn('⚠️ Error actualizando IDs locales:', err);
      }
    }
    
    return { success, failed, byModel };
  } catch (error) {
    console.error('❌ Error general en syncPendingChanges:', error);
    return { success: 0, failed: 0, byModel: {} };
  }
}

export default {
  addPendingChange,
  createReasonWizard,
  syncPendingChangesNonSurvey,
};