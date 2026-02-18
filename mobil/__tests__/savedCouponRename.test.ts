import {beginCouponRename, cancelCouponRename, normalizeCouponRenameName} from '../src/lib/coupon/renameHelpers';

describe('saved coupon rename helpers', () => {
  test('beginCouponRename opens inline editor with selected coupon', () => {
    const next = beginCouponRename(44, 'Hafta Sonu Kuponu');
    expect(next.editingCouponId).toBe(44);
    expect(next.editingName).toBe('Hafta Sonu Kuponu');
  });

  test('cancelCouponRename closes inline editor and clears draft', () => {
    const reset = cancelCouponRename();
    expect(reset.editingCouponId).toBeNull();
    expect(reset.editingName).toBe('');
  });

  test('normalizeCouponRenameName trims whitespace and blocks empty names', () => {
    expect(normalizeCouponRenameName('  Yeni Isim  ')).toBe('Yeni Isim');
    expect(normalizeCouponRenameName('    ')).toBe('');
  });
});
