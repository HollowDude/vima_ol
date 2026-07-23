import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

const CONFIG = {
  client: {
    label: 'Cliente',
    color: '#64c27b',
    bgColor: '#f0fdf4',
    icon: 'users',
  },
  lead: {
    label: 'Oportunidad',
    color: '#3B82F6',
    bgColor: '#EFF6FF',
    icon: 'trending-up',
  },
};

export default function ContactTypeBadge({ type, compact = false }) {
  const cfg = CONFIG[type];
  if (!cfg) return null;

  return (
    <View style={[styles.badge, { backgroundColor: cfg.bgColor, borderColor: cfg.color }]}>
      <Feather name={cfg.icon} size={compact ? 10 : 12} color={cfg.color} />
      {!compact && <Text style={[styles.label, { color: cfg.color }]}>{cfg.label}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
});
