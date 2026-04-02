import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';

export default function ClientCard({ client, onPress }) {
  const avatarIcon = client.company_type === 'company' ? 'briefcase' : 'user';
  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.avatar}>
        <Feather name={avatarIcon} size={32} color="#64c27b" />
      </View>

      <View style={styles.content}>
        <Text style={styles.name} numberOfLines={1}>
          {client.name || 'Sin nombre'}
        </Text>
        
        {client.email && (
          <View style={styles.infoRow}>
            <Feather name="mail" size={12} color="#9CA3AF" />
            <Text style={styles.infoText} numberOfLines={1}>
              {client.email}
            </Text>
          </View>
        )}
        
        {(client.phone || client.mobile) && (
          <View style={styles.infoRow}>
            <Feather name="phone" size={12} color="#9CA3AF" />
            <Text style={styles.infoText} numberOfLines={1}>
              {client.mobile || client.phone}
            </Text>
          </View>
        )}
      </View>

      <Feather name="chevron-right" size={20} color="#9CA3AF" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E6E9EF',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f0fdf4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0B1B2A',
    marginBottom: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  infoText: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 6,
  },
});