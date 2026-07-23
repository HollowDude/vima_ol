import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSyncContext } from '../context/SyncContext';

export default function BottomActionBar({
  onMenu,
  onSync,
  onSyncLongPress,
  onAdd,
  addIcon = 'plus',
}) {
  const { isSyncing } = useSyncContext();

  const color = isSyncing ? '#e8a83e' : '#64c27b';

  return (
    <View style={styles.container} pointerEvents="box-none">
      {onAdd && (
        <TouchableOpacity
          style={[styles.button, { backgroundColor: color }]}
          onPress={onAdd}
          activeOpacity={0.8}
          disabled={isSyncing}
        >
          <Feather name={addIcon} size={20} color="#fff" />
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[styles.button, { backgroundColor: color }]}
        onPress={onSync}
        onLongPress={onSyncLongPress}
        delayLongPress={500}
        activeOpacity={0.8}
        disabled={isSyncing}
      >
        <Feather name="refresh-cw" size={20} color="#fff" />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, { backgroundColor: color }]}
        onPress={onMenu}
        activeOpacity={0.8}
      >
        <Feather name="menu" size={20} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 60,
    left: 16,
    zIndex: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  button: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 4,
    elevation: 6,
  },
});
