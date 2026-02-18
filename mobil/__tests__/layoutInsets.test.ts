import {DOCK_COLLAPSED_HEIGHT, getBottomContentInset} from '../src/lib/layout/insets';

describe('layout insets', () => {
  test('does not depend on tab bar height anymore', () => {
    const withTallTab = getBottomContentInset(72, 'collapsed', 10);
    const withZeroTab = getBottomContentInset(0, 'collapsed', 10);

    expect(withTallTab).toBe(withZeroTab);
    expect(withTallTab).toBe(10 + 12 + DOCK_COLLAPSED_HEIGHT + 12);
  });

  test('keeps compact inset when dock is hidden or expanded', () => {
    expect(getBottomContentInset(72, 'hidden', 8)).toBe(20);
    expect(getBottomContentInset(72, 'expanded', 8)).toBe(20);
  });
});
