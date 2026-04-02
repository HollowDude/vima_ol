/**
 * Helper para formatear moneda dinámicamente
 * 
 * El modelo crm.lead tiene un campo company_currency que es un many2one con res.currency
 * Cuando se hace searchRead, este campo viene como un array [id, 'symbol'] o como string 'USD'
 * 
 * Ejemplos de valores que puede tener company_currency:
 * - [1, 'USD']
 * - 'USD'
 * - [2, 'EUR']
 * - null/undefined
 */

/**
 * Formatea un valor numérico con la moneda del lead
 * @param {number} value - Valor a formatear
 * @param {array|string|null} companyCurrency - Campo company_currency del lead
 * @param {string} locale - Locale para el formato (default: 'es-ES')
 * @returns {string} - Valor formateado con símbolo de moneda
 */
export function formatCurrency(value, companyCurrency, locale = 'es-ES') {
  // Extraer el código de moneda
  let currencyCode = 'USD'; // Default
  
  if (companyCurrency) {
    if (Array.isArray(companyCurrency)) {
      // Formato [id, 'USD'] - tomar el segundo elemento
      currencyCode = companyCurrency[1] || 'USD';
    } else if (typeof companyCurrency === 'string') {
      // Formato directo 'USD'
      currencyCode = companyCurrency;
    }
  }

  // Formatear el valor
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value || 0);
  } catch (error) {
    // Si falla el formato (currency inválida), usar formato simple
    console.warn(`Error formateando moneda ${currencyCode}:`, error);
    return `${currencyCode} ${(value || 0).toFixed(2)}`;
  }
}

/**
 * Obtiene solo el código de la moneda
 * @param {array|string|null} companyCurrency - Campo company_currency del lead
 * @returns {string} - Código de moneda (ej: 'USD', 'EUR')
 */
export function getCurrencyCode(companyCurrency) {
  if (!companyCurrency) return 'USD';
  
  if (Array.isArray(companyCurrency)) {
    return companyCurrency[1] || 'USD';
  }
  
  if (typeof companyCurrency === 'string') {
    return companyCurrency;
  }
  
  return 'USD';
}

/**
 * Obtiene el símbolo de la moneda
 * @param {array|string|null} companyCurrency - Campo company_currency del lead
 * @param {string} locale - Locale para el formato (default: 'es-ES')
 * @returns {string} - Símbolo de moneda (ej: '$', '€')
 */
export function getCurrencySymbol(companyCurrency, locale = 'es-ES') {
  const currencyCode = getCurrencyCode(companyCurrency);
  
  try {
    const formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
    });
    
    // Extraer solo el símbolo
    const parts = formatter.formatToParts(0);
    const symbolPart = parts.find(part => part.type === 'currency');
    return symbolPart ? symbolPart.value : currencyCode;
  } catch (error) {
    return currencyCode;
  }
}

export default {
  formatCurrency,
  getCurrencyCode,
  getCurrencySymbol,
};