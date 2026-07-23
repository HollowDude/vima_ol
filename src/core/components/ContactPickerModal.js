import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import ContactTypeBadge from './ContactTypeBadge';

const CLIENT_PREFIX = 'client-';
const LEAD_PREFIX = 'lead-';

function makeKey(type, id) {
  return `${type}-${id}`;
}

function parseKey(key) {
  if (key.startsWith(CLIENT_PREFIX)) return { type: 'client', id: parseInt(key.replace(CLIENT_PREFIX, ''), 10) };
  if (key.startsWith(LEAD_PREFIX)) return { type: 'lead', id: parseInt(key.replace(LEAD_PREFIX, ''), 10) };
  return null;
}

export default function ContactPickerModal({
  visible,
  title = 'Seleccionar Contactos',
  clients = [],
  leads = [],
  selectedKeys = [],
  onConfirm,
  onClose,
}) {
  const [search, setSearch] = useState('');
  const [tempSelected, setTempSelected] = useState(new Set());

  useEffect(() => {
    if (visible) {
      setSearch('');
      setTempSelected(new Set(selectedKeys));
    }
  }, [visible]);

  const allItems = useMemo(() => {
    const items = [];
    for (const c of clients) {
      items.push({ key: makeKey('client', c.id), type: 'client', id: c.id, name: c.name, subtitle: c.email || c.phone || '', raw: c });
    }
    for (const l of leads) {
      items.push({ key: makeKey('lead', l.id), type: 'lead', id: l.id, name: l.name, subtitle: l.email_from || l.phone || '', raw: l });
    }
    return items;
  }, [clients, leads]);

  const clientPartnerIds = useMemo(() => {
    const ids = new Set();
    for (const key of tempSelected) {
      const parsed = parseKey(key);
      if (parsed && parsed.type === 'client') ids.add(parsed.id);
    }
    return ids;
  }, [tempSelected]);

  const filtered = useMemo(() => {
    if (!search.trim()) return allItems;
    const lower = search.toLowerCase();
    return allItems.filter(item => item.name.toLowerCase().includes(lower));
  }, [allItems, search]);

  const isDisabled = (item) => {
    if (item.type === 'lead') {
      const partnerId = Array.isArray(item.raw.partner_id) ? item.raw.partner_id[0] : null;
      return partnerId && clientPartnerIds.has(partnerId);
    }
    return false;
  };

  const getDisabledReason = (item) => {
    if (item.type === 'lead') {
      const partnerId = Array.isArray(item.raw.partner_id) ? item.raw.partner_id[0] : null;
      if (partnerId && clientPartnerIds.has(partnerId)) return 'Ya incluido como cliente';
    }
    return null;
  };

  const toggleItem = (item) => {
    if (isDisabled(item)) return;
    setTempSelected(prev => {
      const next = new Set(prev);
      if (next.has(item.key)) next.delete(item.key);
      else next.add(item.key);
      return next;
    });
  };

  const handleConfirm = () => {
    const selected = [];
    for (const key of tempSelected) {
      const parsed = parseKey(key);
      if (parsed) {
        const found = allItems.find(i => i.key === key);
        if (found) selected.push({ type: parsed.type, id: parsed.id, raw: found.raw, name: found.name });
      }
    }
    onConfirm(selected);
  };

  const renderItem = ({ item }) => {
    const selected = tempSelected.has(item.key);
    const disabled = isDisabled(item);
    const reason = getDisabledReason(item);

    return (
      <TouchableOpacity
        style={[styles.item, selected && styles.itemSelected, disabled && styles.itemDisabled]}
        onPress={() => toggleItem(item)}
        activeOpacity={disabled ? 1 : 0.7}
      >
        <View style={styles.itemLeft}>
          <View style={styles.checkbox}>
            {selected && <Feather name="check" size={14} color="#fff" />}
          </View>
          <View style={styles.itemInfo}>
            <View style={styles.itemNameRow}>
              <Text style={[styles.itemName, disabled && styles.itemNameDisabled]} numberOfLines={1}>
                {item.name}
              </Text>
              <ContactTypeBadge type={item.type} compact />
            </View>
            {item.subtitle ? (
              <Text style={styles.itemSubtitle} numberOfLines={1}>{item.subtitle}</Text>
            ) : null}
            {reason ? (
              <Text style={styles.itemDisabledReason}>{reason}</Text>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

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

            <View style={styles.searchContainer}>
              <Feather name="search" size={20} color="#9CA3AF" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar clientes u oportunidades..."
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
              data={filtered}
              keyExtractor={(item) => item.key}
              renderItem={renderItem}
              style={styles.list}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text style={styles.emptyText}>
                  {search ? 'No se encontraron contactos con ese nombre' : 'No hay clientes ni oportunidades disponibles'}
                </Text>
              }
            />

            <View style={styles.footer}>
              <Text style={styles.footerCount}>
                {tempSelected.size} seleccionado{tempSelected.size !== 1 ? 's' : ''}
              </Text>
              <TouchableOpacity
                style={[styles.confirmButton, tempSelected.size === 0 && styles.confirmButtonDisabled]}
                onPress={handleConfirm}
                disabled={tempSelected.size === 0}
              >
                <Feather name="check" size={16} color="#fff" />
                <Text style={styles.confirmButtonText}>
                  Agregar ({tempSelected.size})
                </Text>
              </TouchableOpacity>
            </View>
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
  closeButton: {
    padding: 4,
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
  searchIcon: {
    marginRight: 8,
  },
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
  itemSelected: {
    backgroundColor: '#F0FDF4',
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
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  itemInfo: {
    flex: 1,
  },
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
  itemNameDisabled: {
    color: '#9CA3AF',
  },
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
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  footerCount: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600',
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#64c27b',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    gap: 6,
  },
  confirmButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
