import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../../modules/Home/screens/HomeScreen';
import TasksScreen from '../../modules/Tasks/screens/TasksScreen';
import ClientsScreen from '../../modules/Clients/screens/ClientsScreen';
import LeadsScreen from '../../modules/Leads/screens/LeadsScreen';
import SyncHistoryScreen from '../../modules/SyncHistory/screens/SyncHistoryScreen';

const Stack = createNativeStackNavigator();

export default function RootNavigator({ sharedProps, onUnauthorized }) {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="Home">
          {(props) => (
            <HomeScreen
              {...sharedProps}
              onNavigateToTasks={() => props.navigation.navigate('Tasks')}
              onNavigateToClients={() => props.navigation.navigate('Clients')}
              onNavigateToLeads={() => props.navigation.navigate('Leads')}
              onNavigateToSyncHistory={() => props.navigation.navigate('SyncHistory')}
              onUnauthorized={onUnauthorized}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="Tasks">
          {(props) => (
            <TasksScreen
              {...sharedProps}
              onBack={() => props.navigation.goBack()}
              onNavigateToLeads={() => props.navigation.navigate('Leads')}
              onNavigateToClients={(clientId) => props.navigation.navigate('Clients', { openClientId: clientId })}
              onNavigateToSyncHistory={() => props.navigation.navigate('SyncHistory')}
              onUnauthorized={onUnauthorized}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="Clients">
          {(props) => (
            <ClientsScreen
              {...sharedProps}
              onBack={() => props.navigation.goBack()}
              onNavigateToSyncHistory={() => props.navigation.navigate('SyncHistory')}
              onUnauthorized={onUnauthorized}
              openClientId={props.route?.params?.openClientId}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="Leads">
          {(props) => (
            <LeadsScreen
              {...sharedProps}
              onBack={() => props.navigation.goBack()}
              onNavigateToTasks={() => props.navigation.navigate('Tasks')}
              onNavigateToSyncHistory={() => props.navigation.navigate('SyncHistory')}
              onUnauthorized={onUnauthorized}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="SyncHistory">
          {(props) => (
            <SyncHistoryScreen
              {...sharedProps}
              onBack={() => props.navigation.goBack()}
              onNavigateToSyncHistory={() => props.navigation.navigate('SyncHistory')}
              onUnauthorized={onUnauthorized}
            />
          )}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}