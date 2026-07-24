import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import ContactTypeBadge from './ContactTypeBadge';

export default function ContactPickerModal({
  visible,
  title = 'Seleccionar Contacto',
  clients = [],
  leads = [],
  onSelect,
  onClose,
  isOnline = true,
}) {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('clients');

  useEffect(() => {
    if (visible) {
      setSearch('');
      setActiveTab('clients');
    }
  }, [visible]);

  const displayedItems = useMemo(() => {
    const source = activeTab === 'clients' ? clients : leads;
    let items = source.map(item => ({
      key: `${activeTab === 'clients' ? 'client' : 'lead'}-${item.id}`,
      type: activeTab === 'clients' ? 'client' : 'lead',
      id: item.id,
      name: item.name,
      subtitle: activeTab === 'clients'
        ? (item.email || item.phone || item.mobile || '')
        : (item.email_from || item.phone || item.mobile || ''),
      raw: item,
      disabled: activeTab === 'leads'
        && !Array.isArray(item.partner_id)
        && !isOnline,
      disabledReason: activeTab === 'leads'
        && !Array.isArray(item.partner_id)
        && !isOnline
        ? 'Sin contacto vinculado — requiere conexión'
        : null,
    }));
    if (search.trim()) {
      const lower = search.toLowerCase();
      items = items.filter(item => item.name.toLowerCase().includes(lower));
    }
    return items;
  }, [activeTab, clients, leads, search, isOnline]);

  const handleSelect = (item) => {
    if (item.disabled) return;
    const selected = { type: item.type, id: item.id, raw: item.raw, name: item.name };
    onSelect(selected);
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.item, item.disabled && styles.itemDisabled]}
      onPress={() => handleSelect(item)}
      activeOpacity={item.disabled ? 1 : 0.7}
    >
      <View style={styles.itemLeft}>
        <View style={styles.itemInfo}>
          <View style={styles.itemNameRow}>
            <Text style={[styles.itemName, item.disabled && styles.itemNameDisabled]} numberOfLines={1}>
              {item.name}
            </Text>
            <ContactTypeBadge type={item.type} compact />
          </View>
          {item.subtitle ? (
            <Text style={styles.itemSubtitle} numberOfLines={1}>{item.subtitle}</Text>
          ) : null}
          {item.disabledReason ? (
            <Text style={styles.itemDisabledReason}>{item.disabledReason}</Text>
          ) : null}
        </View>
      </View>
      {!item.disabled && <Feather name="chevron-right" size={18} color="#D1D5DB" />}
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
        >
          <View style={styles.content}>
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Feather name="x" size={24} color="#374151" />
              </TouchableOpacity>
            </View>

            <View style={styles.segmentedControl}>
              <TouchableOpacity
                style={[styles.segment, activeTab === 'clients' && styles.segmentActive]}
                onPress={() => { setActiveTab('clients'); setSearch(''); }}
              >
                <Text style={[styles.segmentText, activeTab === 'clients' && styles.segmentTextActive]}>
                  Cliente
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segment, activeTab === 'leads' && styles.segmentActive]}
                onPress={() => { setActiveTab('leads'); setSearch(''); }}
              >
                <Text style={[styles.segmentText, activeTab === 'leads' && styles.segmentTextActive]}>
                  Oportunidad
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.searchContainer}>
              <Feather name="search" size={20} color="#9CA3AF" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder={activeTab === 'clients' ? 'Buscar clientes...' : 'Buscar oportunidades...'}
                value={search}
                onChangeText={setSearch}
                autoFocus={false}
                placeholderTextColor="#9CA3AF"
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')}>
                  <Feather name="x" size={18} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            </View>

            <FlatList
              data={displayedItems}
              keyExtractor={(item) => item.key}
              renderItem={renderItem}
              style={styles.list}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text style={styles.emptyText}>
                  {search
                    ? 'No se encontraron contactos con ese nombre'
                    : activeTab === 'clients'
                      ? 'No hay clientes disponibles'
                      : 'No hay oportunidades disponibles'}
                </Text>
              }
            />
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  content: {
    backgroundColor: '#fff',
    borderRadius: 16,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  closeButton: { padding: 4 },
  segmentedControl: {
    flexDirection: 'row',
    margin: 16,
    marginBottom: 0,
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    padding: 3,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  segmentActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  segmentTextActive: {
    color: '#111827',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    margin: 16,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1F2937',
  },
  list: {
    paddingHorizontal: 16,
    maxHeight: 400,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    borderRadius: 8,
    marginBottom: 2,
  },
  itemDisabled: {
    opacity: 0.55,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  itemInfo: { flex: 1 },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemName: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '500',
    flexShrink: 1,
  },
  itemNameDisabled: { color: '#9CA3AF' },
  itemSubtitle: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  itemDisabledReason: {
    fontSize: 11,
    color: '#F59E0B',
    fontWeight: '600',
    marginTop: 2,
  },
  emptyText: {
    textAlign: 'center',
    color: '#9CA3AF',
    marginTop: 30,
    marginBottom: 30,
    fontSize: 14,
  },
});
