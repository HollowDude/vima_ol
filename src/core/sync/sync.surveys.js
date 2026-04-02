import OdooService from '../api/odoo.service';
import StorageService from '../storage/storage.service';
import { STORAGE_KEYS } from './sync.constants';
import { addPendingChange } from './sync.pending';

export async function syncSurveys() {
  try {
    
    const tasks = await StorageService.getItem(STORAGE_KEYS.TASKS) || [];
    
    const relationIds = [];
    tasks.forEach(t => {
      if (t.task_survey_ids && Array.isArray(t.task_survey_ids) && t.task_survey_ids.length > 0) {
        relationIds.push(...t.task_survey_ids);
      }
    });

    if (relationIds.length === 0) {
      await StorageService.setItem(STORAGE_KEYS.SURVEYS, []);
      await StorageService.setItem(STORAGE_KEYS.SURVEY_RELS, []);
      await StorageService.setItem(STORAGE_KEYS.SURVEY_QUESTIONS, []);
      await StorageService.setItem(STORAGE_KEYS.SURVEY_ANSWERS, []);
      return;
    }

    const relations = await OdooService.searchRead(
      'project.task.survey.rel',
      [['id', 'in', relationIds]],
      ['id', 'task_id', 'survey_id', 'survey_user_input_id', 'public_url']
    );

    await StorageService.setItem(STORAGE_KEYS.SURVEY_RELS, relations);

    const surveyIds = relations
      .map(r => Array.isArray(r.survey_id) ? r.survey_id[0] : r.survey_id)
      .filter((id, idx, arr) => id && arr.indexOf(id) === idx);

    if (surveyIds.length === 0) {
      return;
    }

    const surveys = await OdooService.searchRead(
      'survey.survey',
      [['id', 'in', surveyIds]],
      ['id', 'title', 'description', 'description_done', 'question_ids']
    );

    const questionIds = [];
    surveys.forEach(survey => {
      if (survey.question_ids && survey.question_ids.length > 0) {
        questionIds.push(...survey.question_ids);
      }
    });

    if (questionIds.length === 0) {
      await StorageService.setItem(STORAGE_KEYS.SURVEYS, surveys);
      await StorageService.setItem(STORAGE_KEYS.SURVEY_QUESTIONS, []);
      await StorageService.setItem(STORAGE_KEYS.SURVEY_ANSWERS, []);
      return;
    }

    const questions = await OdooService.searchRead(
      'survey.question',
      [['id', 'in', questionIds]],
      [
        'id', 'question_type', 'title', 'description', 'sequence',
        'matrix_row_ids', 'suggested_answer_ids', 
        'constr_mandatory', 'constr_error_msg',
        'scale_min', 'scale_max', 
        'scale_min_label', 'scale_mid_label', 'scale_max_label'
      ]
    );

    const allAnswerIds = [];
    questions.forEach(question => {
      if (question.suggested_answer_ids && question.suggested_answer_ids.length > 0) {
        allAnswerIds.push(...question.suggested_answer_ids);
      }
      if (question.matrix_row_ids && question.matrix_row_ids.length > 0) {
        allAnswerIds.push(...question.matrix_row_ids);
      }
    });

    const uniqueAnswerIds = [...new Set(allAnswerIds)];
    let allAnswers = [];
    
    if (uniqueAnswerIds.length > 0) {
      allAnswers = await OdooService.searchRead(
        'survey.question.answer',
        [['id', 'in', uniqueAnswerIds]],
        ['id', 'value', 'question_id', 'sequence']
      );
    }

    const enrichedQuestions = questions.map(q => {
      const suggestedAnswers = (q.suggested_answer_ids || [])
        .map(id => allAnswers.find(a => a.id === id))
        .filter(Boolean);

      const matrixRows = (q.matrix_row_ids || [])
        .map(id => allAnswers.find(a => a.id === id))
        .filter(Boolean);

      return { 
        ...q, 
        suggested_answer_ids: suggestedAnswers.map(a => [a.id, a.value]),
        matrix_row_ids: matrixRows.map(a => [a.id, a.value])
      };
    });

    await StorageService.setItem(STORAGE_KEYS.SURVEYS, surveys);
    await StorageService.setItem(STORAGE_KEYS.SURVEY_QUESTIONS, enrichedQuestions);
    await StorageService.setItem(STORAGE_KEYS.SURVEY_ANSWERS, allAnswers);

    } catch (error) {
    console.error(' Error sincronizando encuestas:', error);
    throw error;
  }
}

export async function getSurveyById(id) {
  const surveys = await StorageService.getItem(STORAGE_KEYS.SURVEYS) || [];
  return surveys.find(s => s.id === id) || null;
}

