import React from 'react';

jest.mock('@react-navigation/bottom-tabs', () => ({
  createBottomTabNavigator: () => ({
    Navigator: 'MockTabNavigator',
    Screen: 'MockTabScreen',
  }),
}));

jest.mock('../src/theme/useAppTheme', () => ({
  useAppTheme: () => ({
    colors: {
      accent: '#B9F738',
      textMuted: '#9CB2CC',
      backgroundElevated: '#071A38',
      line: '#1F3D63',
    },
  }),
}));

jest.mock('../src/screens/coupon/CouponsScreen', () => ({
  CouponsScreen: () => null,
}));

jest.mock('../src/screens/coupon/MathGuideScreen', () => ({
  MathGuideScreen: () => null,
}));

jest.mock('../src/screens/coupon/SavedCouponsScreen', () => ({
  SavedCouponsScreen: () => null,
}));

jest.mock('../src/screens/chat/ChatScreen', () => ({
  ChatScreen: () => null,
}));

jest.mock('../src/navigation/HomeStack', () => ({
  HomeStack: () => null,
}));

jest.mock('react-native-vector-icons/Ionicons', () => 'Ionicons');

import {MainTabs} from '../src/navigation/MainTabs';

describe('main tabs math guide integration', () => {
  test('includes MathGuide tab in the expected order', () => {
    const tree = MainTabs() as React.ReactElement<{children?: React.ReactNode}>;
    const screens = React.Children.toArray(tree.props.children) as Array<{props: {name?: string}}>;
    const names = screens.map(screen => screen.props.name);

    expect(names).toEqual(['HomeTab', 'Coupons', 'MathGuide', 'SavedCoupons', 'Chat']);
  });

  test('uses stats-chart icons for MathGuide route', () => {
    const tree = MainTabs() as React.ReactElement<{
      screenOptions: (args: {route: {name: string}}) => {tabBarIcon: (input: {color: string; size: number; focused: boolean}) => React.ReactElement};
    }>;

    const screenOptions = tree.props.screenOptions;
    const mathOptions = screenOptions({route: {name: 'MathGuide'}});

    const focusedIcon = mathOptions.tabBarIcon({color: '#fff', size: 20, focused: true}) as React.ReactElement<{name: string}>;
    const idleIcon = mathOptions.tabBarIcon({color: '#fff', size: 20, focused: false}) as React.ReactElement<{name: string}>;

    expect(focusedIcon.props.name).toBe('stats-chart');
    expect(idleIcon.props.name).toBe('stats-chart-outline');
  });
});
