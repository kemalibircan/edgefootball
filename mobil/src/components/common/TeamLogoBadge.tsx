import React from 'react';
import {Image, Text, View} from 'react-native';
import {colors} from '../../theme/colors';

type Props = {
  name: string;
  logo?: string | null;
  size?: 'sm' | 'md' | 'lg';
  showName?: boolean;
};

export function teamInitials(name: string) {
  const words = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) {
    return '?';
  }
  return words
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase();
}

export function TeamLogoBadge({name, logo, size = 'md', showName = true}: Props) {
  const dim = size === 'sm' ? 24 : size === 'lg' ? 38 : 30;
  const textSize = size === 'sm' ? 11 : 13;
  const label = String(name || '-');
  const imageSource = logo ? {uri: logo} : null;

  return (
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '100%'}}>
      <View
        style={{
          width: dim,
          height: dim,
          borderRadius: dim / 2,
          borderWidth: 1,
          borderColor: colors.lineStrong,
          backgroundColor: colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}>
        {imageSource ? (
          <Image source={imageSource} resizeMode="cover" style={{width: dim, height: dim}} />
        ) : (
          <Text style={{color: colors.text, fontWeight: '700', fontSize: textSize}}>{teamInitials(label)}</Text>
        )}
      </View>
      {showName ? (
        <Text numberOfLines={1} style={{color: colors.text, fontWeight: '700', fontSize: textSize, flexShrink: 1}}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}
