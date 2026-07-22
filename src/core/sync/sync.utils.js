
const htmlEntityMap = {
  '&ntilde;': 'ñ', '&Ntilde;': 'Ñ',
  '&aacute;': 'á', '&Aacute;': 'Á',
  '&eacute;': 'é', '&Eacute;': 'É',
  '&iacute;': 'í', '&Iacute;': 'Í',
  '&oacute;': 'ó', '&Oacute;': 'Ó',
  '&uacute;': 'ú', '&Uacute;': 'Ú',
  '&uuml;': 'ü', '&Uuml;': 'Ü',
  '&amp;': '&', '&lt;': '<', '&gt;': '>',
  '&quot;': '"', '&#39;': "'", '&nbsp;': ' ',
  '&iexcl;': '¡', '&iquest;': '¿',
  '&ordm;': 'º', '&ordf;': 'ª',
  '&reg;': '®', '&copy;': '©',
  '&deg;': '°', '&micro;': 'µ',
  '&middot;': '·', '&cedil;': '¸',
  '&curren;': '¤', '&pound;': '£',
  '&euro;': '€', '&yen;': '¥',
  '&cent;': '¢', '&sect;': '§',
  '&laquo;': '«', '&raquo;': '»',
  '&plusmn;': '±', '&times;': '×',
  '&divide;': '÷', '&sup2;': '²',
  '&sup3;': '³', '&sup1;': '¹',
  '&frac14;': '¼', '&frac12;': '½',
  '&frac34;': '¾',
};

export function decodeHtmlEntities(text) {
  if (!text || typeof text !== 'string') return text;
  const decoded = text.replace(/&(#\d+|#x[\da-fA-F]+|\w+);/g, (entity) => {
    if (htmlEntityMap[entity]) return htmlEntityMap[entity];
    if (entity.startsWith('&#x') || entity.startsWith('&#X')) {
      const code = parseInt(entity.slice(3, -1), 16);
      return isNaN(code) ? entity : String.fromCharCode(code);
    }
    if (entity.startsWith('&#')) {
      const code = parseInt(entity.slice(2, -1), 10);
      return isNaN(code) ? entity : String.fromCharCode(code);
    }
    return entity;
  });
  return stripHtml(decoded);
}

export function stripHtml(text) {
  if (!text || typeof text !== 'string') return text;
  return text.replace(/<[^>]*>/g, '').trim();
}

export function sanitizeForOdoo(data) {
    const sanitized = {};
    
    Object.keys(data).forEach(key => {
      const value = data[key];
      
      if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'number' && typeof value[1] === 'string') {
        sanitized[key] = value[0];
      } 
      else {
        sanitized[key] = value;
      }
    });
    
    return sanitized;
}

export function decodeSurveyQuestion(question) {
  if (!question) return question;
  return {
    ...question,
    title: decodeHtmlEntities(question.title),
    description: decodeHtmlEntities(question.description),
    constr_error_msg: decodeHtmlEntities(question.constr_error_msg),
    scale_min_label: decodeHtmlEntities(question.scale_min_label),
    scale_mid_label: decodeHtmlEntities(question.scale_mid_label),
    scale_max_label: decodeHtmlEntities(question.scale_max_label),
    suggested_answer_ids: (question.suggested_answer_ids || []).map(a => {
      if (Array.isArray(a)) return [a[0], decodeHtmlEntities(a[1])];
      return { ...a, value: decodeHtmlEntities(a.value) };
    }),
    matrix_row_ids: (question.matrix_row_ids || []).map(a => {
      if (Array.isArray(a)) return [a[0], decodeHtmlEntities(a[1])];
      return { ...a, value: decodeHtmlEntities(a.value) };
    }),
  };
}
