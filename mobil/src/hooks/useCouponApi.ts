import {useRef} from 'react';
import {ApiError} from '../utils/error';
import {
  archiveSavedCoupon,
  deleteSavedCoupon,
  generateCoupons,
  getCouponTask,
  getSavedCoupons,
  renameSavedCoupon,
  restoreSavedCoupon,
  saveCoupon,
} from '../lib/api/endpoints';

type Prefix = '/coupons' | '/admin/coupons';

export function useCouponApi() {
  const prefixRef = useRef<Prefix>('/coupons');

  const withFallback = async <T>(task: (prefix: Prefix) => Promise<T>) => {
    try {
      return await task(prefixRef.current);
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0;
      if (status !== 404 || prefixRef.current === '/admin/coupons') {
        throw error;
      }
      prefixRef.current = '/admin/coupons';
      return task(prefixRef.current);
    }
  };

  return {
    currentPrefix: () => prefixRef.current,
    generateCoupons: (payload: Parameters<typeof generateCoupons>[1]) => withFallback(prefix => generateCoupons(prefix, payload)),
    getCouponTask: (taskId: string) => withFallback(prefix => getCouponTask(prefix, taskId)),
    saveCoupon: (payload: Parameters<typeof saveCoupon>[1]) => withFallback(prefix => saveCoupon(prefix, payload)),
    getSavedCoupons: (archived = false) => withFallback(prefix => getSavedCoupons(prefix, archived)),
    renameSavedCoupon: (couponId: number, name: string) =>
      withFallback(prefix => renameSavedCoupon(prefix, couponId, {name})),
    archiveSavedCoupon: (couponId: number) => withFallback(prefix => archiveSavedCoupon(prefix, couponId)),
    restoreSavedCoupon: (couponId: number) => withFallback(prefix => restoreSavedCoupon(prefix, couponId)),
    deleteSavedCoupon: (couponId: number) => withFallback(prefix => deleteSavedCoupon(prefix, couponId)),
  };
}
