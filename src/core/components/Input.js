import React from 'react';
import { TextInput, StyleSheet, View, Text } from 'react-native';

export default function Input({ 
  label, 
  value, 
  onChangeText, 
  placeholder,
  secureTextEntry,
  error,
  ...props 
}) {
  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        style={[
          styles.input,
          error && styles.inputError
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        secureTextEntry={secureTextEntry}
        {...props}
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 6,
    fontWeight: '500',
  },
  input: {
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#0B1B2A',
  },
  inputError: {
    borderColor: '#bb2525',
  },
  errorText: {
    fontSize: 12,
    color: '#bb2525',
    marginTop: 4,
  },
});