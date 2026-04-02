import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  AUTH_TOKEN: '@vima_auth_token',
  USER_DATA: '@vima_user_data',
  SESSION_ID: '@vima_session_id',
};

class StorageService {
  /**
   * Guardar datos de autenticación
   */
  async saveAuthData(authData) {
    try {
      await AsyncStorage.setItem(KEYS.AUTH_TOKEN, JSON.stringify(authData));
    } catch (error) {
      console.error('[Storage] Error saving auth data:', error);
      throw error;
    }
  }

  /**
   * Obtener datos de autenticación
   */
  async getAuthData() {
    try {
      const data = await AsyncStorage.getItem(KEYS.AUTH_TOKEN);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('[Storage] Error getting auth data:', error);
      return null;
    }
  }

  /**
   * Limpiar datos de autenticación
   */
  async clearAuthData() {
    try {
      await AsyncStorage.removeItem(KEYS.AUTH_TOKEN);
      await AsyncStorage.removeItem(KEYS.USER_DATA);
      await AsyncStorage.removeItem(KEYS.SESSION_ID);
    } catch (error) {
      console.error('[Storage] Error clearing auth data:', error);
      throw error;
    }
  }

  /**
   * Guardar dato genérico
   */
  async setItem(key, value) {
    try {
      const jsonValue = JSON.stringify(value);
      await AsyncStorage.setItem(key, jsonValue);
    } catch (error) {
      console.error(`[Storage] Error saving ${key}:`, error);
      throw error;
    }
  }

  /**
   * Obtener dato genérico
   */
  async getItem(key) {
    try {
      const value = await AsyncStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error(`[Storage] Error getting ${key}:`, error);
      return null;
    }
  }

  /**
   * Eliminar dato
   */
  async removeItem(key) {
    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error(`[Storage] Error removing ${key}:`, error);
      throw error;
    }
  }
}

export default new StorageService();