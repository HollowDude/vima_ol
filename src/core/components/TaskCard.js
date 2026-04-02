import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';

export default function TaskCard({ task, onPress, style, priorityLevel, isDone }) {
  const getBorderColor = () => {
      if (isDone) return '#9CA3AF'; 
      if (priorityLevel === 'alta') return '#EF4444';
      if (priorityLevel === 'media') return '#F59E0B';
      return '#3B82F6'; 
  };

  return (
    <TouchableOpacity style={[styles.container, { borderLeftColor: getBorderColor() }, style]} 
      onPress={onPress}
      activeOpacity={0.8}
    >
      {isDone && (
        <View style={styles.doneIndicator}>
          <Feather name="check-circle" size={12} color="#10B981" />
        </View>
      )}
      
      <Text style={[styles.title, isDone && styles.titleDone]} numberOfLines={2}>
        {task.display_name || task.name}
      </Text>
      
      {task.partner_id && (
        <Text style={[styles.client, isDone && styles.clientDone]} numberOfLines={1}>
          {Array.isArray(task.partner_id) ? task.partner_id[1] : task.partner_id}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 6,
    padding: 8,
    borderLeftWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  doneIndicator: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
  title: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0B1B2A',
    marginBottom: 2,
  },
  titleDone: {
    textDecorationLine: 'line-through',
    color: '#9CA3AF',
  },
  client: {
    fontSize: 10,
    color: '#6B7280',
  },
  clientDone: {
    color: '#D1D5DB',
  },
});