export async function getSurveysForTask(taskId) {
  try {
    const relations = await StorageService.getItem(STORAGE_KEYS.SURVEY_RELS) || [];
    const surveys = await StorageService.getItem(STORAGE_KEYS.SURVEYS) || [];
    
    const taskRelations = relations.filter(r => {
      const rTaskId = Array.isArray(r.task_id) ? r.task_id[0] : r.task_id;
      return rTaskId === taskId;
    });

    return taskRelations.map(rel => {
      const surveyId = Array.isArray(rel.survey_id) ? rel.survey_id[0] : rel.survey_id;
      const surveyData = surveys.find(s => s.id === surveyId);
      
      if (!surveyData) {
        return null;
      }

      return {
        ...surveyData,
        relation_id: rel.id,
        survey_user_input_id: Array.isArray(rel.survey_user_input_id) 
          ? rel.survey_user_input_id[0] 
          : rel.survey_user_input_id
      };
    }).filter(Boolean);
  } catch (error) {
    console.error('❌ Error obteniendo encuestas de tarea:', error);
    return [];
  }
}

export async function getSurveyQuestions(surveyId) {
  try {
    const allSurveys = await StorageService.getItem(STORAGE_KEYS.SURVEYS) || [];
    const survey = allSurveys.find(s => s.id === surveyId);

    if (!survey || !survey.question_ids) {
      return [];
    }

    const questionIds = survey.question_ids.map(q => Array.isArray(q) ? q[0] : q);
    const allQuestions = await StorageService.getItem(STORAGE_KEYS.SURVEY_QUESTIONS) || [];
    
    const questions = allQuestions
      .filter(q => questionIds.includes(q.id))
      .sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

    return questions;
  } catch (error) {
    console.error('❌ Error en getSurveyQuestions:', error);
    return [];
  }
}

export async function getSurveyProgress(taskId, surveyId, relationId = null) {
  try {
    const progress = await StorageService.getItem(STORAGE_KEYS.SURVEY_PROGRESS) || {};
    
    const key = relationId 
      ? `${taskId}_${surveyId}_${relationId}` 
      : `${taskId}_${surveyId}`;
    
    return progress[key] || null;
  } catch (error) {
    console.error('❌ Error obteniendo progreso:', error);
    return null;
  }
}

export async function saveSurveyProgress(taskId, surveyId, answers, inputId, relationId = null) {
  try {
    const progressData = await StorageService.getItem(STORAGE_KEYS.SURVEY_PROGRESS) || {};
    const key = relationId 
      ? `${taskId}_${surveyId}_${relationId}` 
      : `${taskId}_${surveyId}`;
    
    const existingEntry = progressData[key];
    const finalInputId = existingEntry?.id || inputId || -Math.floor(Math.random() * 1000000);

    const input = {
      id: finalInputId,
      survey_id: surveyId,
      relation_id: relationId,
      state: 'in_progress',
      answers,
      taskId,
      lastModified: new Date().toISOString(),
    };

    progressData[key] = input;
    await StorageService.setItem(STORAGE_KEYS.SURVEY_PROGRESS, progressData);

    return progressData[key];
  } catch (error) {
    console.error('❌ Error guardando progreso:', error);
    throw error;
  }
}

export async function completeSurvey(taskId, surveyId, answers, userInputId, relationId = null) {
  try {
    if (!relationId) {
      throw new Error('relationId es requerido para completar la encuesta');
    }

    const progressData = await StorageService.getItem(STORAGE_KEYS.SURVEY_PROGRESS) || {};
    const key = `${taskId}_${surveyId}_${relationId}`;

    const userInput = {
      id: userInputId || -Math.floor(Math.random() * 1000000),
      survey_id: surveyId,
      relation_id: relationId,
      state: 'done',
      answers,
      taskId,
      completed_at: new Date().toISOString(),
    };

    progressData[key] = userInput;
    await StorageService.setItem(STORAGE_KEYS.SURVEY_PROGRESS, progressData);

    await addPendingChange('survey.user_input', userInput.id, {
      _is_survey_completion: true,
      survey_id: surveyId,
      relation_id: relationId,
      taskId,
      answers,
    });

    return userInput;
  } catch (error) {
    console.error('❌ Error completando encuesta:', error);
    throw error;
  }
}

function normalizeAnswerValue(questionType, answer) {
  if (!answer) return null;

  switch (questionType) {
    case 'char_box':
      return answer.value_char_box || '';
    
    case 'text_box':
      return answer.value_text_box || '';
    
    case 'numerical_box':
    case 'scale':
      const numValue = answer.value_numerical_box;
      if (numValue === undefined || numValue === null || numValue === '') {
        return 0;
      }
      return parseFloat(numValue);
    
    case 'date':
      return answer.value_date || null;
    
    case 'datetime':
      return answer.value_datetime || null;
    
    case 'simple_choice':
      return answer.value_suggested || null;
    
    case 'multiple_choice':
      return answer.value_suggested_multiple || [];
    
    default:
      return null;
  }
}

