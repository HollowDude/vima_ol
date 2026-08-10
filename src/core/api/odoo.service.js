import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import * as Network from 'expo-network';

const ODOO_URL = 'http://vima2.lombaoestudios.com';
const DATABASE = 'vima2.lombaoestudios.com';

class OdooService {
  constructor() {
    this.url = ODOO_URL;
    this.db = DATABASE;
    this.uid = null;
    this.password = null;
  }

  /**
   * Obtiene el IP del dispositivo: expo-network funciona en Android e iOS,
   * NetInfo queda como respaldo (Android WiFi/Ethernet).
   */
  async getDeviceIp() {
    try {
      const ip = await Network.getIpAddressAsync();
      if (ip) return ip;
    } catch (e) {
      console.warn('No se pudo obtener el IP con expo-network:', e);
    }
    try {
      const state = await NetInfo.fetch();
      return state?.details?.ipAddress || null;
    } catch {
      return null;
    }
  }

  /**
   * Variables de entorno que recibe el método `authenticate` del modelo common
   * en el servidor, para que Odoo distinga si la llamada viene de la app móvil.
   */
  async buildUserAgentEnv() {
    const platform = Platform.OS === 'ios' ? 'iphone' : Platform.OS;
    const env = {
      HTTP_USER_AGENT: platform,
    };

    const ip = await this.getDeviceIp();
    if (ip) env.REMOTE_ADDR = ip;

    return env;
  }

  /**
   * Autenticación en Odoo usando JSON-RPC (método authenticate del servicio common)
   */
  async authenticate(username, password) {
    try {
      const endpoint = `${this.url}/jsonrpc`;
      console.log(" Login en:", this.url);
      console.log(" Endpoint :", endpoint);
      console.log(" Base de datos:", this.db);
      console.log(" Usuario:", username);

      const requestBody = {
        jsonrpc: "2.0",
        method: "call",
        params: {
          service: "common",
          method: "authenticate",
          args: [this.db, username, password, await this.buildUserAgentEnv()],
        },
        id: 1,
      };

      console.log("Request:", JSON.stringify(requestBody));

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 15000);

      console.log(" fetch...");
      
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "User-Agent": "VimaApp/1.0"
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      }).catch(err => {
        console.error(" Fetch falló :", err);
        console.error(" Error name:", err.name);
        console.error(" Error message:", err.message);
        console.error(" Error stack:", err.stack);
        throw err;
      });

      clearTimeout(timeoutId);
      console.log(" Fetch completado");
      console.log(" Status de login:", response.status);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Error desconocido');
        console.log(" Error HTTP en login:", response.status, errorText);
        throw new Error(`Error de conexión (${response.status})`);
      }

      const data = await response.json();
      console.log(" Respuesta de login:", data.result);

      if (data.result) {
        console.log(" Login exitoso, UID:", data.result);
        
        this.uid = data.result;
        this.password = password;

        return {
          uid: data.result,
          username: username,
          name: username,
        };
      } else {
        console.log(" Login fallido:", data.error || 'Credenciales incorrectas');
        throw new Error(data.error?.message || "Credenciales incorrectas");
      }
    } catch (error) {
      console.error(" Error en login:", error);
      throw error;
    }
  }

  /**
* Llamada genérica a Odoo con JSON-RPC
    */
  async call(model, method, args = [], kwargs = {}) {
    if (!this.uid || !this.password) {
      throw new Error('No autenticado. Debe hacer login primero.');
    }

    const startedAt = Date.now();

    try {
      console.log(" Llamando a Odoo:", { model, method, args, kwargs });

      const response = await fetch(`${this.url}/jsonrpc`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "User-Agent": "VimaApp/1.0"
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "call",
          params: {
            service: "object",
            method: "execute_kw",
            args: [
              this.db,
              this.uid,
              this.password,
              model,
              method,
              args,
              kwargs
            ],
          },
          id: Math.floor(Math.random() * 1000),
        }),
      });

      console.log(" Status de llamada:", response.status);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Error desconocido');
        console.log(" Error HTTP en llamada:", response.status, errorText);
        throw new Error(`Error de conexión (${response.status})`);
      }

      const data = await response.json();
      console.log(" Respuesta de llamada:", data);

      if (data.error) {
        const duration = Date.now() - startedAt;
        this.lastCallMeta = { model, method, duration, ok: false, recordCount: 0 };
        throw new Error(data.error.data?.message || 'Error en llamada a Odoo');
      }

      const duration = Date.now() - startedAt;
      let recordCount = 0;
      if (Array.isArray(data.result)) {
        recordCount = data.result.length;
      } else if (method === 'create') {
        recordCount = 1;
      } else if (method === 'write' || method === 'unlink') {
        recordCount = Array.isArray(args[0]) ? args[0].length : 0;
      }

      this.lastCallMeta = { model, method, duration, ok: true, recordCount };

      return data.result;
    } catch (error) {
      const duration = Date.now() - startedAt;
      if (!this.lastCallMeta || this.lastCallMeta.duration < duration) {
        this.lastCallMeta = { model, method, duration, ok: false, recordCount: 0, error: error.message };
      }
      console.error(" Error en llamada:", error);
      throw error;
    }
  }

  /**
   * Buscar registros
   */
  async search(model, domain = [], limit = 100, offset = 0, order = '') {
    const kwargs = { limit, offset };
    if (order) kwargs.order = order;
    
    return this.call(model, 'search', [domain], kwargs);
  }

  /**
   * Leer registros
   */
  async read(model, ids, fields = []) {
    const kwargs = fields.length > 0 ? { fields } : {};
    return this.call(model, 'read', [ids], kwargs);
  }

  /**
   * Buscar y leer registros
   */
  async searchRead(model, domain = [], fields = [], limit = 100, offset = 0, order = '') {
    const kwargs = { 
      domain,
      fields,
      limit,
      offset
    };
    if (order) kwargs.order = order;

    return this.call(model, 'search_read', [], kwargs);
  }

  /**
   * Crear registro
   */
  async create(model, values) {
    return this.call(model, 'create', [values]);
  }

  /**
   * Actualizar registro
   */
  async write(model, ids, values) {
    return this.call(model, 'write', [ids, values]);
  }

  /**
   * Eliminar registro
   */
  async unlink(model, ids) {
    return this.call(model, 'unlink', [ids]);
  }

  /**
   * Limpiar sesión
   */
  clearSession() {
    this.uid = null;
    this.password = null;
  }
}

export default new OdooService();