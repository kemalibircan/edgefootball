import {ApiError} from '../src/utils/error';
import {createCouponPrefixFallback} from '../src/lib/chat/prefixFallback';

describe('chat prefix fallback', () => {
  test('falls back from /coupons to /admin/coupons on 404 once', async () => {
    const state = createCouponPrefixFallback();
    const calls: string[] = [];

    const payload = await state.withFallback(async prefix => {
      calls.push(prefix);
      if (prefix === '/coupons') {
        throw new ApiError('Not found', 404);
      }
      return {ok: true};
    });

    expect(payload).toEqual({ok: true});
    expect(calls).toEqual(['/coupons', '/admin/coupons']);
    expect(state.getPrefix()).toBe('/admin/coupons');
  });
});
