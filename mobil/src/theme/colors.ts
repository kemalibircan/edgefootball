export type ThemeScheme = 'light' | 'dark';

export type AppColors = {
  background: string;
  backgroundElevated: string;
  card: string;
  cardSoft: string;
  surface: string;
  text: string;
  textMuted: string;
  line: string;
  lineStrong: string;
  success: string;
  warning: string;
  danger: string;
  accent: string;
  gradientStart: string;
  gradientMid: string;
  gradientEnd: string;
  glow: string;
  placeholder: string;
  overlayBackdrop: string;
  overlayBackdropStrong: string;
  modalBackdrop: string;
  shadow: string;
  accentSoft: string;
  accentSoftStrong: string;
  accentBorder: string;
  successSoft: string;
  successSoftStrong: string;
  successBorder: string;
  warningSoft: string;
  warningSoftStrong: string;
  warningBorder: string;
  dangerSoft: string;
  dangerSoftStrong: string;
  dangerBorder: string;
  successTextOnSolid: string;
  dangerTextOnSolid: string;
  warningTextOnSolid: string;
  chipActiveText: string;
  sliderOverlay: string;
  sliderTitle: string;
  sliderBody: string;
  sliderCaption: string;
  primaryButtonStart: string;
  primaryButtonEnd: string;
  secondaryButtonStart: string;
  secondaryButtonEnd: string;
  dangerButtonStart: string;
  dangerButtonEnd: string;
  ghostButtonFill: string;
  primaryButtonText: string;
  inverseText: string;
  noticeBackground: string;
  noticeBorder: string;
  cardSelectedAccent: string;
  successHighBorder: string;
  dangerHighBorder: string;
};

export const darkColors: AppColors = {
  background: '#03132F',
  backgroundElevated: '#071A38',
  card: '#0A1B32',
  cardSoft: '#112643',
  surface: '#163154',
  text: '#F4F8FF',
  textMuted: '#9CB2CC',
  line: '#1F3D63',
  lineStrong: '#2A507D',
  success: '#11C46B',
  warning: '#FFC44D',
  danger: '#F25C6B',
  accent: '#B9F738',
  gradientStart: '#03112A',
  gradientMid: '#03132F',
  gradientEnd: '#0A1B32',
  glow: 'rgba(185,247,56,0.28)',
  placeholder: '#6E87A8',
  overlayBackdrop: 'rgba(3,17,42,0.50)',
  overlayBackdropStrong: 'rgba(3,17,42,0.62)',
  modalBackdrop: 'rgba(0, 0, 0, 0.55)',
  shadow: '#000814',
  accentSoft: 'rgba(185,247,56,0.14)',
  accentSoftStrong: 'rgba(185,247,56,0.34)',
  accentBorder: 'rgba(185,247,56,0.46)',
  successSoft: 'rgba(17, 196, 107, 0.12)',
  successSoftStrong: 'rgba(17, 196, 107, 0.45)',
  successBorder: 'rgba(17, 196, 107, 0.35)',
  warningSoft: 'rgba(255, 196, 77, 0.12)',
  warningSoftStrong: 'rgba(255, 196, 77, 0.4)',
  warningBorder: 'rgba(255, 196, 77, 0.4)',
  dangerSoft: 'rgba(242, 92, 107, 0.14)',
  dangerSoftStrong: 'rgba(242, 92, 107, 0.45)',
  dangerBorder: 'rgba(242, 92, 107, 0.35)',
  successTextOnSolid: '#042013',
  dangerTextOnSolid: '#FFF1F4',
  warningTextOnSolid: '#2E2100',
  chipActiveText: '#D3F9A2',
  sliderOverlay: 'rgba(3, 17, 42, 0.46)',
  sliderTitle: '#F4F8FF',
  sliderBody: '#ECF6FF',
  sliderCaption: '#C5D7ED',
  primaryButtonStart: '#B2EF32',
  primaryButtonEnd: '#BCF940',
  secondaryButtonStart: '#112643',
  secondaryButtonEnd: '#0D203C',
  dangerButtonStart: '#8A1F35',
  dangerButtonEnd: '#6F172A',
  ghostButtonFill: 'rgba(17,38,67,0.55)',
  primaryButtonText: '#102200',
  inverseText: '#102200',
  noticeBackground: 'rgba(10,27,50,0.96)',
  noticeBorder: 'rgba(185,247,56,0.46)',
  cardSelectedAccent: 'rgba(185,247,56,0.14)',
  successHighBorder: 'rgba(17, 196, 107, 0.7)',
  dangerHighBorder: 'rgba(242, 92, 107, 0.7)',
};

