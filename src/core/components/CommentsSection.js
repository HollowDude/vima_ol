import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import SyncService from '../sync/sync.service';

const stripHtml = (html) => {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
};

const CommentItem = ({ comment }) => {
  const authorName = Array.isArray(comment.author_id) 
    ? comment.author_id[1] 
    : comment.author_id?.name || 'Usuario';
  
  const commentDate = new Date(comment.date);
  const formattedDate = commentDate.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const commentText = stripHtml(comment.body);
  const isLocal = comment._is_local;

  return (
    <View style={styles.commentItem}>
      <View style={styles.commentHeader}>
        <View style={styles.authorInfo}>
          <View style={styles.authorAvatar}>
            <Feather name="user" size={14} color="#64c27b" />
          </View>
          <Text style={styles.authorName}>{authorName}</Text>
        </View>
        <Text style={styles.commentDate}>{formattedDate}</Text>
      </View>
      <Text style={styles.commentText}>{commentText}</Text>
    </View>
  );
};

// Componente principal de la sección de comentarios
export default function CommentsSection({ taskId, visible }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible && taskId) {
      loadComments();
    }
  }, [visible, taskId]);

  const loadComments = async () => {
    try {
      setLoading(true);
      const taskComments = await SyncService.getTaskComments(taskId);
      setComments(taskComments);
    } catch (error) {
      console.error('Error cargando comentarios:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitComment = async () => {
    if (!newComment.trim()) {
      Alert.alert('Comentario vacío', 'Escribe algo antes de enviar');
      return;
    }

    try {
      setSubmitting(true);
      
      // Crear comentario localmente
      const createdComment = await SyncService.createCommentLocally(taskId, newComment.trim());
      
      // Actualizar lista local
      setComments(prev => [createdComment, ...prev]);
      setNewComment('');
      
      Alert.alert('✓ Comentario guardado', 'Se sincronizará cuando haya conexión');
    } catch (error) {
      console.error('Error creando comentario:', error);
      Alert.alert('Error', 'No se pudo guardar el comentario');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Feather name="message-circle" size={18} color="#64c27b" />
        <Text style={styles.headerTitle}>
          Comentarios {comments.length > 0 && `(${comments.length})`}
        </Text>
      </View>

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Escribe un comentario..."
          placeholderTextColor="#9CA3AF"
          value={newComment}
          onChangeText={setNewComment}
          multiline
          maxLength={500}
          editable={!submitting}
        />
        <TouchableOpacity
          style={[styles.sendButton, submitting && styles.sendButtonDisabled]}
          onPress={handleSubmitComment}
          disabled={submitting || !newComment.trim()}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Feather name="send" size={18} color="#fff" />
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#64c27b" />
          <Text style={styles.loadingText}>Cargando comentarios...</Text>
        </View>
      ) : comments.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="message-square" size={32} color="#D1D5DB" />
          <Text style={styles.emptyText}>No hay comentarios</Text>
          <Text style={styles.emptySubtext}>Sé el primero en comentar</Text>
        </View>
      ) : (
        <View style={styles.commentsList}>
          {comments.map((item) => (
            <CommentItem key={item.id} comment={item} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
  },

  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 20,
  },
  input: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    maxHeight: 100,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#64c27b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },

  commentsList: {
    gap: 12,
  },
  commentItem: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  authorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  authorAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#f0fdf4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  authorName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
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
  commentDate: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  commentText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },

  // Loading and empty states
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 12,
    color: '#D1D5DB',
    marginTop: 4,
  },
});