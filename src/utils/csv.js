// src/utils/csv.js
import Papa from 'papaparse';

/**
 * Parse CSV text into array of objects with headers
 */
export function parseCSV(text) {
  return new Promise((resolve) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        resolve({ data: results.data, errors: results.errors });
      },
    });
  });
}

const HEADER_ALIASES = {
  codigo: ['código', 'codigo', 'codigo cliente', 'código cliente', 'codigo_cliente', 'id', 'code', 'código_cliente', 'ID_cliente', 'id_cliente', 'ID cliente', 'ID_clientes'],
  nombre: ['nombre cliente', 'nombre', 'cliente', 'name', 'Nombre'],
  direccion: ['dirección', 'direccion', 'direccion cliente', 'direccion_cliente', 'address', 'Dirección', 'Direccion',],
  vendedor: ['id del vendedor', 'seller', 'assigned_to', 'vendedor', 'id_vendedor', 'agente', 'nombre_agente'],
};

function stripBOM(s) {
  if (!s || typeof s !== 'string') return s;
  // Elimina BOM inicial si existe
  return s.replace(/^\uFEFF/, '');
}

function findHeaderKey(header) {
  // Quitar BOM, trim y lowercase
  const h = stripBOM(String(header || '')).trim().toLowerCase();
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(h)) return key;
  }
  return null;
}

/**
 * Map parsed rows to canonical keys. Return { success, mapped, missingHeaders }
 */
export function mapAndValidateRows(rows) {
  if (!rows || rows.length === 0) return { success: false, mapped: [], missingHeaders: ['no-rows'] };

  // Recolectar headers usando la primera fila (Papaparse ya usó los encabezados)
  const first = rows[0];
  const originalHeaders = Object.keys(first);

  // Construir mapa originalHeader -> canonicalKey (limpiando BOM)
  const headerMap = {};
  for (const h of originalHeaders) {
    const key = findHeaderKey(h);
    if (key) headerMap[h] = key;
  }

  // required keys
  const required = ['codigo', 'nombre', 'direccion', 'vendedor'];
  const present = new Set(Object.values(headerMap));
  const missing = required.filter(r => !present.has(r));
  if (missing.length > 0) {
    return { success: false, mapped: [], missingHeaders: missing };
  }

  // map rows
  const mapped = rows.map(row => {
    const out = {};
    for (const orig of Object.keys(row)) {
      const k = headerMap[orig];
      if (!k) continue;
      out[k] = row[orig];
    }
    return out;
  });

  return { success: true, mapped, missingHeaders: [] };
}
