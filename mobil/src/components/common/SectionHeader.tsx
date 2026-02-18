import React from 'react';
import {Text, View, Pressable} from 'react-native';
import {colors} from '../../theme/colors';

type Props = {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onActionPress?: () => void;
};

export function SectionHeader({title, subtitle, actionLabel, onActionPress}: Props) {
  return (
    <View style={{gap: 4}}>
      <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
        <Text style={{fontSize: 18, fontWeight: '800', color: colors.text}}>{title}</Text>
        {actionLabel ? (
          <Pressable onPress={onActionPress}>
            <Text style={{color: colors.accent, fontWeight: '700'}}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      {subtitle ? <Text style={{fontSize: 13, color: colors.textMuted}}>{subtitle}</Text> : null}
    </View>
  );
}