export async function syncSurveyResponses() {
  try {
    const pending = await StorageService.getItem(STORAGE_KEYS.PENDING_CHANGES) || [];
    const surveyCompletions = pending.filter(p => p.updates._is_survey_completion);

    if (surveyCompletions.length === 0) {
      return { success: 0, failed: 0 };
    }

    
    let success = 0;
    let failed = 0;
    const remainingPending = pending.filter(p => !p.updates._is_survey_completion);

    for (const completion of surveyCompletions) {
      try {
        const { _is_survey_completion, taskId, answers, relation_id, survey_id } = completion.updates;

        if (!relation_id) {
          console.error('❌ Falta relation_id en completion:', completion);
          remainingPending.push(completion);
          failed++;
          continue;
        }

        const userInputId = await OdooService.create('survey.user_input', {
          survey_id: survey_id,
          state: 'done',
        });


        const questions = await getSurveyQuestions(survey_id);
        
        for (const question of questions) {
          const answer = answers[question.id];
          if (!answer) continue;

          if (question.question_type === 'multiple_choice') {
            const selectedIds = answer.value_suggested_multiple || [];
            for (const answerId of selectedIds) {
              await OdooService.create('survey.user_input.line', {
                user_input_id: userInputId,
                question_id: question.id,
                answer_type: 'suggestion',
                suggested_answer_id: answerId,
                skipped: false,
              });
            }
            continue;
          }

          if (question.question_type === 'matrix') {
            const matrixAnswers = Object.keys(answer).filter(key => 
              key.startsWith('matrix_') && answer[key] === true
            );

            for (const matrixKey of matrixAnswers) {
              const parts = matrixKey.split('_');
              if (parts.length !== 3) continue;
              
              const rowId = parseInt(parts[1]);
              const colId = parseInt(parts[2]);

              await OdooService.create('survey.user_input.line', {
                user_input_id: userInputId,
                question_id: question.id,
                answer_type: 'suggestion',
                matrix_row_id: rowId,
                suggested_answer_id: colId,
                skipped: false,
              });
            }
            continue;
          }

          const lineData = {
            user_input_id: userInputId,
            question_id: question.id,
            skipped: false,
          };

          switch (question.question_type) {
            case 'char_box':
              lineData.answer_type = 'char_box';
              lineData.value_char_box = normalizeAnswerValue('char_box', answer);
              break;
            
            case 'text_box':
              lineData.answer_type = 'text_box';
              lineData.value_text_box = normalizeAnswerValue('text_box', answer);
              break;
            
            case 'numerical_box':
            case 'scale':
              lineData.answer_type = 'numerical_box';
              lineData.value_numerical_box = normalizeAnswerValue(question.question_type, answer);
              break;
            
            case 'date':
              lineData.answer_type = 'date';
              lineData.value_date = normalizeAnswerValue('date', answer);
              break;
            
            case 'datetime':
              lineData.answer_type = 'datetime';
              lineData.value_datetime = normalizeAnswerValue('datetime', answer);
              break;
            
            case 'simple_choice':
              lineData.answer_type = 'suggestion';
              lineData.suggested_answer_id = normalizeAnswerValue('simple_choice', answer);
              break;
            
            default:
              continue;
          }

          const hasValidValue = 
            lineData.value_char_box !== undefined ||
            lineData.value_text_box !== undefined ||
            lineData.value_numerical_box !== undefined ||
            lineData.value_date !== undefined ||
            lineData.value_datetime !== undefined ||
            lineData.suggested_answer_id !== undefined;

          if (!hasValidValue) {
            continue;
          }

          await OdooService.create('survey.user_input.line', lineData);
        }

        await OdooService.write('project.task.survey.rel', [relation_id], {
          survey_user_input_id: userInputId
        });


        success++;
      } catch (err) {
        console.error('❌ Error sincronizando encuesta:', err);
        remainingPending.push(completion);
        failed++;
      }
    }

    await StorageService.setItem(STORAGE_KEYS.PENDING_CHANGES, remainingPending);

    return { success, failed };
  } catch (error) {
    console.error('❌ Error en syncSurveyResponses:', error);
    return { success: 0, failed: 0 };
  }
}

export default {
  syncSurveys,
  getSurveyById,
  getSurveysForTask,
  getSurveyQuestions,
  getSurveyProgress,
  saveSurveyProgress,
  completeSurvey,
  syncSurveyResponses,
};