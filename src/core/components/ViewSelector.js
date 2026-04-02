import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

const VIEW_OPTIONS = [
  { value: 1, label: 'Hoy' },
  { value: 3, label: '3 Días' },
  { value: 7, label: 'Semana' },
];

export default function ViewSelector({ selectedView, onViewChange }) {
  return (
    <View style={styles.container}>
      {VIEW_OPTIONS.map((option) => (
        <TouchableOpacity
          key={option.value}
          style={[
            styles.option,
            selectedView === option.value && styles.optionActive,
          ]}
          onPress={() => onViewChange(option.value)}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.optionText,
              selectedView === option.value && styles.optionTextActive,
            ]}
          >
            {option.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 4,
  },
  option: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  optionActive: {
    backgroundColor: '#64c27b',
  },
  optionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  optionTextActive: {
    color: '#fff',
  },
});