import React, {useState} from 'react';
import {Alert, Pressable, Text, View} from 'react-native';
import {useMutation} from '@tanstack/react-query';
import {ScreenContainer} from '../../components/common/ScreenContainer';
import {GradientButton} from '../../components/common/GradientButton';
import {getMe} from '../../lib/api/endpoints';
import {useAuthStore} from '../../store/authStore';
import {messageFromUnknown} from '../../utils/error';
import {colors} from '../../theme/colors';
import {StatusBanner} from '../../components/common/StatusBanner';
import {useAppTheme} from '../../theme/useAppTheme';

export function ProfileScreen() {
  const user = useAuthStore(state => state.user);
  const setUser = useAuthStore(state => state.setUser);
  const clearSession = useAuthStore(state => state.clearSession);
  const {mode, setMode, effectiveScheme} = useAppTheme();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refreshMutation = useMutation({
    mutationFn: getMe,
    onSuccess: async payload => {
      await setUser(payload);
      setMessage('Profil guncellendi.');
      setError('');
    },
    onError: e => {
      setError(messageFromUnknown(e, 'Profil yuklenemedi.'));
    },
  });

  return (
    <ScreenContainer>
      <View style={{gap: 14}}>
        <Text style={{fontSize: 24, fontWeight: '800', color: colors.text}}>Profil</Text>

        <View
          style={{
            backgroundColor: colors.card,
            borderColor: colors.line,
            borderWidth: 1,
            borderRadius: 16,
            padding: 14,
            gap: 8,
          }}>
          <Text style={{fontSize: 18, fontWeight: '800', color: colors.text}}>{user?.email || user?.username || '-'}</Text>
          <Text style={{color: colors.textMuted}}>Rol: {user?.role || '-'}</Text>
          <Text style={{color: colors.textMuted}}>Kredi: {user?.credits ?? '-'}</Text>
          <Text style={{color: colors.textMuted}}>Durum: {user?.is_active ? 'Aktif' : 'Pasif'}</Text>
        </View>

        <View
          style={{
            backgroundColor: colors.card,
            borderColor: colors.line,
            borderWidth: 1,
            borderRadius: 16,
            padding: 14,
            gap: 10,
          }}>
          <Text style={{fontSize: 16, fontWeight: '700', color: colors.text}}>Tema</Text>
          <Text style={{fontSize: 12, color: colors.textMuted}}>Aktif: {effectiveScheme === 'dark' ? 'Dark' : 'Light'}</Text>
          <View style={{flexDirection: 'row', gap: 8}}>
            {(['system', 'light', 'dark'] as const).map(item => {
              const active = mode === item;
              const label = item === 'system' ? 'System' : item === 'light' ? 'Light' : 'Dark';
              return (
                <Pressable
                  key={`theme-${item}`}
                  onPress={() => setMode(item)}
                  style={{
                    flex: 1,
                    minHeight: 38,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: active ? colors.accent : colors.line,
                    backgroundColor: active ? colors.accentSoft : colors.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <Text style={{color: active ? colors.chipActiveText : colors.text, fontWeight: '700'}}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {error ? <StatusBanner message={error} tone="error" /> : null}
        {message ? <StatusBanner message={message} tone="success" /> : null}

        <GradientButton
          title="Profili Yenile"
          onPress={() => refreshMutation.mutate()}
          loading={refreshMutation.isPending}
          variant="secondary"
          iconName="refresh-outline"
        />

        <GradientButton
          title="Cikis Yap"
          variant="danger"
          iconName="log-out-outline"
          onPress={() => {
            Alert.alert('Cikis Onayi', 'Hesabindan cikis yapilsin mi?', [
              {text: 'Iptal', style: 'cancel'},
              {
                text: 'Cikis Yap',
                style: 'destructive',
                onPress: () => {
                  clearSession();
                },
              },
            ]);
          }}
        />
      </View>
    </ScreenContainer>
  );
}
