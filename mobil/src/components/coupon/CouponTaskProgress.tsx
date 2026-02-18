import React from 'react';
import {Text, View} from 'react-native';
import {colors} from '../../theme/colors';

type Props = {
  progress: number;
  stage: string;
  state: string;
};

export function CouponTaskProgress({progress, stage, state}: Props) {
  const safeProgress = Math.max(0, Math.min(100, Number(progress) || 0));

  return (
    <View
      style={{
        gap: 8,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors.card,
        padding: 12,
      }}>
      <View style={{height: 10, borderRadius: 999, backgroundColor: colors.surface, overflow: 'hidden'}}>
        <View
          style={{
            width: `${safeProgress}%`,
            height: '100%',
            backgroundColor: colors.success,
          }}
        />
      </View>
      <Text style={{fontSize: 12, color: colors.textMuted}}>
        Durum: {state || '-'} - %{safeProgress}
      </Text>
      <Text style={{fontSize: 12, color: colors.textMuted}}>{stage || '-'}</Text>
    </View>
  );
}
