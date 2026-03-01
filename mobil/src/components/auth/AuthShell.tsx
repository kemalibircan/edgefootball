import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
} from 'react-native-reanimated';
import {ScreenContainer} from '../common/ScreenContainer';
import {BrandBackground} from './BrandBackground';
import {colors} from '../../theme/colors';

const APP_LOGO = require('../../imgs/logo-dark.png');

type Props = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  showLogo?: boolean;
  enterDelay?: number;
  contentAlignment?: 'top' | 'center';
  includeTopSafeArea?: boolean;
};

export function AuthShell({
  title,
  subtitle,
  children,
  showLogo = true,
  enterDelay = 0,
  contentAlignment = 'top',
  includeTopSafeArea = true,
}: Props) {

  return (
    <ScreenContainer
      scroll={false}
      includeTopSafeArea={includeTopSafeArea}
      includeBottomSafeArea
      preset="plain"
      disableHorizontalPadding>
      <View style={{flex: 1}}>
        <BrandBackground />

        <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: contentAlignment === 'center' ? 'center' : 'flex-start',
              paddingHorizontal: 20,
              paddingTop: contentAlignment === 'center' ? 32 : 20,
              paddingBottom: 24,
              gap: 16,
            }}>
            <Animated.View
              entering={FadeInDown.delay(enterDelay).duration(420)}
              style={{alignItems: 'center', gap: 10, marginTop: 8}}>
              {showLogo ? (
                <Animated.Image
                  source={APP_LOGO}
                  style={{
                    width: 86,
                    height: 86,
                    borderRadius: 22,
                  }}
                  resizeMode="contain"
                />
              ) : null}

              <Animated.Text
                entering={FadeIn.delay(enterDelay + 40).duration(340)}
                style={{
                  color: colors.text,
                  fontSize: 30,
                  fontWeight: '800',
                  textAlign: 'center',
                  letterSpacing: 0.2,
                }}>
                {title}
              </Animated.Text>

              {subtitle ? (
                <Text
                  style={{
                    color: colors.textMuted,
                    textAlign: 'center',
                    lineHeight: 20,
                    maxWidth: 340,
                  }}>
                  {subtitle}
                </Text>
              ) : null}
            </Animated.View>

            <Animated.View
              entering={FadeInDown.delay(enterDelay + 90).duration(420)}
              style={{
                borderRadius: 22,
                borderWidth: 1,
                borderColor: colors.line,
                backgroundColor: colors.card,
                padding: 18,
                gap: 12,
                shadowColor: colors.shadow,
                shadowOpacity: 0.28,
                shadowRadius: 16,
                shadowOffset: {width: 0, height: 8},
                elevation: 6,
              }}>
              {children}
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </ScreenContainer>
  );
}
