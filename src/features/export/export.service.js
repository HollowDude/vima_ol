// services/export.service.js (o donde tengas definido tu ExportService)
import { Platform } from 'react-native'; // <--- IMPORTANTE: Importar Platform
import * as Sharing from 'expo-sharing';
import Papa from 'papaparse';
import StorageService from '../../services/storage.service';

let FileSystem = null;
try {
  FileSystem = require('expo-file-system/legacy');
} catch (e) {
  try {
    FileSystem = require('expo-file-system');
  } catch (e2) {
    FileSystem = null;
  }
}

function safeFilename(s) {
  return s.replace(/[:\/\\\s]+/g, '_');
}

export default {
  async exportClients({ onlyWithLocation = false } = {}) {
    if (!FileSystem) {
      throw new Error('No hay módulo de sistema de ficheros disponible.');
    }

    // 1) Obtener clientes
    const clients = await StorageService.getClients();
    const filtered = Array.isArray(clients)
      ? (onlyWithLocation ? clients.filter(c => c.lat != null && c.lng != null) : clients)
      : [];

    if (!filtered || filtered.length === 0) {
      throw new Error('No hay clientes para exportar.');
    }

    // 2) Mapear filas
    const rows = filtered.map(c => ({
      ID_cliente: c.codigo ?? '',
      Nombre: c.nombre ?? '',
      Dirección: c.direccion ?? '',
      ID_vendedor: c.vendedor ?? '',
      latitud: c.lat != null ? String(c.lat) : '',
      longitud: c.lng != null ? String(c.lng) : '',
      registradoEn: c.registradoEn ?? '',
    }));

    // 3) Generar CSV
    // Truco: Agregar BOM (\uFEFF) al inicio para que Excel abra bien las tildes y Ñ en Windows
    const csvText = '\uFEFF' + Papa.unparse(rows, { header: true });

    // Nombre base del archivo
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `vima_clients_${onlyWithLocation ? 'with_location_' : ''}${safeFilename(ts)}.csv`;

    // ============================================================
    // FLUJO ANDROID: Seleccionar carpeta y guardar (SAF)
    // ============================================================
    if (Platform.OS === 'android') {
      const SAF = FileSystem.StorageAccessFramework;
      
      // Verificar soporte de SAF
      if (!SAF) {
        throw new Error('El modo de almacenamiento SAF no está disponible en este dispositivo.');
      }

      // Intentar sugerir la carpeta de Descargas (No garantizado en todas las versiones de Android, pero es el estándar)
      // Si falla el getUriForDirectoryInRoot, usamos null para abrir en recientes/raíz.
      let initialUri = null;
      try {
          initialUri = SAF.getUriForDirectoryInRoot('Download'); 
      } catch (e) {
          console.warn('No se pudo obtener URI de Descargas, abriendo selector por defecto');
      }

      // 4a) Pedir al usuario que seleccione la carpeta
      const permissions = await SAF.requestDirectoryPermissionsAsync(initialUri);

      if (!permissions.granted) {
        // El usuario canceló la selección
        return { cancelled: true }; 
      }

      // 4b) Crear el archivo en la carpeta seleccionada por el usuario
      // Nota: createFileAsync devuelve la URI del nuevo archivo
      const newFileUri = await SAF.createFileAsync(permissions.directoryUri, filename, 'text/csv');

      // 4c) Escribir el contenido
      await FileSystem.writeAsStringAsync(newFileUri, csvText, { encoding: FileSystem.EncodingType.UTF8 });

      return { uri: newFileUri, filename, saved: true };
    }

    // ============================================================
    // FLUJO IOS: Guardar en cache y Share Sheet (Comportamiento original)
    // ============================================================
    const uri = `${FileSystem.cacheDirectory}${filename}`;

    if (typeof FileSystem.writeAsStringAsync === 'function') {
      await FileSystem.writeAsStringAsync(uri, csvText, { encoding: FileSystem.EncodingType.UTF8 });
    } else if (typeof FileSystem.writeAsString === 'function') {
      await FileSystem.writeAsString(uri, csvText);
    } else {
      throw new Error('La API de expo-file-system disponible no soporta writeAsStringAsync.');
    }

    const available = await Sharing.isAvailableAsync();
    if (!available) {
      return { uri, filename };
    }

    await Sharing.shareAsync(uri, {
      mimeType: 'text/csv',
      dialogTitle: 'Exportar clientes',
      UTI: 'public.comma-separated-values-text' // Ayuda a iOS a entender que es CSV
    });

    return { uri, filename, saved: false };
  },
};