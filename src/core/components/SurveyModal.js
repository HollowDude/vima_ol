import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView,
  TextInput, Alert, ActivityIndicator, Dimensions, TouchableWithoutFeedback, Platform, Linking
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import Slider from '@react-native-community/slider';
import SyncService from '../sync/sync.service';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

function QuestionCard({ 
  question,
  survey,
  answer, 
  onAnswerChange, 
  currentIndex, 
  totalQuestions,
  onPrev,
  onNext,
  onClose,

}) {
  const [localAnswer, setLocalAnswer] = useState({});
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  useEffect(() => {
    if (question && question.id) {
      setLocalAnswer(answer || {});
    }
  }, [question?.id, answer]);

  if (!question || !question.id) {
    return (
      <View style={styles.cardContainer}>
        <View style={styles.card}>
          <View style={styles.errorContainer}>
            <Feather name="alert-circle" size={48} color="#EF4444" />
            <Text style={styles.errorText}>Error cargando pregunta</Text>
          </View>
        </View>
      </View>
    );
  }

  const handleTextChange = (text) => {
    const updated = { ...localAnswer, value_text_box: text };
    setLocalAnswer(updated);
    onAnswerChange(question.id, updated);
  };

  const handleNumberChange = (text) => {
    const numValue = parseFloat(text);
    const updated = { 
      ...localAnswer, 
      value_numerical_box: isNaN(numValue) ? 5 : numValue 
    };
    setLocalAnswer(updated);
    onAnswerChange(question.id, updated);
  };

  const handleDateChange = (event, selectedDate) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    
    if (event.type === 'set' && selectedDate) {
      const dateStr = selectedDate.toISOString().split('T')[0];
      const updated = { ...localAnswer, value_date: dateStr };
      setLocalAnswer(updated);
      onAnswerChange(question.id, updated);
    }
  };

  const handleDateTimeChange = (event, selectedDateTime) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
      if (event.type === 'set' && selectedDateTime) {
        setShowTimePicker(true);
      }
    }
    
    if (event.type === 'set' && selectedDateTime) {
      if (Platform.OS === 'ios') {
        const datetimeStr = selectedDateTime.toISOString().replace('T', ' ').split('.')[0];
        const updated = { ...localAnswer, value_datetime: datetimeStr };
        setLocalAnswer(updated);
        onAnswerChange(question.id, updated);
      }
    }
  };

  const handleTimeChange = (event, selectedTime) => {
    setShowTimePicker(false);
    
    if (event.type === 'set' && selectedTime) {
      const existingDate = localAnswer.value_datetime 
        ? new Date(localAnswer.value_datetime)
        : new Date();
      
      existingDate.setHours(selectedTime.getHours());
      existingDate.setMinutes(selectedTime.getMinutes());
      existingDate.setSeconds(selectedTime.getSeconds());
      
      const datetimeStr = existingDate.toISOString().replace('T', ' ').split('.')[0];
      const updated = { ...localAnswer, value_datetime: datetimeStr };
      setLocalAnswer(updated);
      onAnswerChange(question.id, updated);
    }
  };

  const handleSimpleChoiceSelect = (answerId) => {
    const updated = { ...localAnswer, value_suggested: answerId };
    setLocalAnswer(updated);
    onAnswerChange(question.id, updated);
  };

  const handleMultipleChoiceToggle = (answerId) => {
    let currentSelected = localAnswer.value_suggested_multiple || [];
    if (currentSelected.includes(answerId)) {
      currentSelected = currentSelected.filter(id => id !== answerId);
    } else {
      currentSelected = [...currentSelected, answerId];
    }
    const updated = { ...localAnswer, value_suggested_multiple: currentSelected };
    setLocalAnswer(updated);
    onAnswerChange(question.id, updated);
  };

  const handleNextWithValidation = () => {
    if (question.constr_mandatory) {
      const hasAnswer = checkHasAnswer();
      if (!hasAnswer) {
        Alert.alert(
          'Campo obligatorio', 
          question.constr_error_msg || 'Debes responder esta pregunta para continuar'
        );
        return;
      }
    }
    onNext();
  };

  const checkHasAnswer = () => {
    switch (question.question_type) {
      case 'char_box':
        return localAnswer.value_char_box && localAnswer.value_char_box.trim().length > 0;
      case 'text_box':
        return localAnswer.value_text_box && localAnswer.value_text_box.trim().length > 0;
      case 'numerical_box':
        return localAnswer.value_numerical_box !== undefined && localAnswer.value_numerical_box !== null;
      case 'date':
        return localAnswer.value_date && localAnswer.value_date.length > 0;
      case 'datetime':
        return localAnswer.value_datetime && localAnswer.value_datetime.length > 0;
      case 'simple_choice':
        return localAnswer.value_suggested !== undefined && localAnswer.value_suggested !== null;
      case 'multiple_choice':
        return localAnswer.value_suggested_multiple && localAnswer.value_suggested_multiple.length > 0;
      case 'scale':
        return localAnswer.value_numerical_box !== undefined && localAnswer.value_numerical_box !== null;
      case 'matrix':
        return Object.keys(localAnswer).some(key => key.startsWith('matrix_') && localAnswer[key] === true);
      default:
        return true;
    }
  };

  const renderQuestionInput = () => {
    switch (question.question_type) {
      case 'char_box':
        return (
          <TextInput
            style={styles.textInput}
            value={localAnswer.value_char_box || ''}
            onChangeText={(text) => {
              const updated = { ...localAnswer, value_char_box: text };
              setLocalAnswer(updated);
              onAnswerChange(question.id, updated);
            }}
            placeholder="Escribe tu respuesta..."
            placeholderTextColor="#9CA3AF"
          />
        );

      case 'text_box':
        return (
          <TextInput
            style={[styles.textInput, styles.textArea]}
            value={localAnswer.value_text_box || ''}
            onChangeText={handleTextChange}
            placeholder="Escribe tu respuesta..."
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        );

      case 'numerical_box':
        return (
          <TextInput
            style={styles.textInput}
            value={localAnswer.value_numerical_box !== undefined && localAnswer.value_numerical_box !== null 
              ? String(localAnswer.value_numerical_box) 
              : ''}
            onChangeText={handleNumberChange}
            placeholder="0"
            placeholderTextColor="#9CA3AF"
            keyboardType="numeric"
          />
        );

      case 'date':
        return (
          <>
            <TouchableOpacity 
              style={styles.dateButton} 
              onPress={() => setShowDatePicker(true)}
            >
              <Feather name="calendar" size={20} color="#64c27b" />
              <View style={styles.datePickerTextContainer}>
                <Text style={styles.dateButtonText}>
                  {localAnswer.value_date 
                    ? new Date(localAnswer.value_date).toLocaleDateString('es-ES', {
                        weekday: 'long',
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric'
                      })
                    : 'Seleccionar fecha'}
                </Text>
              </View>
              <Feather name="chevron-down" size={20} color="#9CA3AF" />
            </TouchableOpacity>

            {showDatePicker && (
              <DateTimePicker
                value={localAnswer.value_date ? new Date(localAnswer.value_date) : new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={handleDateChange}
                locale="es-ES"
              />
            )}
          </>
        );

      case 'datetime':
        const currentDateTime = localAnswer.value_datetime 
          ? new Date(localAnswer.value_datetime)
          : new Date();
          
        return (
          <>
            <TouchableOpacity 
              style={styles.dateButton} 
              onPress={() => setShowDatePicker(true)}
            >
              <Feather name="calendar" size={20} color="#64c27b" />
              <View style={styles.datePickerTextContainer}>
                <Text style={styles.dateButtonText}>
                  {localAnswer.value_datetime 
                    ? new Date(localAnswer.value_datetime).toLocaleDateString('es-ES', {
                        weekday: 'long',
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric'
                      })
                    : 'Seleccionar fecha y hora'}
                </Text>
                {localAnswer.value_datetime && (
                  <Text style={styles.dateButtonTime}>
                    {new Date(localAnswer.value_datetime).toLocaleTimeString('es-ES', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </Text>
                )}
              </View>
              <Feather name="chevron-down" size={20} color="#9CA3AF" />
            </TouchableOpacity>

            {showDatePicker && Platform.OS === 'ios' && (
              <DateTimePicker
                value={currentDateTime}
                mode="datetime"
                display="spinner"
                onChange={handleDateTimeChange}
                locale="es-ES"
              />
            )}

            {showDatePicker && Platform.OS === 'android' && (
              <DateTimePicker
                value={currentDateTime}
                mode="date"
                display="default"
                onChange={handleDateTimeChange}
              />
            )}

            {showTimePicker && Platform.OS === 'android' && (
              <DateTimePicker
                value={currentDateTime}
                mode="time"
                is24Hour={true}
                display="default"
                onChange={handleTimeChange}
              />
            )}
          </>
        );

      case 'simple_choice':
        const answers = question.suggested_answer_ids || [];
        return (
          <ScrollView style={styles.choicesScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.choicesContainer}>
              {answers.map((answer) => {
                const answerId = Array.isArray(answer) ? answer[0] : answer.id;
                const answerText = Array.isArray(answer) ? answer[1] : answer.value;
                const isSelected = localAnswer.value_suggested === answerId;

                return (
                  <TouchableOpacity
                    key={answerId}
                    style={[styles.choiceOption, isSelected && styles.choiceOptionSelected]}
                    onPress={() => handleSimpleChoiceSelect(answerId)}
                  >
                    <View style={[styles.radio, isSelected && styles.radioSelected]}>
                      {isSelected && <View style={styles.radioDot} />}
                    </View>
                    <Text style={[styles.choiceText, isSelected && styles.choiceTextSelected]}>
                      {answerText}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        );

      case 'multiple_choice':
        const selectedMultiple = localAnswer.value_suggested_multiple || [];
        const multiAnswers = question.suggested_answer_ids || [];
        
        return (
          <ScrollView style={styles.choicesScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.choicesContainer}>
              {multiAnswers.map((answer) => {
                const answerId = Array.isArray(answer) ? answer[0] : answer.id;
                const answerText = Array.isArray(answer) ? answer[1] : answer.value;
                const isSelected = selectedMultiple.includes(answerId);

                return (
                  <TouchableOpacity
                    key={answerId}
                    style={[styles.choiceOption, isSelected && styles.choiceOptionSelected]}
                    onPress={() => handleMultipleChoiceToggle(answerId)}
                  >
                    <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                      {isSelected && <Feather name="check" size={16} color="#fff" />}
                    </View>
                    <Text style={[styles.choiceText, isSelected && styles.choiceTextSelected]}>
                      {answerText}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        );

      case 'matrix':
        const matrixRows = question.matrix_row_ids || [];
        const matrixCols = question.suggested_answer_ids || [];

        if (matrixRows.length === 0 || matrixCols.length === 0) {
          return <Text style={styles.unsupportedText}>No hay filas o columnas configuradas</Text>;
        }

        return (
          <ScrollView style={styles.matrixScroll} showsVerticalScrollIndicator={true}>
            <View style={styles.matrixContainer}>
              <View style={styles.matrixHeaderRow}>
                <View style={styles.matrixRowHeader}>
                  <Text style={styles.matrixHeaderText}></Text>
                </View>
                {matrixCols.map((col, idx) => {
                  const colText = Array.isArray(col) ? col[1] : col.value;
                  return (
                    <View key={idx} style={styles.matrixColHeaderContainer}>
                      <Text style={styles.matrixColHeader}>{colText}</Text>
                    </View>
                  );
                })}
              </View>

              {matrixRows.map((row, rowIdx) => {
                const rowId = Array.isArray(row) ? row[0] : row.id;
                const rowText = Array.isArray(row) ? row[1] : row.value;

                return (
                  <View key={`row-${rowIdx}-${rowId}`} style={styles.matrixRow}>
                    <View style={styles.matrixRowHeader}>
                      <Text style={styles.matrixRowText}>{rowText}</Text>
                    </View>
                    <View style={styles.matrixOptions}>
                      {matrixCols.map((col, colIdx) => {
                        const colId = Array.isArray(col) ? col[0] : col.id;
                        const matrixKey = `matrix_${rowId}_${colId}`;
                        const isSelected = localAnswer[matrixKey] === true;

                        return (
                          <TouchableOpacity
                            key={`col-${colIdx}-${colId}`}
                            style={styles.matrixOption}
                            onPress={() => {
                              const updated = { ...localAnswer };
                              matrixCols.forEach((c) => {
                                const cId = Array.isArray(c) ? c[0] : c.id;
                                updated[`matrix_${rowId}_${cId}`] = false;
                              });
                              updated[matrixKey] = true;
                              setLocalAnswer(updated);
                              onAnswerChange(question.id, updated);
                            }}
                          >
                            <View style={[styles.radio, isSelected && styles.radioSelected]}>
                              {isSelected && <View style={styles.radioDot} />}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        );

      case 'scale':
        const scaleMin = question.scale_min || 1;
        const scaleMax = question.scale_max || 10;
        const currentValue = localAnswer.value_numerical_box !== undefined && localAnswer.value_numerical_box !== null
          ? localAnswer.value_numerical_box 
          : Math.floor((scaleMin + scaleMax) / 2);

        const getCurrentLabel = () => {
          const range = scaleMax - scaleMin;
          const third = range / 3;
          
          if (currentValue <= scaleMin + third) {
            return question.scale_min_label || 'Mínimo';
          } else if (currentValue >= scaleMax - third) {
            return question.scale_max_label || 'Máximo';
          } else {
            return question.scale_mid_label || 'Medio';
          }
        };

        const getCurrentColor = () => {
          const range = scaleMax - scaleMin;
          const third = range / 3;
          
          if (currentValue <= scaleMin + third) {
            return '#EF4444';
          } else if (currentValue >= scaleMax - third) {
            return '#10B981';
          } else {
            return '#F59E0B';
          }
        };

        return (
          <View style={styles.scaleContainer}>
            <View style={styles.scaleValueContainer}>
              <View style={[styles.scaleValueBadge, { backgroundColor: getCurrentColor() }]}>
                <Text style={styles.scaleValueText}>{Math.round(currentValue)}</Text>
              </View>
              <Text style={[styles.scaleCurrentLabel, { color: getCurrentColor() }]}>
                {getCurrentLabel()}
              </Text>
            </View>

            <Slider
              style={styles.slider}
              minimumValue={scaleMin}
              maximumValue={scaleMax}
              step={1}
              value={currentValue}
              onValueChange={(value) => {
                const updated = { ...localAnswer, value_numerical_box: value };
                setLocalAnswer(updated);
              }}
              onSlidingComplete={(value) => {
                const updated = { ...localAnswer, value_numerical_box: value };
                setLocalAnswer(updated);
                onAnswerChange(question.id, updated);
              }}
              minimumTrackTintColor={getCurrentColor()}
              maximumTrackTintColor="#E5E7EB"
              thumbTintColor={getCurrentColor()}
            />

            <View style={styles.scaleLabelsBottom}>
              <View style={styles.scaleLabelContainer}>
                <Text style={styles.scaleLabelValue}>{scaleMin}</Text>
                {question.scale_min_label && (
                  <Text style={[styles.scaleLabelText, { color: '#EF4444' }]}>
                    {question.scale_min_label}
                  </Text>
                )}
              </View>
              <View style={[styles.scaleLabelContainer, { alignItems: 'center' }]}>
                <Text style={styles.scaleLabelValue}>{Math.floor((scaleMin + scaleMax) / 2)}</Text>
                {question.scale_mid_label && (
                  <Text style={[styles.scaleLabelText, { color: '#F59E0B' }]}>
                    {question.scale_mid_label}
                  </Text>
                )}
              </View>
              <View style={[styles.scaleLabelContainer, { alignItems: 'flex-end' }]}>
                <Text style={styles.scaleLabelValue}>{scaleMax}</Text>
                {question.scale_max_label && (
                  <Text style={[styles.scaleLabelText, { color: '#10B981' }]}>
                    {question.scale_max_label}
                  </Text>
                )}
              </View>
            </View>
          </View>
        );

      default:
        return <Text style={styles.unsupportedText}>Tipo de pregunta no soportado</Text>;
    }
  };

  return (
    <View style={styles.cardContainer}>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.progressContainer}>
            <Text style={styles.progressText}>
              {currentIndex + 1} de {totalQuestions}
            </Text>
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressFill, 
                  { width: `${((currentIndex + 1) / totalQuestions) * 100}%` }
                ]} 
              />
            </View>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Feather name="x" size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>

        <ScrollView 
          style={styles.questionScroll} 
          contentContainerStyle={styles.questionScrollContent}
          showsVerticalScrollIndicator={true}
        >
          <Text style={styles.questionTitle}>{question.title}</Text>
          
          {question.description && (
            <Text style={styles.questionDescription}>{question.description}</Text>
          )}

          {question.constr_mandatory && (
            <View style={styles.requiredBadge}>
              <Text style={styles.requiredText}>Obligatorio</Text>
            </View>
          )}

          {renderQuestionInput()}
        </ScrollView>

        <View style={styles.cardFooter}>
          <TouchableOpacity
            style={[styles.navButton, currentIndex === 0 && styles.navButtonDisabled]}
            onPress={onPrev}
            disabled={currentIndex === 0}
          >
            <Feather name="arrow-left" size={20} color={currentIndex === 0 ? '#D1D5DB' : '#64c27b'} />
            <Text style={[styles.navButtonText, currentIndex === 0 && styles.navButtonTextDisabled]}>
              Anterior
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navButton, styles.navButtonPrimary]}
            onPress={handleNextWithValidation}
          >
            <Text style={styles.navButtonTextPrimary}>
              {currentIndex === totalQuestions - 1 ? 'Finalizar' : 'Siguiente'}
            </Text>
            <Feather name={currentIndex === totalQuestions - 1 ? 'check' : 'arrow-right'} size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function SurveyModal({ visible, taskId, surveyId, relationId, onClose, onComplete }) {
  const [loading, setLoading] = useState(true);
  const [survey, setSurvey] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [userInputId, setUserInputId] = useState(null);

  useEffect(() => {
    if (visible && surveyId) {
      loadSurvey();
    }
  }, [visible, surveyId, relationId]);

  const loadSurvey = async () => {
    try {
      setLoading(true);

      // Obtener survey completo con user_input
      const surveys = await SyncService.getSurveysForTask(taskId);
      const surveyData = surveys.find(s => s.id === surveyId);
      
      if (!surveyData) {
        throw new Error('Encuesta no encontrada');
      }

      const questionsData = await SyncService.getSurveyQuestions(surveyId);
      
      if (!questionsData || questionsData.length === 0) {
        throw new Error('No hay preguntas en esta encuesta');
      }
      
      setSurvey(surveyData);
      setQuestions(questionsData);

      const existingInput = await SyncService.getSurveyProgress(taskId, surveyId, relationId);
      
      if (existingInput) {
        setUserInputId(existingInput.id);
        setAnswers(existingInput.answers || {});
        
        const firstUnanswered = questionsData.findIndex(q => {
          const ans = existingInput.answers[q.id];
          return !ans || !checkHasAnswer(q, ans);
        });
        setCurrentQuestionIndex(firstUnanswered >= 0 ? firstUnanswered : 0);
      } else {
        setUserInputId(null);
        setAnswers({});
        setCurrentQuestionIndex(0);
      }
    } catch (error) {
      console.error('Error cargando encuesta:', error);
      Alert.alert('Error', error.message || 'No se pudo cargar la encuesta');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const checkHasAnswer = (question, answer) => {
    if (!answer) return false;
    switch (question.question_type) {
      case 'char_box':
        return answer.value_char_box && answer.value_char_box.trim().length > 0;
      case 'text_box':
        return answer.value_text_box && answer.value_text_box.trim().length > 0;
      case 'numerical_box':
        return answer.value_numerical_box !== undefined && answer.value_numerical_box !== null;
      case 'date':
        return answer.value_date && answer.value_date.length > 0;
      case 'datetime':
        return answer.value_datetime && answer.value_datetime.length > 0;
      case 'simple_choice':
        return answer.value_suggested !== undefined && answer.value_suggested !== null;
      case 'multiple_choice':
        return answer.value_suggested_multiple && answer.value_suggested_multiple.length > 0;
      case 'scale':
        return answer.value_numerical_box !== undefined && answer.value_numerical_box !== null;
      case 'matrix':
        return Object.keys(answer).some(key => key.startsWith('matrix_') && answer[key] === true);
      default:
        return true;
    }
  };

  const handleAnswerChange = async (questionId, answer) => {
    const updatedAnswers = { ...answers, [questionId]: answer };
    setAnswers(updatedAnswers);

    try {
      const savedInput = await SyncService.saveSurveyProgress(
        taskId, 
        surveyId, 
        updatedAnswers, 
        userInputId,
        relationId
      );
      
      if (!userInputId && savedInput && savedInput.id) {
        setUserInputId(savedInput.id);
      }
    } catch (error) {
      console.error('Error guardando progreso:', error);
    }
  };

  const handleNext = async () => {
    if (currentQuestionIndex === questions.length - 1) {
      await handleComplete();
    } else {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const handlePrev = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const handleComplete = async () => {
    try {
      const unansweredRequired = questions.filter(q => {
        if (!q.constr_mandatory) return false;
        const answer = answers[q.id];
        return !checkHasAnswer(q, answer);
      });

      if (unansweredRequired.length > 0) {
        Alert.alert(
          'Encuesta incompleta',
          `Faltan ${unansweredRequired.length} pregunta(s) obligatoria(s) por responder`
        );
        return;
      }

      setLoading(true);

      await SyncService.completeSurvey(taskId, surveyId, answers, userInputId, relationId);

      Alert.alert('✓ Encuesta completada', 'Las respuestas se han guardado correctamente');
      
      if (onComplete) onComplete();
      onClose();
    } catch (error) {
      console.error('Error completando encuesta:', error);
      Alert.alert('Error', 'No se pudo completar la encuesta');
    } finally {
      setLoading(false);
    }
  };

  const handleBackdropPress = () => {
    Alert.alert(
      'Cerrar encuesta',
      'Tu progreso se ha guardado. ¿Deseas salir?',
      [
        { text: 'Continuar', style: 'cancel' },
        { text: 'Salir', style: 'destructive', onPress: onClose },
      ]
    );
  };

  if (!visible) return null;

  if (loading) {
    return (
      <Modal visible={visible} transparent animationType="fade">
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#64c27b" />
          <Text style={styles.loadingText}>Cargando encuesta...</Text>
        </View>
      </Modal>
    );
  }

  if (questions.length === 0) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={handleBackdropPress}>
        <TouchableWithoutFeedback onPress={handleBackdropPress}>
          <View style={styles.overlay}>
            <TouchableWithoutFeedback>
              <View style={styles.cardContainer}>
                <View style={[styles.card, { padding: 20, alignItems: 'center' }]}>
                  <Feather name="info" size={30} color="#F59E0B" style={{ marginBottom: 10 }} />
                  <Text style={styles.questionTitle}>Encuesta sin preguntas</Text>
                  <Text style={styles.questionDescription}>
                    Esta encuesta ({survey?.title || 'sin título'}) aún no tiene preguntas asignadas.
                  </Text>
                  <TouchableOpacity 
                    style={[styles.navButton, styles.navButtonPrimary, { marginTop: 20 }]} 
                    onPress={handleBackdropPress}
                  >
                    <Text style={styles.navButtonTextPrimary}>Cerrar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];
  const currentAnswer = answers[currentQuestion?.id];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleBackdropPress}>
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View>
              {currentQuestion && (
                <QuestionCard
                  question={currentQuestion}
                  answer={currentAnswer}
                  onAnswerChange={handleAnswerChange}
                  currentIndex={currentQuestionIndex}
                  totalQuestions={questions.length}
                  onPrev={handlePrev}
                  onNext={handleNext}
                  onClose={handleBackdropPress}
                />
              )}
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorText: {
    fontSize: 16,
    color: '#EF4444',
    marginTop: 16,
    textAlign: 'center',
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
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  progressContainer: {
    flex: 1,
    marginRight: 12,
  },
  progressText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#64c27b',
  },
  closeButton: {
    padding: 4,
  },
  questionScroll: {
    maxHeight: SCREEN_HEIGHT * 0.55,
  },
  questionScrollContent: {
    padding: 20,
  },
  questionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
    lineHeight: 24,
  },
  questionDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
    lineHeight: 20,
  },
  requiredBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEF2F2',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginBottom: 16,
  },
  requiredText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EF4444',
    textTransform: 'uppercase',
  },
  textInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#111827',
  },
  textArea: {
    height: 120,
    textAlignVertical: 'top',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
  },
  datePickerTextContainer: {
    flex: 1,
    marginLeft: 10,
  },
  dateButtonText: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  dateButtonTime: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  choicesScroll: {
    maxHeight: SCREEN_HEIGHT * 0.35,
  },
  choicesContainer: {
    gap: 10,
  },
  choiceOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 14,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  choiceOptionSelected: {
    backgroundColor: '#f0fdf4',
    borderColor: '#64c27b',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  radioSelected: {
    borderColor: '#64c27b',
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#64c27b',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxSelected: {
    backgroundColor: '#64c27b',
    borderColor: '#64c27b',
  },
  choiceText: {
    flex: 1,
    fontSize: 15,
    color: '#374151',
    fontWeight: '500',
  },
  choiceTextSelected: {
    color: '#15803d',
    fontWeight: '600',
  },
  matrixScroll: {
    maxHeight: SCREEN_HEIGHT * 0.45,
  },
  matrixContainer: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  matrixHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 2,
    borderBottomColor: '#D1D5DB',
  },
  matrixHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
  },
  matrixRowHeader: {
    width: 100,
    paddingRight: 8,
    justifyContent: 'center',
  },
  matrixColHeaderContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  matrixColHeader: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6B7280',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  matrixRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    minHeight: 56,
  },
  matrixRowText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '500',
    lineHeight: 16,
  },
  matrixOptions: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  matrixOption: {
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scaleContainer: {
    gap: 24,
    paddingVertical: 8,
  },
  scaleValueContainer: {
    alignItems: 'center',
    gap: 12,
  },
  scaleValueBadge: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  scaleValueText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
  },
  scaleCurrentLabel: {
    fontSize: 18,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  scaleLabelsBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  scaleLabelContainer: {
    flex: 1,
    gap: 4,
  },
  scaleLabelValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
  },
  scaleLabelText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  unsupportedText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingVertical: 20,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    gap: 12,
  },
  navButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 8,
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  navButtonPrimary: {
    backgroundColor: '#64c27b',
    borderColor: '#64c27b',
  },
  navButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64c27b',
  },
  navButtonTextDisabled: {
    color: '#D1D5DB',
  },
  navButtonTextPrimary: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  webButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f0fdf4',
    marginRight: 4,
  },
  webButtonDisabled: {
    backgroundColor: '#F3F4F6',
    opacity: 0.6,
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFBEB',
    borderBottomWidth: 1,
    borderBottomColor: '#FCD34D',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  offlineBannerText: {
    fontSize: 12,
    color: '#B45309',
    fontWeight: '500',
    flex: 1,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  webButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f0fdf4',
    marginRight: 4,
  },
  webButtonDisabled: {
    backgroundColor: '#F3F4F6',
    opacity: 0.6,
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFBEB',
    borderBottomWidth: 1,
    borderBottomColor: '#FCD34D',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  offlineBannerText: {
    fontSize: 12,
    color: '#B45309',
    fontWeight: '500',
    flex: 1,
  },
});