export const lightColors: AppColors = {
  background: '#F4F8FF',
  backgroundElevated: '#FFFFFF',
  card: '#FFFFFF',
  cardSoft: '#ECF3FF',
  surface: '#E3EEFF',
  text: '#03132F',
  textMuted: '#466083',
  line: '#C7D9EF',
  lineStrong: '#AFC7E8',
  success: '#169F62',
  warning: '#C68A17',
  danger: '#D54257',
  accent: '#B9F738',
  gradientStart: '#F6FAFF',
  gradientMid: '#EEF5FF',
  gradientEnd: '#E7F0FC',
  glow: 'rgba(185,247,56,0.22)',
  placeholder: '#7A91AF',
  overlayBackdrop: 'rgba(3,19,47,0.24)',
  overlayBackdropStrong: 'rgba(3,19,47,0.30)',
  modalBackdrop: 'rgba(0, 0, 0, 0.35)',
  shadow: '#1A2A3D',
  accentSoft: 'rgba(185,247,56,0.16)',
  accentSoftStrong: 'rgba(185,247,56,0.3)',
  accentBorder: 'rgba(185,247,56,0.52)',
  successSoft: 'rgba(22, 159, 98, 0.12)',
  successSoftStrong: 'rgba(22, 159, 98, 0.32)',
  successBorder: 'rgba(22, 159, 98, 0.3)',
  warningSoft: 'rgba(198, 138, 23, 0.12)',
  warningSoftStrong: 'rgba(198, 138, 23, 0.32)',
  warningBorder: 'rgba(198, 138, 23, 0.35)',
  dangerSoft: 'rgba(213, 66, 87, 0.12)',
  dangerSoftStrong: 'rgba(213, 66, 87, 0.28)',
  dangerBorder: 'rgba(213, 66, 87, 0.3)',
  successTextOnSolid: '#07331E',
  dangerTextOnSolid: '#490B15',
  warningTextOnSolid: '#4A3408',
  chipActiveText: '#2D4A08',
  sliderOverlay: 'rgba(3, 19, 47, 0.28)',
  sliderTitle: '#F4F8FF',
  sliderBody: '#ECF6FF',
  sliderCaption: '#D3E3F5',
  primaryButtonStart: '#B2EF32',
  primaryButtonEnd: '#BCF940',
  secondaryButtonStart: '#DCE9FA',
  secondaryButtonEnd: '#CEDFF5',
  dangerButtonStart: '#E46F81',
  dangerButtonEnd: '#D9536A',
  ghostButtonFill: 'rgba(203,220,241,0.60)',
  primaryButtonText: '#102200',
  inverseText: '#102200',
  noticeBackground: '#FFFFFF',
  noticeBorder: 'rgba(185,247,56,0.52)',
  cardSelectedAccent: 'rgba(185,247,56,0.16)',
  successHighBorder: 'rgba(22, 159, 98, 0.58)',
  dangerHighBorder: 'rgba(213, 66, 87, 0.58)',
};

let activeThemeScheme: ThemeScheme = 'dark';
let activeThemeColors: AppColors = darkColors;

export function getThemeColors(scheme: ThemeScheme): AppColors {
  return scheme === 'light' ? lightColors : darkColors;
}

export function setActiveThemeScheme(scheme: ThemeScheme) {
  activeThemeScheme = scheme;
  activeThemeColors = getThemeColors(scheme);
}

export function getActiveThemeScheme() {
  return activeThemeScheme;
}

export function getActiveThemeColors() {
  return activeThemeColors;
}

export const colors = new Proxy({} as AppColors, {
  get(_target, prop: string) {
    return activeThemeColors[prop as keyof AppColors];
  },
});

export type ColorToken = keyof AppColors;
