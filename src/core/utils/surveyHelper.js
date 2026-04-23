import OdooService from '../api/odoo.service';

/**
 * Construye la URL pública de una encuesta en Odoo
 * 
 * Patrones soportados:
 * 1. Encuesta sin responder: /survey/start/{survey_access_token}
 * 2. Encuesta con respuesta: /survey/{survey_access_token}/{user_input_access_token}
 * 
 * @param {object} survey - Objeto survey con datos
 * @param {object} userInput - Objeto user_input si existe (opcional)
 * @returns {string|null} - URL completa o null
 */
export function buildSurveyPublicUrl(survey, userInput = null) {
  if (!survey) {
    console.warn('⚠️ Survey no proporcionado');
    return null;
  }

  const baseUrl = OdooService.url || 'http://localhost:8069';
  
  // Validar que el survey tenga access_token
  if (!survey.access_token) {
    console.warn('⚠️ Survey sin access_token:', survey.id);
    return null;
  }

  // Caso 1: Si existe user_input con su token (encuesta ya respondida)
  if (userInput && userInput.access_token) {
    const url = `${baseUrl}/survey/${survey.access_token}/${userInput.access_token}`;
    console.log('✅ URL de encuesta respondida:', url);
    return url;
  }

  // Caso 2: Encuesta sin responder
  const url = `${baseUrl}/survey/start/${survey.access_token}`;
  console.log('✅ URL de encuesta nueva:', url);
  return url;
}

/**
 * Obtiene la URL de una encuesta de forma segura
 * @param {object} survey - Survey completo con user_input incluido
 * @returns {string|null}
 */
export function getSurveyUrl(survey) {
  if (!survey) return null;
  
  // El survey puede tener user_input adjunto
  const userInput = survey.user_input || null;
  
  return buildSurveyPublicUrl(survey, userInput);
}

/**
 * Verifica si una encuesta tiene una respuesta iniciada
 */
export function hasSurveyResponse(survey) {
  return !!(survey.user_input && survey.user_input.id);
}

/**
 * Verifica si una encuesta está completada
 */
export function isSurveyCompleted(survey) {
  if (!survey.user_input) return false;
  return survey.user_input.state === 'done';
}

export default {
  buildSurveyPublicUrl,
  getSurveyUrl,
  hasSurveyResponse,
  isSurveyCompleted,
};