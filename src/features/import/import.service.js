import { parseCSV, mapAndValidateRows } from '../../utils/csv';
import StorageService from '../../services/storage.service';

let ExpoDocPicker = null;
let ExpoFileSystem = null;
try {
  // intentar cargar la API legacy primero (evita deprecation exceptions)
  // eslint-disable-next-line global-require
  ExpoFileSystem = require('expo-file-system/legacy');
} catch (e) {
  try {
    // eslint-disable-next-line global-require
    ExpoFileSystem = require('expo-file-system');
  } catch (e2) {
    ExpoFileSystem = null;
  }
}

try {
  // eslint-disable-next-line global-require
  ExpoDocPicker = require('expo-document-picker');
} catch (e) {
  ExpoDocPicker = null;
}

let RNDocPicker = null;
let RNFS = null;
try {
  // eslint-disable-next-line global-require
  RNDocPicker = require('react-native-document-picker');
} catch (e) {
  RNDocPicker = null;
}
try {
  // eslint-disable-next-line global-require
  RNFS = require('react-native-fs');
} catch (e) {
  RNFS = null;
}

function stripBOM(s) {
  if (!s || typeof s !== 'string') return s;
  return s.replace(/^\uFEFF/, '');
}

async function readTextFromUri(uri) {
  // Preferir expo-file-system (legacy si existe)
  if (ExpoFileSystem) {
    try {
      // Algunas versiones de expo-file-system/legacy tienen getInfoAsync, otras no.
      // Para evitar la excepción de deprecación, solo intentamos getInfoAsync si existe.
      if (typeof ExpoFileSystem.getInfoAsync === 'function') {
        try {
          const info = await ExpoFileSystem.getInfoAsync(uri);
          if (!info.exists) throw new Error('Archivo no accesible: ' + uri);
        } catch (infoErr) {
          // Si getInfoAsync lanza por deprecación o falla, continuamos e intentamos leer directamente.
        }
      }
      // readAsStringAsync está disponible en ambas APIs
      if (typeof ExpoFileSystem.readAsStringAsync === 'function') {
        return await ExpoFileSystem.readAsStringAsync(uri, { encoding: ExpoFileSystem.EncodingType?.UTF8 || ExpoFileSystem.EncodingType.UTF8 || ExpoFileSystem.EncodingType });
      }
      // si no hay readAsStringAsync, intentar readAsStringAsync legacy fallback
      if (typeof ExpoFileSystem.readAsStringAsync === 'undefined' && typeof ExpoFileSystem.readAsString === 'function') {
        return await ExpoFileSystem.readAsString(uri, { encoding: ExpoFileSystem.EncodingType?.UTF8 || ExpoFileSystem.EncodingType.UTF8 });
      }
      throw new Error('La API de expo-file-system disponible no soporta lectura directa.');
    } catch (err) {
      // Propagar error para manejo superior
      throw err;
    }
  }

  // Fallback RNFS
  if (RNFS) {
    let path = uri;
    if (path.startsWith('file://')) path = path.replace('file://', '');
    return await RNFS.readFile(path, 'utf8');
  }

  throw new Error('No hay módulo de sistema de ficheros disponible (instala expo-file-system o react-native-fs).');
}

/**
 * Limpieza de headers y remapeo alternativo
 */
function attemptRepairHeadersAndMap(rows) {
  if (!rows || rows.length === 0) return { success: false, mapped: [], missingHeaders: ['no-rows'] };

  const cleanedRows = rows.map(row => {
    const out = {};
    for (const k of Object.keys(row)) {
      const cleanedKey = stripBOM(String(k || '')).trim();
      out[cleanedKey] = row[k];
    }
    return out;
  });

  return mapAndValidateRows(cleanedRows);
}

export default {
  async pickAndImportCSV() {
    try {

      // Expo path
      if (ExpoDocPicker) {
        const res = await ExpoDocPicker.getDocumentAsync({
          type: ['text/csv', 'text/plain', 'application/csv', 'text/*'],
        });


        let uri = null;
        if (!res) {
          return { added: 0, total: 0 };
        }
        if (res.type === 'success' && res.uri) uri = res.uri;
        else if (Array.isArray(res.assets) && res.assets.length > 0 && res.canceled === false) uri = res.assets[0].uri;
        else if (res.uri) uri = res.uri;
        else if (res.canceled === true) {
          return { added: -1, total: 0 };
        } else {
          return { added: 0, total: 0 };
        }


        const text = await readTextFromUri(uri);

        const { data, errors } = await parseCSV(text);

        if (!data || data.length === 0) {
          throw new Error('CSV vacío o no contiene filas.');
        }


        let { success, mapped, missingHeaders } = mapAndValidateRows(data);

        if (!success) {
          const repairResult = attemptRepairHeadersAndMap(data);
          success = repairResult.success;
          mapped = repairResult.mapped;
          missingHeaders = repairResult.missingHeaders;
        }

        if (!success) {
          throw new Error('El CSV no tiene las columnas requeridas: ' + (missingHeaders || []).join(', '));
        }

        const normalized = mapped.map(r => ({
          codigo: r.codigo,
          nombre: r.nombre,
          direccion: r.direccion,
          vendedor: r.vendedor,
          lat: null,
          lng: null,
          registradoEn: null,
        }));

        const result = await StorageService.addClientsDedup(normalized);
        return result;
      }

      // RN native path
      if (RNDocPicker && RNFS) {

        const res = await RNDocPicker.pickSingle({
          type: [RNDocPicker.types.plainText, RNDocPicker.types.csv, RNDocPicker.types.allFiles],
          copyTo: 'cachesDirectory',
        });


        const uri = res.fileCopyUri || res.uri || res.name;
        if (!uri) throw new Error('No se obtuvo ruta del fichero seleccionado (rn).');

        if (uri.startsWith('content://')) {
          throw new Error('Content URI no soportado directamente. Copia el archivo a carpeta accesible o instala expo-file-system.');
        }

        const path = uri.startsWith('file://') ? uri.replace('file://', '') : uri;
        const text = await RNFS.readFile(path, 'utf8');

        const { data, errors } = await parseCSV(text);

        if (!data || data.length === 0) {
          throw new Error('CSV vacío o no contiene filas.');
        }

        let { success, mapped, missingHeaders } = mapAndValidateRows(data);

        if (!success) {
          const repairResult = attemptRepairHeadersAndMap(data);
          success = repairResult.success;
          mapped = repairResult.mapped;
          missingHeaders = repairResult.missingHeaders;
        }

        if (!success) {
          throw new Error('El CSV no tiene las columnas requeridas: ' + (missingHeaders || []).join(', '));
        }

        const normalized = mapped.map(r => ({
          codigo: r.codigo,
          nombre: r.nombre,
          direccion: r.direccion,
          vendedor: r.vendedor,
          lat: null,
          lng: null,
          registradoEn: null,
        }));

        const result = await StorageService.addClientsDedup(normalized);
        return result;
      }

      throw new Error('No hay un selector de archivos disponible. Instala expo-document-picker (Expo) o react-native-document-picker (native).');
    } catch (err) {
      if (RNDocPicker && typeof RNDocPicker.isCancel === 'function' && RNDocPicker.isCancel(err)) {
        return { added: 0, total: 0 };
      }
      throw err;
    }
  }
};
