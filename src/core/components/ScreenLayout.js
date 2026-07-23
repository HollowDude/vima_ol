import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ToastContainer from './ToastContainer';
import SlideMenu from './SlideMenu';
import BottomActionBar from './BottomActionBar';
import useSyncActions from '../hooks/useSyncActions';

export default function ScreenLayout({
  userData, username, onLogout,
  menuVisible, setMenuVisible,
  onNavigateToSyncHistory,
  onUnauthorized = () => {},
  moduleName,
  onAdd,
  addIcon,
  children,
}) {
  const { syncAll, syncModule } = useSyncActions(onUnauthorized);

  return (
    <SafeAreaProvider style={styles.safeArea}>
      <View style={styles.container}>
        <ToastContainer />
        <SlideMenu
          visible={menuVisible}
          onClose={() => setMenuVisible(false)}
          userData={userData}
          username={username}
          onLogout={onLogout}
          onNavigateToSyncHistory={() => {
            setMenuVisible(false);
            onNavigateToSyncHistory?.();
          }}
        />
        <BottomActionBar
          onMenu={() => setMenuVisible(true)}
          onSync={moduleName ? () => syncModule(moduleName) : () => syncAll()}
          onSyncLongPress={() => syncAll()}
          onAdd={onAdd}
          addIcon={addIcon}
        />
        {children}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea:  { flex: 1, backgroundColor: '#f5f0ebff' },
  container: { flex: 1 },
});