import React from 'react';

jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({
    Navigator: 'MockNavigator',
    Screen: 'MockScreen',
  }),
}));

jest.mock('../src/theme/useAppTheme', () => ({
  useAppTheme: () => ({
    colors: {
      text: '#001122',
      background: '#03132F',
    },
  }),
}));

jest.mock('../src/screens/auth/WelcomeScreen', () => ({
  WelcomeScreen: () => null,
}));

jest.mock('../src/screens/auth/LoginScreen', () => ({
  LoginScreen: () => null,
}));

jest.mock('../src/screens/auth/RegisterScreen', () => ({
  RegisterScreen: () => null,
}));

jest.mock('../src/screens/auth/ForgotPasswordScreen', () => ({
  ForgotPasswordScreen: () => null,
}));

import {AuthStack} from '../src/navigation/AuthStack';

describe('auth navigation', () => {
  test('starts unauthenticated flow from Welcome route', () => {
    const tree = AuthStack();

    expect(tree.props.initialRouteName).toBe('Welcome');

    const screens = React.Children.toArray(tree.props.children) as Array<{props: {name?: string}}>;
    const names = screens.map(screen => screen.props.name).filter(Boolean);

    expect(names[0]).toBe('Welcome');
    expect(names).toEqual(expect.arrayContaining(['Login', 'Register', 'ForgotPassword']));
  });
});
