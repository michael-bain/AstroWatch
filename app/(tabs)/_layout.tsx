import { useState, useEffect } from 'react';
import { Tabs } from 'expo-router';
import { Text, View, Modal, StyleSheet } from 'react-native';
import { LocationProvider } from '@/contexts/LocationContext';
import { useLocation } from '@/contexts/LocationContext';
import LocationModal from '@/components/LocationModal';
import { Sun, Moon } from 'lucide-react-native';

// unmountOnBlur is valid at runtime but missing from the Expo Router type shim
const unmountScreen = { unmountOnBlur: true } as object;

function LoadingScreen() {
  const { isLoading } = useLocation();
  return (
    <Modal visible={isLoading} animationType="none" transparent={false} statusBarTranslucent>
      <View style={ls.container}>
        <Text style={ls.title}>AstroWatch</Text>
      </View>
    </Modal>
  );
}

const ls = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#000',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 2,
  },
});

function FirstRunGate() {
  const { place, isLoading } = useLocation();
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    if (!isLoading && !place) {
      setModalVisible(true);
    }
  }, [isLoading, place]);

  // Close only after a place is selected (LocationModal enforces this via firstRun prop)
  useEffect(() => {
    if (place && modalVisible) {
      setModalVisible(false);
    }
  }, [place]);

  return (
    <LocationModal
      visible={modalVisible}
      onClose={() => setModalVisible(false)}
      firstRun
    />
  );
}

export default function TabLayout() {
  return (
    <LocationProvider>
      <LoadingScreen />
      <FirstRunGate />
      <Tabs
        screenOptions={{
          headerShown: false,
          // E-ink: disable all transitions so switching is instant with no ghosting
          animation: 'none',
          lazy: true,
          sceneStyle: { backgroundColor: '#fff' },
          tabBarStyle: {
            backgroundColor: '#fff',
            borderTopWidth: 3,
            borderTopColor: '#000',
            height: 74,
            paddingBottom: 0,
            paddingTop: 0,
            elevation: 0,
          },
          tabBarItemStyle: {
            paddingTop: 8,
            paddingBottom: 10,
          },
          tabBarActiveTintColor: '#000',
          tabBarInactiveTintColor: '#000',
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'SKY',
            ...unmountScreen,
            tabBarIcon: ({ focused }) => (
              <Sun size={30} color="#000" strokeWidth={focused ? 3 : 1.5} />
            ),
            tabBarLabel: ({ focused }) => (
              <Text style={{ fontSize: 13, letterSpacing: 1.5, fontWeight: focused ? '800' : '400', color: '#000' }}>
                SKY
              </Text>
            ),
          }}
        />
        <Tabs.Screen
          name="night"
          options={{
            title: 'MOON',
            ...unmountScreen,
            tabBarIcon: ({ focused }) => (
              <Moon size={30} color="#000" strokeWidth={focused ? 3 : 1.5} />
            ),
            tabBarLabel: ({ focused }) => (
              <Text style={{ fontSize: 13, letterSpacing: 1.5, fontWeight: focused ? '800' : '400', color: '#000' }}>
                MOON
              </Text>
            ),
          }}
        />
      </Tabs>
    </LocationProvider>
  );
}
