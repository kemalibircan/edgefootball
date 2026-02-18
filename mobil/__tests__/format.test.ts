import {asPercent, oddText, safeNumber} from '../src/utils/format';

describe('format utils', () => {
  test('asPercent formats decimals', () => {
    expect(asPercent(0.425)).toBe('%42.5');
  });

  test('oddText formats valid odd', () => {
    expect(oddText(2.347)).toBe('2.35');
  });

  test('safeNumber uses fallback', () => {
    expect(safeNumber('x', 9)).toBe(9);
  });
});
