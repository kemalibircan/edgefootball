import React from 'react';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import Ionicons from 'react-native-vector-icons/Ionicons';
import type {MainTabParamList} from './types';
import {HomeStack} from './HomeStack';
import {CouponsScreen} from '../screens/coupon/CouponsScreen';
import {SavedCouponsScreen} from '../screens/coupon/SavedCouponsScreen';
import {ChatScreen} from '../screens/chat/ChatScreen';
import {useAppTheme} from '../theme/useAppTheme';

const Tab = createBottomTabNavigator<MainTabParamList>();

const ICON_MAP: Record<keyof MainTabParamList, {active: string; inactive: string}> = {
  HomeTab: {active: 'football', inactive: 'football-outline'},
  Coupons: {active: 'ticket', inactive: 'ticket-outline'},
  SavedCoupons: {active: 'albums', inactive: 'albums-outline'},
  Chat: {active: 'chatbubble', inactive: 'chatbubble-outline'},
};

export function MainTabs() {
  const {colors} = useAppTheme();

  return (
    <Tab.Navigator
      screenOptions={({route}) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: colors.backgroundElevated,
          borderTopColor: colors.line,
          height: 72,
          paddingBottom: 8,
          paddingTop: 8,
          elevation: 0,
        },
        tabBarIcon: ({color, size, focused}) => (
          <Ionicons name={focused ? ICON_MAP[route.name].active : ICON_MAP[route.name].inactive} color={color} size={size} />
        ),
      })}>
      <Tab.Screen name="HomeTab" component={HomeStack} />
      <Tab.Screen name="Coupons" component={CouponsScreen} />
      <Tab.Screen name="SavedCoupons" component={SavedCouponsScreen} />
      <Tab.Screen name="Chat" component={ChatScreen} />
    </Tab.Navigator>
  );
}
