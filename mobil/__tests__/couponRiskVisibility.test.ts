import {RISK_SECTIONS, createEmptyRiskCoupons} from '../src/lib/coupon/riskSections';

describe('coupon risk visibility config', () => {
  test('defines low, medium and high risk sections in fixed order', () => {
    expect(RISK_SECTIONS.map(item => item.key)).toEqual(['low', 'medium', 'high']);
    expect(RISK_SECTIONS.map(item => item.title)).toEqual(['Dusuk Riskli Kupon', 'Orta Riskli Kupon', 'Cok Riskli Kupon']);
  });

  test('creates empty coupon state for all three risk levels', () => {
    const empty = createEmptyRiskCoupons();
    expect(Object.keys(empty)).toEqual(['low', 'medium', 'high']);
    expect(empty.low).toBeUndefined();
    expect(empty.medium).toBeUndefined();
    expect(empty.high).toBeUndefined();
  });
});
