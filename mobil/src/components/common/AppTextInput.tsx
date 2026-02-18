import React, {useState} from 'react';
import {TextInput, TextInputProps, View, Text, Pressable} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {colors} from '../../theme/colors';
import {fontWeight, typography} from '../../theme/typography';

type Props = TextInputProps & {
  label?: string;
  error?: string;
  iconName?: string;
  showPasswordToggle?: boolean;
};

export function AppTextInput({label, error, iconName, showPasswordToggle = false, ...props}: Props) {
  const {style, secureTextEntry, ...restProps} = props;
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  
  const shouldShowToggle = showPasswordToggle && secureTextEntry;
  const actuallySecure = shouldShowToggle ? !isPasswordVisible : secureTextEntry;
  
  return (
    <View style={{gap: 6}}>
      {label ? (
        <Text style={{fontSize: typography.label, color: colors.textMuted, fontWeight: fontWeight.semibold}}>
          {label}
        </Text>
      ) : null}
      <View
        style={{
          minHeight: 48,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: error ? colors.danger : colors.line,
          backgroundColor: colors.cardSoft,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 12,
          gap: 8,
        }}>
        {iconName ? <Ionicons name={iconName} size={16} color={colors.textMuted} /> : null}
        <TextInput
          {...restProps}
          secureTextEntry={actuallySecure}
          placeholderTextColor={colors.placeholder}
          style={[
            {
              flex: 1,
              minHeight: 46,
              color: colors.text,
              paddingVertical: 0,
            },
            style,
          ]}
        />
        {shouldShowToggle ? (
          <Pressable
            onPress={() => setIsPasswordVisible(prev => !prev)}
            hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
            style={{padding: 4}}>
            <Ionicons 
              name={isPasswordVisible ? 'eye-off-outline' : 'eye-outline'} 
              size={18} 
              color={colors.textMuted} 
            />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={{fontSize: typography.caption, color: colors.danger}}>{error}</Text> : null}
    </View>
  );
}
