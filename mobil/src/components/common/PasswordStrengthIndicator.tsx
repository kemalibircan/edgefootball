import React from 'react';
import {View, Text} from 'react-native';
import {colors} from '../../theme/colors';

type PasswordStrength = 'weak' | 'medium' | 'strong';

type Props = {
  password: string;
};

function calculatePasswordStrength(password: string): PasswordStrength {
  if (!password || password.length < 6) {
    return 'weak';
  }
  
  let score = 0;
  
  // Length check
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  
  // Contains number
  if (/\d/.test(password)) score++;
  
  // Contains lowercase
  if (/[a-z]/.test(password)) score++;
  
  // Contains uppercase
  if (/[A-Z]/.test(password)) score++;
  
  // Contains special character
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  
  if (score <= 2) return 'weak';
  if (score <= 4) return 'medium';
  return 'strong';
}

export function PasswordStrengthIndicator({password}: Props) {
  if (!password) return null;
  
  const strength = calculatePasswordStrength(password);
  
  const strengthConfig = {
    weak: {
      label: 'Zayıf',
      color: colors.danger,
      bgColor: colors.dangerSoft,
      width: '33%',
    },
    medium: {
      label: 'Orta',
      color: colors.warning,
      bgColor: colors.warningSoft,
      width: '66%',
    },
    strong: {
      label: 'Güçlü',
      color: colors.success,
      bgColor: colors.successSoft,
      width: '100%',
    },
  };
  
  const config = strengthConfig[strength];
  
  return (
    <View style={{gap: 6}}>
      <View style={{
        height: 4,
        backgroundColor: colors.surface,
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <View style={{
          height: '100%',
          width: config.width,
          backgroundColor: config.color,
        }} />
      </View>
      <Text style={{fontSize: 12, color: config.color, fontWeight: '600'}}>
        Şifre Gücü: {config.label}
      </Text>
    </View>
  );
}
