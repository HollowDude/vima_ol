const DEFAULT_COUNTRY = '53'; // +53 por defecto

// Formatea un teléfono local '12345678' -> '1234 5678'
export function formatPhoneForDisplay(raw = '') {
  const digits = (raw || '').toString().replace(/\D/g, '').slice(0, 8);
  if (!digits) return '';
  if (digits.length <= 4) return digits;
  return digits.slice(0, 4) + ' ' + digits.slice(4);
}

// Formatea un móvil al estilo '+CC 1234 5678'
export function formatMobileForDisplay(raw = '') {
  let s = (raw || '').toString().trim();
  if (!s) return '';

  // Si empieza con +, intentamos separar código y subscriber
  if (s.startsWith('+')) {
    // eliminar todo excepto dígitos y +
    const cleaned = '+' + s.slice(1).replace(/\D/g, '');
    // cleaned = +<digits>
    const afterPlus = cleaned.slice(1);
    // intentamos cc de 1 a 3 y subscriber de hasta 8
    for (let ccLen = 1; ccLen <= 3; ccLen++) {
      const cc = afterPlus.slice(0, ccLen);
      const subs = afterPlus.slice(ccLen).slice(0, 8);
      if (subs.length > 0) {
        return '+' + cc + ' ' + (subs.length > 4 ? subs.slice(0, 4) + ' ' + subs.slice(4) : subs);
      }
    }
    // fallback: mostrar lo que haya
    const ccFallback = afterPlus.slice(0, 3);
    const subsFallback = afterPlus.slice(3).slice(0, 8);
    return '+' + (ccFallback || DEFAULT_COUNTRY) + (subsFallback ? ' ' + (subsFallback.length > 4 ? subsFallback.slice(0,4) + ' ' + subsFallback.slice(4) : subsFallback) : '');
  }

  // Si no empieza con +, extraemos dígitos
  const digits = s.replace(/\D/g, '');
  if (digits.length === 0) return '';

  if (digits.length <= 8) {
    const subs = digits.slice(0, 8);
    return '+' + DEFAULT_COUNTRY + ' ' + (subs.length > 4 ? subs.slice(0, 4) + ' ' + subs.slice(4) : subs);
  }

  // más de 8 dígitos: suponemos que lo primero puede ser country
  const subs = digits.slice(-8);
  const cc = digits.slice(0, -8).slice(0, 3) || DEFAULT_COUNTRY;
  return '+' + cc + ' ' + subs.slice(0, 4) + ' ' + subs.slice(4);
}

// Validadores
export function isValidPhoneValue(displayValue = '') {
  const digits = (displayValue || '').toString().replace(/\D/g, '');
  return digits.length === 8;
}

export function isValidMobileValue(displayValue = '') {
  if (!displayValue) return false;
  const cleaned = displayValue.toString().replace(/\s/g, '');
  // Si comienza con +, debe tener entre 1 y 3 dígitos de CC y luego 8 dígitos subscriber => afterPlus length 9..11
  if (cleaned.startsWith('+')) {
    const afterPlus = cleaned.slice(1).replace(/\D/g, '');
    return afterPlus.length >= 9 && afterPlus.length <= 11 && /^\+\d{1,3}\d{8}$/.test(cleaned);
  }
  // Si no comienza con +, consideramos válido si tiene exactamente 8 dígitos
  const onlyDigits = (displayValue || '').toString().replace(/\D/g, '');
  return onlyDigits.length === 8;
}

// Email mínimo: exige un @ y texto antes/después
export function isValidEmailValue(value = '') {
  if (!value) return false;
  const v = value.toString().trim();
  // mínima: caracteres sin espacios antes y después del @
  return /^[^\s@]+@[^\s@]+$/.test(v);
}

// Normalizadores para enviar al back: phone -> '12345678', mobile -> '+5312345678'
export function normalizePhoneForPayload(displayValue = '') {
  return (displayValue || '').toString().replace(/\D/g, '').slice(0, 8);
}

export function normalizeMobileForPayload(displayValue = '') {
  if (!displayValue) return '';
  const cleaned = displayValue.toString().replace(/\s/g, '');
  if (cleaned.startsWith('+')) {
    // quitar todo excepto + y dígitos
    const plus = '+';
    const digits = cleaned.slice(1).replace(/\D/g, '');
    // tomar cc hasta 3 y subs últimos 8
    const subs = digits.slice(-8);
    const cc = digits.slice(0, digits.length - subs.length) || DEFAULT_COUNTRY;
    return plus + cc + subs;
  }
  // si no empieza con + asumimos country default
  const digits = cleaned.replace(/\D/g, '').slice(0, 8);
  return '+' + DEFAULT_COUNTRY + digits;
}

export function isValidPercentage(value) {
  const num = parseFloat(value);
  return !isNaN(num) && num >= 0 && num <= 100;
}

// Valida que sea un número positivo (para Ganancia)
export function isPositiveNumber(value) {
  const num = parseFloat(value);
  return !isNaN(num) && num >= 0;
}

// Elimina etiquetas HTML y normaliza espacios
export function cleanHtmlAndNormalize(text = '') {
  if (!text) return '';
  return text
    .replace(/<[^>]*>?/gm, '') // Elimina etiquetas HTML
    .replace(/&nbsp;/g, ' ')    // Reemplaza espacios de HTML
    .replace(/\s+/g, ' ')      // Normaliza múltiples espacios a uno solo
    .trim();                   // Quita espacios al inicio y final
}

export default {
  DEFAULT_COUNTRY,
  isValidPercentage,
  isPositiveNumber,
  cleanHtmlAndNormalize,
  formatPhoneForDisplay,
  formatMobileForDisplay,
  isValidPhoneValue,
  isValidMobileValue,
  isValidEmailValue,
  normalizePhoneForPayload,
  normalizeMobileForPayload,
};
