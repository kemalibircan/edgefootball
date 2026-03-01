import React from 'react';
import {ActivityIndicator, Image, View, Text} from 'react-native';
import {MainTabs} from './MainTabs';
import {useAuthBootstrap} from '../hooks/useAuthBootstrap';
import {useAuthStore} from '../store/authStore';
import {useAppTheme} from '../theme/useAppTheme';

const APP_LOGO = require('../imgs/logo-dark.png');

export function RootNavigator() {
  useAuthBootstrap();
  const {colors} = useAppTheme();

  const isBootstrapping = useAuthStore(state => state.isBootstrapping);

  if (isBootstrapping) {
    return (
      <View style={{flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, gap: 10}}>
        <Image source={APP_LOGO} resizeMode="contain" style={{width: 76, height: 76, borderRadius: 20}} />
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={{marginTop: 12, color: colors.text, fontSize: 16, fontWeight: '700'}}>Edge Football yukleniyor...</Text>
      </View>
    );
  }

  return <MainTabs />;
}
