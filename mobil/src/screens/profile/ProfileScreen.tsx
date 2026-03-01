import React, {useMemo, useState} from 'react';
import {ActivityIndicator, Alert, Image, Pressable, Text, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {useMutation, useQuery} from '@tanstack/react-query';
import {ScreenContainer} from '../../components/common/ScreenContainer';
import {GradientButton} from '../../components/common/GradientButton';
import {getAvatarOptions, getMe, updateMyAvatar} from '../../lib/api/endpoints';
import {useAuthStore} from '../../store/authStore';
import {messageFromUnknown} from '../../utils/error';
import {StatusBanner} from '../../components/common/StatusBanner';
import {useAppTheme} from '../../theme/useAppTheme';

const DEFAULT_AVATAR_KEY = 'open_peeps_01';

export function ProfileScreen() {
  const user = useAuthStore(state => state.user);
  const setUser = useAuthStore(state => state.setUser);
  const clearSession = useAuthStore(state => state.clearSession);
  const {mode, setMode, effectiveScheme, colors} = useAppTheme();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const avatarOptionsQuery = useQuery({
    queryKey: ['auth-avatar-options'],
    queryFn: getAvatarOptions,
    staleTime: 300_000,
  });

  const selectedAvatarKey = String(user?.avatar_key || DEFAULT_AVATAR_KEY);

  const selectedAvatar = useMemo(
    () => avatarOptionsQuery.data?.items?.find(item => item.key === selectedAvatarKey) || null,
    [avatarOptionsQuery.data?.items, selectedAvatarKey],
  );
  const avatarUpdateSupported = avatarOptionsQuery.data?.supports_update !== false;

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

  const updateAvatarMutation = useMutation({
    mutationFn: updateMyAvatar,
    onSuccess: async payload => {
      await setUser(payload);
      setMessage('Avatar guncellendi.');
      setError('');
    },
    onError: e => {
      setError(messageFromUnknown(e, 'Avatar guncellenemedi.'));
    },
  });

  return (
    <ScreenContainer>
      <View style={{gap: 14}}>
        <View
          style={{
            borderRadius: 20,
            borderWidth: 1,
            borderColor: colors.lineStrong,
            backgroundColor: colors.card,
            padding: 16,
            gap: 14,
          }}>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 14}}>
            <View
              style={{
                width: 88,
                height: 88,
                borderRadius: 44,
                borderWidth: 2,
                borderColor: colors.accentBorder,
                backgroundColor: colors.surface,
                overflow: 'hidden',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              {selectedAvatar?.image_url ? (
                <Image source={{uri: selectedAvatar.image_url}} style={{width: '100%', height: '100%'}} resizeMode="cover" />
              ) : (
                <Ionicons name="person" size={34} color={colors.textMuted} />
              )}
            </View>

            <View style={{flex: 1, gap: 4}}>
              <Text style={{fontSize: 22, fontWeight: '800', color: colors.text}}>{user?.email || user?.username || '-'}</Text>
              <Text style={{fontSize: 13, color: colors.textMuted}}>
                {user?.is_active ? 'Hesap aktif' : 'Hesap pasif'}
              </Text>
            </View>
          </View>

          <View style={{flexDirection: 'row', gap: 8}}>
            <View
              style={{
                flex: 1,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.line,
                backgroundColor: colors.surface,
                paddingHorizontal: 10,
                paddingVertical: 8,
              }}>
              <Text style={{fontSize: 11, color: colors.textMuted}}>Rol</Text>
              <Text style={{fontSize: 14, fontWeight: '700', color: colors.text}}>{user?.role || '-'}</Text>
            </View>
            <View
              style={{
                flex: 1,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.line,
                backgroundColor: colors.surface,
                paddingHorizontal: 10,
                paddingVertical: 8,
              }}>
              <Text style={{fontSize: 11, color: colors.textMuted}}>Kredi</Text>
              <Text style={{fontSize: 14, fontWeight: '700', color: colors.text}}>{user?.credits ?? '-'}</Text>
            </View>
          </View>
        </View>

        <View
          style={{
            borderRadius: 18,
            borderWidth: 1,
            borderColor: colors.line,
            backgroundColor: colors.card,
            padding: 14,
            gap: 10,
          }}>
          <Text style={{fontSize: 17, fontWeight: '800', color: colors.text}}>Avatar Sec</Text>
          <Text style={{fontSize: 12, color: colors.textMuted}}>10 acik kaynak avatar arasindan secim yapabilirsin.</Text>

          {avatarOptionsQuery.isLoading ? (
            <View style={{paddingVertical: 14}}>
              <ActivityIndicator color={colors.accent} size="small" />
            </View>
          ) : null}

          {avatarOptionsQuery.isError ? (
            <StatusBanner tone="error" message="Avatar listesi alinamadi. Lutfen tekrar dene." />
          ) : null}

          {avatarOptionsQuery.data?.supports_update === false ? (
            <StatusBanner tone="warning" message="Bu sunucu surumunde avatar degistirme desteklenmiyor." />
          ) : null}

          <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 10}}>
            {(avatarOptionsQuery.data?.items || []).map(option => {
              const selected = selectedAvatarKey === option.key;
              const disabled = updateAvatarMutation.isPending || !avatarUpdateSupported;

              return (
                <Pressable
                  key={`avatar-${option.key}`}
                  onPress={() => {
                    setMessage('');
                    setError('');
                    if (!selected && avatarUpdateSupported) {
                      updateAvatarMutation.mutate(option.key);
                    }
                  }}
                  disabled={disabled}
                  style={{
                    width: '48.5%',
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: selected ? colors.accentBorder : colors.line,
                    backgroundColor: selected ? colors.accentSoft : colors.surface,
                    padding: 8,
                    opacity: disabled ? 0.72 : 1,
                    gap: 8,
                  }}>
                  <View
                    style={{
                      width: '100%',
                      aspectRatio: 1,
                      borderRadius: 12,
                      overflow: 'hidden',
                      backgroundColor: colors.cardSoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    <Image source={{uri: option.image_url}} style={{width: '100%', height: '100%'}} resizeMode="cover" />
                    {selected ? (
                      <View
                        style={{
                          position: 'absolute',
                          top: 6,
                          right: 6,
                          width: 20,
                          height: 20,
                          borderRadius: 10,
                          backgroundColor: colors.accent,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                        <Ionicons name="checkmark" size={12} color={colors.primaryButtonText} />
                      </View>
                    ) : null}
                  </View>

                  <Text style={{fontSize: 12, color: colors.text, textAlign: 'center', fontWeight: '700'}}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {avatarOptionsQuery.data?.items?.length ? (
            <Text style={{fontSize: 11, color: colors.textMuted}}>
              Kaynak: {avatarOptionsQuery.data.items[0].source_name} ({avatarOptionsQuery.data.items[0].license_name})
            </Text>
          ) : null}
        </View>

        <View
          style={{
            borderRadius: 18,
            borderWidth: 1,
            borderColor: colors.line,
            backgroundColor: colors.card,
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
