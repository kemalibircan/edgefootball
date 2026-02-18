import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import type {AuthStackParamList} from './types';
import {WelcomeScreen} from '../screens/auth/WelcomeScreen';
import {LoginScreen} from '../screens/auth/LoginScreen';
import {RegisterScreen} from '../screens/auth/RegisterScreen';
import {ForgotPasswordScreen} from '../screens/auth/ForgotPasswordScreen';
import {useAppTheme} from '../theme/useAppTheme';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthStack() {
  const {colors} = useAppTheme();

  return (
    <Stack.Navigator
      initialRouteName="Welcome"
      screenOptions={{
        headerShadowVisible: false,
        headerTitleStyle: {fontWeight: '700', color: colors.text},
        headerTintColor: colors.text,
        headerStyle: {backgroundColor: colors.background},
        contentStyle: {backgroundColor: colors.background},
        animation: 'fade_from_bottom',
        animationDuration: 260,
      }}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} options={{headerShown: false, animation: 'fade_from_bottom', animationDuration: 320}} />
      <Stack.Screen name="Login" component={LoginScreen} options={{headerShown: false }}/>
      <Stack.Screen name="Register" component={RegisterScreen} options={{animation: 'slide_from_right', animationDuration: 280,headerShown:false}} />
      <Stack.Screen
        name="ForgotPassword"
        component={ForgotPasswordScreen}
        options={{animation: 'slide_from_right', animationDuration: 280,headerShown:false}}
      />
    </Stack.Navigator>
  );
}
