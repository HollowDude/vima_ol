import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, FlatList,
  Alert, ActivityIndicator, Platform, Linking
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as IntentLauncher from 'expo-intent-launcher';
import SyncService from '../sync/sync.service';

/**
 * Modal para ver y gestionar adjuntos de una tarea
 */
export default function AttachmentsModal({ visible, taskId, onClose }) {
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (visible && taskId) {
      loadAttachments();
    }
  }, [visible, taskId]);

  const loadAttachments = async () => {
    try {
      setLoading(true);
      const taskAttachments = await SyncService.getTaskAttachments(taskId);
      setAttachments(taskAttachments);
    } catch (error) {
      console.error('Error cargando adjuntos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        return;
      }

      const file = result.assets[0];
      
      // Validar tamaño (max 10MB)
      if (file.size && file.size > 10 * 1024 * 1024) {
        Alert.alert('Archivo muy grande', 'El archivo no debe superar 10MB');
        return;
      }

      setUploading(true);

      await SyncService.uploadAttachment(
        taskId,
        file.uri,
        file.name,
        file.mimeType || 'application/octet-stream'
      );

      Alert.alert('✓ Archivo adjunto', 'Se subirá cuando haya conexión');
      await loadAttachments();
    } catch (error) {
      console.error('Error subiendo archivo:', error);
      Alert.alert('Error', 'No se pudo adjuntar el archivo');
    } finally {
      setUploading(false);
    }
  };

  const handleOpenAttachment = async (attachment) => {
    try {
      // Si no está descargado, descargarlo primero
      if (!attachment._is_downloaded) {
        Alert.alert(
          'Descargar archivo',
          '¿Deseas descargar este archivo?',
          [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Descargar',
              onPress: async () => {
                try {
                  setLoading(true);
                  const localPath = await SyncService.downloadAttachment(attachment.id);
                  await loadAttachments();
                  openFile(localPath, attachment.mimetype);
                } catch (err) {
                  Alert.alert('Error', 'No se pudo descargar el archivo');
                } finally {
                  setLoading(false);
                }
              },
            },
          ]
        );
        return;
      }

      // Abrir archivo descargado
      openFile(attachment._local_path, attachment.mimetype);
    } catch (error) {
      console.error('Error abriendo archivo:', error);
      Alert.alert('Error', 'No se pudo abrir el archivo');
    }
  };

  const openFile = async (fileUri, mimeType) => {
    try {
      if (Platform.OS === 'ios') {
        // En iOS, usar Sharing
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(fileUri, {
            UTI: mimeType,
            mimeType: mimeType,
          });
        } else {
          Alert.alert('No disponible', 'No se puede abrir el archivo en este dispositivo');
        }
      } else {
        // En Android, usar IntentLauncher
        const contentUri = await FileSystem.getContentUriAsync(fileUri);
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          flags: 1,
          type: mimeType || '*/*',
        });
      }
    } catch (error) {
      console.error('Error abriendo archivo:', error);
      
      // Fallback: intentar compartir si falla la apertura
      try {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(fileUri);
        } else {
          Alert.alert('Error', 'No se pudo abrir el archivo. Intenta con otra aplicación.');
        }
      } catch (shareError) {
        Alert.alert('Error', 'No se pudo abrir ni compartir el archivo.');
      }
    }
  };

  const handleDeleteAttachment = (attachment) => {
    Alert.alert(
      'Eliminar adjunto',
      `¿Estás seguro de eliminar "${attachment.name}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await SyncService.deleteAttachment(attachment.id);
              Alert.alert('✓ Eliminado', 'El adjunto se eliminará del servidor cuando haya conexión');
              await loadAttachments();
            } catch (error) {
              Alert.alert('Error', 'No se pudo eliminar el adjunto');
            }
          },
        },
      ]
    );
  };

  const getFileIcon = (mimetype) => {
    if (!mimetype) return 'file';
    if (mimetype.startsWith('image/')) return 'image';
    if (mimetype.startsWith('video/')) return 'video';
    if (mimetype.includes('pdf')) return 'file-text';
    if (mimetype.includes('word') || mimetype.includes('document')) return 'file-text';
    if (mimetype.includes('excel') || mimetype.includes('spreadsheet')) return 'grid';
    if (mimetype.includes('zip') || mimetype.includes('rar')) return 'archive';
    return 'file';
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const renderAttachment = ({ item }) => {
    const icon = getFileIcon(item.mimetype);
    const isLocal = item._is_local || false;

    return (
      <TouchableOpacity
        style={styles.attachmentItem}
        onPress={() => handleOpenAttachment(item)}
        activeOpacity={0.7}
      >
        <View style={styles.attachmentIcon}>
          <Feather name={icon} size={24} color="#64c27b" />
          {!item._is_downloaded && (
            <View style={styles.cloudBadge}>
              <Feather name="cloud" size={10} color="#fff" />
            </View>
          )}
        </View>

        <View style={styles.attachmentInfo}>
          <Text style={styles.attachmentName} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={styles.attachmentMeta}>
            <Text style={styles.attachmentSize}>{formatFileSize(item.file_size)}</Text>
            {isLocal && (
              <View style={styles.localBadge}>
                <Feather name="smartphone" size={10} color="#F59E0B" />
                <Text style={styles.localBadgeText}>Local</Text>
              </View>
            )}
          </View>
        </View>

        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteAttachment(item)}
        >
          <Feather name="trash-2" size={18} color="#EF4444" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Archivos Adjuntos</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Feather name="x" size={24} color="#374151" />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#64c27b" />
            <Text style={styles.loadingText}>Cargando adjuntos...</Text>
          </View>
        ) : (
          <FlatList
            data={attachments}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderAttachment}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Feather name="paperclip" size={48} color="#D1D5DB" />
                <Text style={styles.emptyText}>No hay archivos adjuntos</Text>
                <Text style={styles.emptySubtext}>Toca el botón de abajo para agregar</Text>
              </View>
            }
          />
        )}

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.uploadButton, uploading && styles.uploadButtonDisabled]}
            onPress={handlePickDocument}
            disabled={uploading}
          >
            {uploading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Feather name="upload" size={20} color="#fff" />
                <Text style={styles.uploadButtonText}>Adjuntar Archivo</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingTop: 60,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  closeButton: {
    padding: 4,
  },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#6B7280',
  },

  listContent: {
    padding: 16,
  },
  attachmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  attachmentIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f0fdf4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    position: 'relative',
  },
  cloudBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  attachmentInfo: {
    flex: 1,
  },
  attachmentName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  attachmentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  attachmentSize: {
    fontSize: 12,
    color: '#6B7280',
  },
  localBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 4,
  },
  localBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#F59E0B',
  },
  deleteButton: {
    padding: 8,
  },

  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#9CA3AF',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#D1D5DB',
    marginTop: 8,
  },

  footer: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#64c27b',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  uploadButtonDisabled: {
    opacity: 0.6,
  },
  uploadButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});