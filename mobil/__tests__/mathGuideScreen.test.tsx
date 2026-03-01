import React from 'react';
import {act, create, ReactTestRenderer} from 'react-test-renderer';

const mockMutate = jest.fn();
const mockAddPicks = jest.fn(() => 1);

jest.mock('@tanstack/react-query', () => ({
  useMutation: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
  useQuery: () => ({
    data: null,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  }),
}));

jest.mock('../src/hooks/useCouponApi', () => ({
  useCouponApi: () => ({
    generateCoupons: jest.fn(async () => ({task_id: 'task-1', status: 'PENDING'})),
    getCouponTask: jest.fn(async () => null),
    saveCoupon: jest.fn(async () => ({})),
  }),
}));

jest.mock('../src/store/couponStore', () => ({
  useCouponStore: (selector: (state: {addPicks: typeof mockAddPicks; stake: number}) => unknown) =>
    selector({
      addPicks: mockAddPicks,
      stake: 20,
    }),
}));

jest.mock('../src/components/common/ScreenContainer', () => ({
  ScreenContainer: ({children}: {children: React.ReactNode}) => <>{children}</>,
}));

jest.mock('../src/components/coupon/MathCouponsSection', () => {
  const React = require('react');
  const {Text} = require('react-native');
  return {
    MathCouponsSection: () => <Text testID="math-coupons-section">MathCouponsSection</Text>,
  };
});

import {MathGuideScreen} from '../src/screens/coupon/MathGuideScreen';

describe('math guide screen', () => {
  let renderer: ReactTestRenderer | null = null;

  afterEach(async () => {
    if (renderer) {
      await act(async () => {
        renderer?.unmount();
      });
      renderer = null;
    }
    mockMutate.mockClear();
    mockAddPicks.mockClear();
  });

  test('renders info area and math coupons section', async () => {
    await act(async () => {
      renderer = create(<MathGuideScreen />);
    });
    const root = renderer!.root;

    expect(root.findByProps({testID: 'math-guide-info-card'})).toBeTruthy();
    expect(root.findByProps({testID: 'math-coupons-section'})).toBeTruthy();
  });

  test('opens and closes faq modal', async () => {
    await act(async () => {
      renderer = create(<MathGuideScreen />);
    });
    const root = renderer!.root;

    expect(root.findAllByProps({testID: 'math-guide-faq-title'})).toHaveLength(0);

    await act(async () => {
      root.findByProps({testID: 'math-guide-faq-open'}).props.onPress();
    });
    expect(root.findAllByProps({testID: 'math-guide-faq-title'}).length).toBeGreaterThan(0);

    await act(async () => {
      root.findByProps({testID: 'math-guide-faq-close'}).props.onPress();
    });
    expect(root.findAllByProps({testID: 'math-guide-faq-title'})).toHaveLength(0);
  });
});
