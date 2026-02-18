import React from 'react';
import {Text, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {colors} from '../../theme/colors';

type Props = {
  message: string;
  tone?: 'info' | 'success' | 'error' | 'warning';
};

const toneMap = {
  info: {icon: 'information-circle-outline', fg: colors.accent, bg: colors.accentSoft, border: colors.accentBorder},
  success: {icon: 'checkmark-circle-outline', fg: colors.success, bg: colors.successSoft, border: colors.successBorder},
  error: {icon: 'alert-circle-outline', fg: colors.danger, bg: colors.dangerSoft, border: colors.dangerBorder},
  warning: {icon: 'warning-outline', fg: colors.warning, bg: colors.warningSoft, border: colors.warningBorder},
} as const;

export function StatusBanner({message, tone = 'info'}: Props) {
  const palette = toneMap[tone];

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.bg,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      }}>
      <Ionicons name={palette.icon} size={16} color={palette.fg} />
      <Text style={{color: colors.text, flex: 1, fontSize: 13, lineHeight: 18}}>{message}</Text>
    </View>
  );
}
