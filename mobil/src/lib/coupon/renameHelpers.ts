export function beginCouponRename(couponId: number, couponName: string) {
  return {editingCouponId: couponId, editingName: String(couponName || '')};
}

export function cancelCouponRename() {
  return {editingCouponId: null as number | null, editingName: ''};
}

export function normalizeCouponRenameName(value: string) {
  return String(value || '').trim();
}
