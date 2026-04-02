import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';

export default function SimpleDatePicker({ 
  visible, 
  onClose, 
  selectedDate, 
  onConfirm,
  minDate 
}) {
  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const [currentMonth, setCurrentMonth] = React.useState(selectedDate.getMonth());
  const [currentYear, setCurrentYear] = React.useState(selectedDate.getFullYear());
  const [tempSelectedDate, setTempSelectedDate] = React.useState(new Date(selectedDate));

  React.useEffect(() => {
    if (visible) {
      setCurrentMonth(selectedDate.getMonth());
      setCurrentYear(selectedDate.getFullYear());
      setTempSelectedDate(new Date(selectedDate));
    }
  }, [visible]);

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
    const newDate = new Date(currentYear, currentMonth, day);
    
    const minDateStart = new Date(minDate);
    minDateStart.setHours(0, 0, 0, 0);
    newDate.setHours(0, 0, 0, 0);
    
    if (newDate < minDateStart) return;
    
    setTempSelectedDate(newDate);
  };

  const handleConfirm = () => {
    onConfirm(tempSelectedDate);
    onClose();
  };

  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth(currentMonth, currentYear);
    const firstDay = getFirstDayOfMonth(currentMonth, currentYear);
    const days = [];

    // Días vacíos antes del primer día
    for (let i = 0; i < firstDay; i++) {
      days.push(<View key={`empty-${i}`} style={styles.emptyDay} />);
    }

    // Días del mes
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentYear, currentMonth, day);
      const minDateStart = new Date(minDate);
      minDateStart.setHours(0, 0, 0, 0);
      date.setHours(0, 0, 0, 0);
      
      const isDisabled = date < minDateStart;
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

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Seleccionar Fecha</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Feather name="x" size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>

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

          <View style={styles.footer}>
            <Text style={styles.selectedText}>
              {tempSelectedDate.toLocaleDateString('es-ES', { dateStyle: 'long' })}
            </Text>
            <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
              <Text style={styles.confirmButtonText}>Confirmar</Text>
            </TouchableOpacity>
          </View>
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
    fontSize: 20,
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
  footer: {
    marginTop: 20,
    gap: 12,
  },
  selectedText: {
    fontSize: 15,
    color: '#64c27b',
    fontWeight: '600',
    textAlign: 'center',
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