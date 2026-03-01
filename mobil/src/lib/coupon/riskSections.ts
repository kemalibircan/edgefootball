import type {RiskCoupon} from '../../types/api';

export const RISK_SECTIONS = [
  {key: 'low', title: 'Dusuk Riskli Kupon'},
  {key: 'medium', title: 'Orta Riskli Kupon'},
  {key: 'high', title: 'Cok Riskli Kupon'},
] as const;

export type RiskKey = (typeof RISK_SECTIONS)[number]['key'];

export function createEmptyRiskCoupons(): Record<RiskKey, RiskCoupon | undefined> {
  return {
    low: undefined,
    medium: undefined,
    high: undefined,
  };
}
