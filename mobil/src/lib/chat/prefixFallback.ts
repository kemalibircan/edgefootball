import {ApiError} from '../../utils/error';

export type CouponPrefix = '/coupons' | '/admin/coupons';

type PrefixFallbackState = {
  getPrefix: () => CouponPrefix;
  withFallback: <T>(task: (prefix: CouponPrefix) => Promise<T>) => Promise<T>;
};

export function createCouponPrefixFallback(initialPrefix: CouponPrefix = '/coupons'): PrefixFallbackState {
  let prefix: CouponPrefix = initialPrefix;

  return {
    getPrefix() {
      return prefix;
    },
    async withFallback(task) {
      try {
        return await task(prefix);
      } catch (error) {
        const status = error instanceof ApiError ? error.status : 0;
        if (status !== 404 || prefix === '/admin/coupons') {
          throw error;
        }
        prefix = '/admin/coupons';
        return task(prefix);
      }
    },
  };
}
