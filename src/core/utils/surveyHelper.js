import OdooService from '../api/odoo.service';

/**
 * Construye la URL pública de una encuesta en Odoo
 * 
 * IMPORTANTE: Para que funcione desde apps móviles sin cookies de sesión,
 * SIEMPRE debe existir un user_input con su access_token.
 * 
 * @param {object} survey - Objeto survey con datos
 * @param {object} userInput - Objeto user_input (REQUERIDO)
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

  // ✅ CRÍTICO: Siempre requerir user_input.access_token para apps móviles
  if (!userInput || !userInput.access_token) {
    console.warn('⚠️ No hay user_input.access_token disponible para la encuesta:', survey.id);
    console.warn('   La URL puede no funcionar correctamente desde la app móvil.');
    // Fallback a URL de inicio (puede no funcionar en móvil)
    return `${baseUrl}/survey/start/${survey.access_token}`;
  }

  // ✅ Formato correcto: /survey/{survey_token}/{answer_token}
  const url = `${baseUrl}/survey/${survey.access_token}/${userInput.access_token}`;
  console.log('✅ URL de encuesta construida:', url);
  return url;
}

/**
 * Obtiene la URL de una encuesta de forma segura
 * @param {object} survey - Survey completo con user_input incluido
 * @returns {string|null}
 */
export function getSurveyUrl(survey) {
  if (!survey) return null;
  
  // El survey DEBE tener user_input adjunto
  const userInput = survey.user_input || null;
  
  if (!userInput) {
    console.warn('⚠️ Survey sin user_input:', survey.id);
    return null;
  }
  
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