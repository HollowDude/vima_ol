import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';

// Definimos una altura fija para cada item de hora/minuto para calcular el scroll
const ITEM_HEIGHT = 50;

export default function SimpleDateTimePicker({ 
  visible, 
  onClose, 
  selectedDate, 
  onConfirm,
  minDate,
  maxDate,
  mode = 'datetime' // 'date' o 'datetime'
}) {
  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const [currentMonth, setCurrentMonth] = React.useState(selectedDate.getMonth());
  const [currentYear, setCurrentYear] = React.useState(selectedDate.getFullYear());
  const [tempSelectedDate, setTempSelectedDate] = React.useState(new Date(selectedDate));
  const [selectedHour, setSelectedHour] = React.useState(selectedDate.getHours());
  const [selectedMinute, setSelectedMinute] = React.useState(selectedDate.getMinutes());

  // Referencias para hacer scroll automático a la hora seleccionada
  const hourScrollRef = useRef(null);
  const minuteScrollRef = useRef(null);

  React.useEffect(() => {
    if (visible) {
      const date = new Date(selectedDate);
      setCurrentMonth(date.getMonth());
      setCurrentYear(date.getFullYear());
      setTempSelectedDate(new Date(date));
      setSelectedHour(date.getHours());
      setSelectedMinute(date.getMinutes());
    }
  }, [visible, selectedDate]);

  // Efecto para posicionar el scroll en la hora correcta al abrir
  useEffect(() => {
    if (visible && mode === 'datetime') {
      setTimeout(() => {
        if (hourScrollRef.current) {
          hourScrollRef.current.scrollTo({
            y: selectedHour * ITEM_HEIGHT,
            animated: true
          });
        }
        if (minuteScrollRef.current) {
          minuteScrollRef.current.scrollTo({
            y: selectedMinute * ITEM_HEIGHT,
            animated: true
          });
        }
      }, 300); // Pequeño delay para asegurar que el modal renderizó
    }
  }, [visible, mode]);

  const getDaysInMonth = (month, year) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (month, year) => {
    return new Date(year, month, 1).getDay();
  };

  const goToPreviousMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const handleDayPress = (day) => {
    const newDate = new Date(currentYear, currentMonth, day, selectedHour, selectedMinute);
    
    if (minDate) {
      const minDateTime = new Date(minDate);
      if (newDate < minDateTime) return;
    }
    
    if (maxDate) {
      const maxDateTime = new Date(maxDate);
      if (newDate > maxDateTime) return;
    }
    
    setTempSelectedDate(newDate);
  };

  const handleHourChange = (hour) => {
    const newDate = new Date(tempSelectedDate);
    newDate.setHours(hour);
    
    if (minDate && newDate < minDate) return;
    if (maxDate && newDate > maxDate) return;
    
    setSelectedHour(hour);
    setTempSelectedDate(newDate);
  };

  const handleMinuteChange = (minute) => {
    const newDate = new Date(tempSelectedDate);
    newDate.setMinutes(minute);
    
    if (minDate && newDate < minDate) return;
    if (maxDate && newDate > maxDate) return;
    
    setSelectedMinute(minute);
    setTempSelectedDate(newDate);
  };

  const handleConfirm = () => {
    const finalDate = new Date(
      tempSelectedDate.getFullYear(),
      tempSelectedDate.getMonth(),
      tempSelectedDate.getDate(),
      selectedHour,
      selectedMinute,
      0,
      0
    );
    onConfirm(finalDate);
    onClose();
  };

  const isDateDisabled = (day) => {
    const date = new Date(currentYear, currentMonth, day, 0, 0, 0, 0);
    
    if (minDate) {
      const minDateOnly = new Date(minDate);
      minDateOnly.setHours(0, 0, 0, 0);
      if (date < minDateOnly) return true;
    }
    
    if (maxDate) {
      const maxDateOnly = new Date(maxDate);
      maxDateOnly.setHours(23, 59, 59, 999);
      if (date > maxDateOnly) return true;
    }
    
    return false;
  };

  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth(currentMonth, currentYear);
    const firstDay = getFirstDayOfMonth(currentMonth, currentYear);
    const days = [];

    for (let i = 0; i < firstDay; i++) {
      days.push(<View key={`empty-${i}`} style={styles.emptyDay} />);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const isDisabled = isDateDisabled(day);
      const isSelected = 
        tempSelectedDate.getDate() === day &&
        tempSelectedDate.getMonth() === currentMonth &&
        tempSelectedDate.getFullYear() === currentYear;
      
      const isToday = 
        new Date().getDate() === day &&
        new Date().getMonth() === currentMonth &&
        new Date().getFullYear() === currentYear;

      days.push(
        <TouchableOpacity
          key={day}
          style={[
            styles.day,
            isSelected && styles.selectedDay,
            isDisabled && styles.disabledDay,
            isToday && !isSelected && styles.today,
          ]}
          onPress={() => !isDisabled && handleDayPress(day)}
          disabled={isDisabled}
        >
          <Text
            style={[
              styles.dayText,
              isSelected && styles.selectedDayText,
              isDisabled && styles.disabledDayText,
              isToday && !isSelected && styles.todayText,
            ]}
          >
            {day}
          </Text>
        </TouchableOpacity>
      );
    }

    return days;
  };

  const renderTimePicker = () => {
    if (mode !== 'datetime') return null;

    const hours = Array.from({ length: 24 }, (_, i) => i);
    const minutes = Array.from({ length: 60 }, (_, i) => i);

    return (
      <View style={styles.timePickerContainer}>
        <Text style={styles.timePickerTitle}>Seleccionar Hora</Text>
        <View style={styles.timePickerRow}>
          
          {/* Columna de Horas */}
          <View style={styles.timeColumnContainer}>
            <Text style={styles.timeLabel}>Hora</Text>
            <View style={styles.scrollWrapper}>
              <ScrollView 
                ref={hourScrollRef}
                style={styles.timeScroll} 
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled={true} // CRUCIAL para que funcione dentro del Modal
                contentContainerStyle={styles.timeScrollContent}
              >
                {hours.map((hour) => (
                  <TouchableOpacity
                    key={hour}
                    style={[
                      styles.timeOption,
                      selectedHour === hour && styles.timeOptionSelected,
                    ]}
                    onPress={() => handleHourChange(hour)}
                  >
                    <Text
                      style={[
                        styles.timeOptionText,
                        selectedHour === hour && styles.timeOptionTextSelected,
                      ]}
                    >
                      {String(hour).padStart(2, '0')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>

          <Text style={styles.timeSeparator}></Text>

          {/* Columna de Minutos */}
          <View style={styles.timeColumnContainer}>
            <Text style={styles.timeLabel}>Minuto</Text>
            <View style={styles.scrollWrapper}>
              <ScrollView 
                ref={minuteScrollRef}
                style={styles.timeScroll} 
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled={true} // CRUCIAL para que funcione dentro del Modal
                contentContainerStyle={styles.timeScrollContent}
              >
                {minutes.map((minute) => (
                  <TouchableOpacity
                    key={minute}
                    style={[
                      styles.timeOption,
                      selectedMinute === minute && styles.timeOptionSelected,
                    ]}
                    onPress={() => handleMinuteChange(minute)}
                  >
                    <Text
                      style={[
                        styles.timeOptionText,
                        selectedMinute === minute && styles.timeOptionTextSelected,
                      ]}
                    >
                      {String(minute).padStart(2, '0')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {mode === 'datetime' ? 'Fecha y Hora' : 'Seleccionar Fecha'}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Feather name="x" size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.monthSelector}>
              <TouchableOpacity onPress={goToPreviousMonth} style={styles.arrowButton}>
                <Feather name="chevron-left" size={24} color="#64c27b" />
              </TouchableOpacity>
              
              <Text style={styles.monthText}>
                {months[currentMonth]} {currentYear}
              </Text>
              
              <TouchableOpacity onPress={goToNextMonth} style={styles.arrowButton}>
                <Feather name="chevron-right" size={24} color="#64c27b" />
              </TouchableOpacity>
            </View>

            <View style={styles.weekDays}>
              {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((day, i) => (
                <Text key={i} style={styles.weekDay}>{day}</Text>
              ))}
            </View>

            <View style={styles.calendar}>
              {renderCalendar()}
            </View>

            {renderTimePicker()}

            <View style={styles.footer}>
              <Text style={styles.selectedText}>
                {mode === 'datetime' 
                  ? tempSelectedDate.toLocaleString('es-ES', {
                      weekday: 'long',
                      day: '2-digit',
                      month: 'long',
                      hour: '2-digit',
                      minute: '2-digit'
                    })
                  : tempSelectedDate.toLocaleDateString('es-ES', { dateStyle: 'long' })
                }
              </Text>
              <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
                <Text style={styles.confirmButtonText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  container: {
    width: '90%',
    maxWidth: 400,
    maxHeight: '90%', // Ligeramente más alto
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  closeButton: {
    padding: 4,
  },
  monthSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  arrowButton: {
    padding: 8,
  },
  monthText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
  },
  weekDays: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 10,
  },
  weekDay: {
    width: 40,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  calendar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 20,
  },
  day: {
    width: '14.28%',
    aspectRatio: 1.3,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    paddingBottom: 6
  },
  emptyDay: {
    width: '14.28%',
    aspectRatio: 1,
  },
  selectedDay: {
    backgroundColor: '#64c27b',
  },
  today: {
    backgroundColor: '#E8F5E9',
  },
  disabledDay: {
    opacity: 0.3,
  },
  dayText: {
    fontSize: 15,
    color: '#1F2937',
  },
  selectedDayText: {
    color: '#fff',
    fontWeight: '700',
  },
  todayText: {
    color: '#64c27b',
    fontWeight: '600',
  },
  disabledDayText: {
    color: '#D1D5DB',
  },
  timePickerContainer: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 16,
    marginBottom: 20,
  },
  timePickerTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
    textAlign: 'center',
  },
  timePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 200, // Altura fija para el contenedor de tiempo
  },
  timeColumnContainer: {
    alignItems: 'center',
    flex: 1,
  },
  timeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
  },
  scrollWrapper: {
    height: 180, // Altura visible de la lista
    width: '100%',
    alignItems: 'center',
    backgroundColor: '#F9FAFB', // Fondo sutil para distinguir el área de scroll
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  timeScroll: {
    width: '100%',
  },
  timeScrollContent: {
    paddingVertical: 65, // Padding para centrar la primera/última opción visualmente
    alignItems: 'center',
  },
  timeOption: {
    height: ITEM_HEIGHT, // Altura fija para clickear mejor
    width: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeOptionSelected: {
    backgroundColor: '#64c27b',
    borderRadius: 8,
    width: '80%', // Que no ocupe todo el ancho para verse mejor
  },
  timeOptionText: {
    fontSize: 16,
    color: '#6B7280',
  },
  timeOptionTextSelected: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 18,
  },
  timeSeparator: {
    fontSize: 24,
    fontWeight: '700',
    color: '#64c27b',
    marginHorizontal: 10,
    paddingBottom: 20, // Ajuste visual por el título de columna
  },
  footer: {
    gap: 12,
    marginTop: 10,
  },
  selectedText: {
    fontSize: 14,
    color: '#64c27b',
    fontWeight: '600',
    textAlign: 'center',
    textTransform: 'capitalize',
  },
  confirmButton: {
    backgroundColor: '#64c27b',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});