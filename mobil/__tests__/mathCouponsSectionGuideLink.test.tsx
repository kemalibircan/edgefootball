import React from 'react';
import {act, create, ReactTestRenderer} from 'react-test-renderer';
import {MathCouponsSection} from '../src/components/coupon/MathCouponsSection';

jest.mock('../src/components/common/GradientButton', () => ({
  GradientButton: () => null,
}));

jest.mock('../src/components/common/StatusBanner', () => ({
  StatusBanner: () => null,
}));

jest.mock('../src/components/coupon/CouponTaskProgress', () => ({
  CouponTaskProgress: () => null,
}));

jest.mock('react-native-vector-icons/Ionicons', () => 'Ionicons');

const baseProps = {
  bankrollTl: '1000',
  onChangeBankrollTl: jest.fn(),
  onBlurBankrollTl: jest.fn(),
  onGenerate: jest.fn(),
  loading: false,
  taskSnapshot: null,
  etaSeconds: null,
  error: '',
  info: '',
  warnings: [],
  autoConfigView: null,
  mathCoupons: null,
  onAddCoupon: jest.fn(),
  onSaveCoupon: jest.fn(),
};

describe('math coupons section', () => {
  let renderer: ReactTestRenderer | null = null;

  afterEach(async () => {
    if (renderer) {
      await act(async () => {
        renderer?.unmount();
      });
      renderer = null;
    }
  });

  test('renders section title and no guide link entrypoint', async () => {
    await act(async () => {
      renderer = create(<MathCouponsSection {...baseProps} />);
    });

    expect(renderer!.root.findByProps({children: 'Matematiksel Olarak Mantikli Kuponlar (+EV)'})).toBeTruthy();
    expect(renderer!.root.findAllByProps({testID: 'math-guide-link'})).toHaveLength(0);
  });
});
