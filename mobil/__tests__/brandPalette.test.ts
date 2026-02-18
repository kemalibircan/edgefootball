import {darkColors, lightColors} from '../src/theme/colors';

describe('brand palette', () => {
  test('uses locked navy/lime tokens for dark mode', () => {
    expect(darkColors.background).toBe('#03132F');
    expect(darkColors.gradientStart).toBe('#03112A');
    expect(darkColors.gradientMid).toBe('#03132F');
    expect(darkColors.gradientEnd).toBe('#0A1B32');
    expect(darkColors.accent).toBe('#B9F738');
    expect(darkColors.primaryButtonStart).toBe('#B2EF32');
    expect(darkColors.primaryButtonEnd).toBe('#BCF940');
    expect(darkColors.secondaryButtonStart).toBe('#112643');
    expect(darkColors.secondaryButtonEnd).toBe('#0D203C');
    expect(darkColors.noticeBorder).toBe('rgba(185,247,56,0.46)');
  });

  test('uses locked navy/lime tokens for light mode', () => {
    expect(lightColors.background).toBe('#F4F8FF');
    expect(lightColors.gradientStart).toBe('#F6FAFF');
    expect(lightColors.gradientMid).toBe('#EEF5FF');
    expect(lightColors.gradientEnd).toBe('#E7F0FC');
    expect(lightColors.accent).toBe('#B9F738');
    expect(lightColors.primaryButtonStart).toBe('#B2EF32');
    expect(lightColors.primaryButtonEnd).toBe('#BCF940');
    expect(lightColors.secondaryButtonStart).toBe('#DCE9FA');
    expect(lightColors.secondaryButtonEnd).toBe('#CEDFF5');
    expect(lightColors.noticeBorder).toBe('rgba(185,247,56,0.52)');
  });
});
