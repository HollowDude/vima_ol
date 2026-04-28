import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView,
  ActivityIndicator, Dimensions, TouchableWithoutFeedback, Alert
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import SyncService from '../sync/sync.service';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function SurveyResponsesModal({
  visible,
  survey,
  taskId,
  relationId,
  onClose,
  onEditSurvey,
}) {
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});

  useEffect(() => {
    if (visible && survey?.id) {
      loadSurveyResponses();
    }
  }, [visible, survey?.id]);

  const loadSurveyResponses = async () => {
    try {
      setLoading(true);

      // Obtener preguntas
      const questionsData = await SyncService.getSurveyQuestions(survey.id);
      setQuestions(questionsData);

      // Obtener respuestas guardadas
      const progress = await SyncService.getSurveyProgress(taskId, survey.id, relationId);
      if (progress) {
        setAnswers(progress.answers || {});
      }
    } catch (error) {
      console.error('Error cargando respuestas:', error);
      Alert.alert('Error', 'No se pudieron cargar las respuestas');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const formatAnswer = (question, answer) => {
    if (!answer) return 'Sin responder';

    switch (question.question_type) {
      case 'char_box':
        return answer.value_char_box || 'Sin responder';

      case 'text_box':
        return answer.value_text_box || 'Sin responder';

      case 'numerical_box':
      case 'scale':
        const value = answer.value_numerical_box;
        if (value === undefined || value === null) return 'Sin responder';
        return String(value);

      case 'date':
        if (!answer.value_date) return 'Sin responder';
        return new Date(answer.value_date).toLocaleDateString('es-ES', {
          weekday: 'long',
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        });

      case 'datetime':
        if (!answer.value_datetime) return 'Sin responder';
        return new Date(answer.value_datetime).toLocaleString('es-ES', {
          weekday: 'long',
          day: '2-digit',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });

      case 'simple_choice':
        const selectedId = answer.value_suggested;
        if (!selectedId) return 'Sin responder';
        const options = question.suggested_answer_ids || [];
        const selected = Array.isArray(options[0]) 
          ? options.find(opt => opt[0] === selectedId)?.[1]
          : options.find(opt => opt.id === selectedId)?.value;
        return selected || 'Sin responder';

      case 'multiple_choice':
        const selectedIds = answer.value_suggested_multiple || [];
        if (selectedIds.length === 0) return 'Sin responder';
        const multiOptions = question.suggested_answer_ids || [];
        const selectedOptions = selectedIds
          .map(id => {
            const opt = Array.isArray(multiOptions[0])
              ? multiOptions.find(opt => opt[0] === id)?.[1]
              : multiOptions.find(opt => opt.id === id)?.value;
            return opt;
          })
          .filter(Boolean);
        return selectedOptions.length > 0 ? selectedOptions.join(', ') : 'Sin responder';

      case 'matrix':
        const matrixKeys = Object.keys(answer).filter(
          k => k.startsWith('matrix_') && answer[k] === true
        );
        if (matrixKeys.length === 0) return 'Sin responder';
        
        const matrixRows = question.matrix_row_ids || [];
        const matrixCols = question.suggested_answer_ids || [];
        
        return matrixKeys
          .map(key => {
            const parts = key.split('_');
            if (parts.length !== 3) return null;
            const rowId = parseInt(parts[1]);
            const colId = parseInt(parts[2]);
            
            const rowLabel = Array.isArray(matrixRows[0])
              ? matrixRows.find(r => r[0] === rowId)?.[1]
              : matrixRows.find(r => r.id === rowId)?.value;
            
            const colLabel = Array.isArray(matrixCols[0])
              ? matrixCols.find(c => c[0] === colId)?.[1]
              : matrixCols.find(c => c.id === colId)?.value;
            
            return `${rowLabel}: ${colLabel}`;
          })
          .filter(Boolean)
          .join(' | ');

      default:
        return 'Sin responder';
    }
  };

  const handleBackdropPress = () => {
    onClose();
  };

  const handleEditSurvey = () => {
    Alert.alert(
      'Editar Encuesta',
      '¿Deseas responder la encuesta de nuevo? Se sobrescribirán tus respuestas anteriores.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, responder de nuevo',
          style: 'default',
          onPress: () => {
            onClose();
            onEditSurvey();
          },
        },
      ]
    );
  };

  if (!visible) return null;

  if (loading) {
    return (
      <Modal visible={visible} transparent animationType="fade">
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#64c27b" />
          <Text style={styles.loadingText}>Cargando respuestas...</Text>
        </View>
      </Modal>
    );
  }

  const answeredCount = Object.keys(answers).length;
  const totalQuestions = questions.length;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleBackdropPress}>
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.cardContainer}>
              <View style={styles.card}>
                {/* Header */}
                <View style={styles.header}>
                  <View style={styles.headerLeft}>
                    <View style={styles.completedBadge}>
                      <Feather name="check-circle" size={20} color="#10B981" />
                    </View>
                    <View style={styles.headerTitle}>
                      <Text style={styles.title}>{survey.title}</Text>
                      <Text style={styles.subtitle}>Encuesta completada</Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={handleBackdropPress} style={styles.closeButton}>
                    <Feather name="x" size={20} color="#6B7280" />
                  </TouchableOpacity>
                </View>

                {/* Stats */}
                <View style={styles.statsContainer}>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{answeredCount}</Text>
                    <Text style={styles.statLabel}>Respondidas</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{totalQuestions}</Text>
                    <Text style={styles.statLabel}>Total</Text>
                  </View>
                </View>

                {/* Respuestas */}
                <ScrollView
                  style={styles.responsesScroll}
                  contentContainerStyle={styles.responsesContent}
                  showsVerticalScrollIndicator={true}
                >
                  <Text style={styles.responsesTitle}>TUS RESPUESTAS</Text>

                  {questions.map((question, index) => {
                    const answer = answers[question.id];
                    const isAnswered = !!answer;

                    return (
                      <View key={question.id} style={styles.questionContainer}>
                        <View style={styles.questionHeader}>
                          <View style={styles.questionNumber}>
                            <Text style={styles.questionNumberText}>{index + 1}</Text>
                          </View>
                          <View style={styles.questionTitleContainer}>
                            <Text style={styles.questionTitle}>{question.title}</Text>
                            <View
                              style={[
                                styles.answerStatusBadge,
                                isAnswered ? styles.answerStatusBadgeDone : styles.answerStatusBadgeEmpty,
                              ]}
                            >
                              <Feather
                                name={isAnswered ? 'check' : 'alert-circle'}
                                size={12}
                                color={isAnswered ? '#10B981' : '#9CA3AF'}
                              />
                              <Text
                                style={[
                                  styles.answerStatusText,
                                  isAnswered ? styles.answerStatusTextDone : styles.answerStatusTextEmpty,
                                ]}
                              >
                                {isAnswered ? 'Respondida' : 'Sin responder'}
                              </Text>
                            </View>
                          </View>
                        </View>

                        <View style={styles.answerBox}>
                          <Text style={styles.answerText}>{formatAnswer(question, answer)}</Text>
                        </View>
                      </View>
                    );
                  })}

                  <View style={{ height: 20 }} />
                </ScrollView>

                {/* Actions */}
                <View style={styles.footer}>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.actionButtonSecondary]}
                    onPress={handleBackdropPress}
                  >
                    <Text style={styles.actionButtonSecondaryText}>Cerrar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.actionButtonPrimary]}
                    onPress={handleEditSurvey}
                  >
                    <Feather name="edit-2" size={16} color="#fff" />
                    <Text style={styles.actionButtonPrimaryText}>Volver a responder</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 16,
    fontWeight: '600',
  },
  cardContainer: {
    width: Math.min(SCREEN_WIDTH - 40, 500),
    maxHeight: SCREEN_HEIGHT * 0.85,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    overflow: 'hidden',
    flexDirection: 'column',
    maxHeight: SCREEN_HEIGHT * 0.85,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  completedBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  closeButton: {
    padding: 4,
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#64c27b',
  },
  statLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 4,
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#D1D5DB',
    marginHorizontal: 16,
  },
  responsesScroll: {
    flex: 1,
  },
  responsesContent: {
    padding: 20,
  },
  responsesTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 16,
  },
  questionContainer: {
    marginBottom: 20,
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 10,
  },
  questionNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  questionNumberText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
  },
  questionTitleContainer: {
    flex: 1,
    gap: 6,
  },
  questionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    lineHeight: 18,
  },
  answerStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  answerStatusBadgeDone: {
    backgroundColor: '#ECFDF5',
  },
  answerStatusBadgeEmpty: {
    backgroundColor: '#F3F4F6',
  },
  answerStatusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  answerStatusTextDone: {
    color: '#10B981',
  },
  answerStatusTextEmpty: {
    color: '#9CA3AF',
  },
  answerBox: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 12,
  },
  answerText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    backgroundColor: '#fff',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
  },
  actionButtonSecondary: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  actionButtonSecondaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  actionButtonPrimary: {
    backgroundColor: '#64c27b',
  },
  actionButtonPrimaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
});