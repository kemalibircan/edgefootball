import React, {useEffect, useMemo} from 'react';
import {StatusBar} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {NavigationContainer, DarkTheme, DefaultTheme} from '@react-navigation/native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {RootNavigator} from './navigation/RootNavigator';
import {navigationRef} from './navigation/navigationRef';
import {AiChatProvider} from './state/chat/AiChatContext';
import {ChatReplyNotice} from './components/chat/ChatReplyNotice';
import {useAppTheme} from './theme/useAppTheme';
import {configureGoogleSignIn} from './lib/auth/googleSignIn';
import './theme/global.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: 1,
    },
  },
});

export default function App() {
  const {colors, effectiveScheme} = useAppTheme();
  useEffect(() => {
    configureGoogleSignIn();
  }, []);

  const navTheme = useMemo(() => {
    const base = effectiveScheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: colors.background,
        card: colors.card,
        text: colors.text,
        border: colors.line,
        primary: colors.accent,
        notification: colors.warning,
      },
    };
  }, [colors.accent, colors.background, colors.card, colors.line, colors.text, colors.warning, effectiveScheme]);

  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AiChatProvider>
            <NavigationContainer ref={navigationRef} theme={navTheme}>
              <StatusBar
                barStyle={effectiveScheme === 'dark' ? 'light-content' : 'dark-content'}
                backgroundColor={colors.background}
                translucent={false}
              />
              <RootNavigator />
              <ChatReplyNotice />
            </NavigationContainer>
          </AiChatProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
