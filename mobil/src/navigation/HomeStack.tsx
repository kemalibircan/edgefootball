import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import type {HomeStackParamList} from './types';
import {HomeScreen} from '../screens/home/HomeScreen';
import {FixtureDetailScreen} from '../screens/home/FixtureDetailScreen';
import {ProfileScreen} from '../screens/profile/ProfileScreen';
import {LoginScreen} from '../screens/auth/LoginScreen';
import {RegisterScreen} from '../screens/auth/RegisterScreen';
import {ForgotPasswordScreen} from '../screens/auth/ForgotPasswordScreen';
import {useAppTheme} from '../theme/useAppTheme';

const Stack = createNativeStackNavigator<HomeStackParamList>();

export function HomeStack() {
  const {colors} = useAppTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShadowVisible: false,
        headerTitle: '',
        headerTitleStyle: {fontWeight: '700', color: colors.text},
        headerTintColor: colors.text,
        headerStyle: {backgroundColor: colors.background},
        animation: 'slide_from_right',
        contentStyle: {backgroundColor: colors.background},
      }}>
      <Stack.Screen name="Home" component={HomeScreen} options={{headerShown: false}} />
      <Stack.Screen name="FixtureDetail" component={FixtureDetailScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="Login" component={LoginScreen} options={{headerShown: false}} />
      <Stack.Screen name="Register" component={RegisterScreen} options={{headerShown: false}} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{headerShown: false}} />
    </Stack.Navigator>
  );
}
