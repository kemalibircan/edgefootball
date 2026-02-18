import React, {useState} from 'react';
import {Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import Animated, {FadeIn, FadeInDown} from 'react-native-reanimated';
import type {AuthStackParamList} from '../../navigation/types';
import {login, requestLoginCode, verifyLoginCode} from '../../lib/api/endpoints';
import {GoogleSignInCancelledError, signInWithGoogle} from '../../lib/auth/googleSignIn';
import {useAuthStore} from '../../store/authStore';
import {messageFromUnknown} from '../../utils/error';
import {colors} from '../../theme/colors';
import {StatusBanner} from '../../components/common/StatusBanner';
import {AppTextInput} from '../../components/common/AppTextInput';
import {GradientButton} from '../../components/common/GradientButton';
import {AuthShell} from '../../components/auth/AuthShell';

export type LoginScreenProps = NativeStackScreenProps<AuthStackParamList, 'Login'>;

type LoginMode = 'password' | 'code';

export function LoginScreen({navigation}: LoginScreenProps) {
  const setSession = useAuthStore(state => state.setSession);
  const [mode, setMode] = useState<LoginMode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const normalizedEmail = email.trim().toLowerCase();

  const onSubmit = async () => {
    if (!normalizedEmail) {
      setError('Email zorunludur.');
      return;
    }

    if (mode === 'password') {
      if (!password.trim()) {
        setError('Email ve sifre zorunludur.');
        return;
      }
    } else if (!code.trim()) {
      setError('Email ve kod zorunludur.');
      return;
    }

    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const payload =
        mode === 'password'
          ? await login(normalizedEmail, password)
          : await verifyLoginCode(normalizedEmail, code.trim());
      await setSession(payload);
    } catch (e) {
      setError(messageFromUnknown(e, 'Giris basarisiz.'));
    } finally {
      setLoading(false);
    }
  };

  const onSendCode = async () => {
    if (!normalizedEmail) {
      setError('Email zorunludur.');
      return;
    }

    setSendingCode(true);
    setError('');
    setSuccess('');
    try {
      await requestLoginCode(normalizedEmail);
      setSuccess('Kod e-posta adresine gonderildi.');
    } catch (e) {
      setError(messageFromUnknown(e, 'Kod gonderilemedi.'));
    } finally {
      setSendingCode(false);
    }
  };

  const onGoogleLogin = async () => {
    setError('');
    setSuccess('');
    setGoogleLoading(true);
    try {
      const payload = await signInWithGoogle();
      await setSession(payload);
    } catch (e) {
      if (e instanceof GoogleSignInCancelledError) {
        return;
      }
      setError(messageFromUnknown(e, 'Gmail ile giris basarisiz.'));
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <AuthShell
      title="Tekrar Hos Geldin"
      subtitle="Hesabina guvenli sekilde giris yap ve futbol analizlerine basla."
      enterDelay={30}>
      <View style={{gap: 14}}>
        {/* Mode Selection - More subtle */}
        <Animated.View entering={FadeInDown.delay(130).duration(340)}>
          <View style={{
            flexDirection: 'row',
            backgroundColor: colors.surface,
            borderRadius: 12,
            padding: 4,
            gap: 4,
          }}>
            <GradientButton
              title="Sifre"
              onPress={() => {
                setMode('password');
                setError('');
                setSuccess('');
              }}
              variant={mode === 'password' ? 'primary' : 'secondary'}
              size="sm"
              style={{flex: 1}}
            />
            <GradientButton
              title="Kod"
              onPress={() => {
                setMode('code');
                setError('');
                setSuccess('');
              }}
              variant={mode === 'code' ? 'primary' : 'secondary'}
              size="sm"
              style={{flex: 1}}
            />
          </View>
        </Animated.View>

        {/* Email Input */}
        <Animated.View entering={FadeInDown.delay(170).duration(360)}>
          <AppTextInput 
            label="Email Adresi" 
            value={email} 
            onChangeText={setEmail} 
            autoCapitalize="none" 
            keyboardType="email-address" 
            iconName="mail-outline" 
          />
        </Animated.View>

        {/* Password or Code Input */}
        {mode === 'password' ? (
          <Animated.View entering={FadeInDown.delay(220).duration(360)}>
            <AppTextInput 
              label="Sifre" 
              value={password} 
              onChangeText={setPassword} 
              secureTextEntry 
              showPasswordToggle
              iconName="lock-closed-outline" 
            />
          </Animated.View>
        ) : (
          <>
            <Animated.View entering={FadeInDown.delay(220).duration(360)}>
              <AppTextInput 
                label="Dogrulama Kodu" 
                value={code} 
                onChangeText={setCode} 
                iconName="key-outline" 
                keyboardType="number-pad"
              />
            </Animated.View>
            <Animated.View entering={FadeInDown.delay(260).duration(360)}>
              <GradientButton 
                title="Email'e Kod Gonder" 
                onPress={onSendCode} 
                loading={sendingCode} 
                variant="secondary" 
                iconName="paper-plane-outline" 
              />
            </Animated.View>
          </>
        )}

        {/* Error/Success Messages */}
        {error ? (
          <Animated.View entering={FadeIn.duration(220)}>
            <StatusBanner message={error} tone="error" />
          </Animated.View>
        ) : null}

        {success ? (
          <Animated.View entering={FadeIn.duration(220)}>
            <StatusBanner message={success} tone="success" />
          </Animated.View>
        ) : null}

        {/* Login Button */}
        <Animated.View entering={FadeInDown.delay(300).duration(360)} style={{marginTop: 4}}>
          <GradientButton 
            title={mode === 'password' ? 'Giris Yap' : 'Kod ile Giris'} 
            onPress={onSubmit} 
            loading={loading} 
            iconName="log-in-outline" 
          />
        </Animated.View>

        {/* Divider */}
        <Animated.View entering={FadeInDown.delay(330).duration(360)}>
          <View style={{flexDirection: 'row', alignItems: 'center', marginVertical: 4}}>
            <View style={{flex: 1, height: 1, backgroundColor: colors.line}} />
            <Text style={{marginHorizontal: 12, fontSize: 12, color: colors.textMuted}}>veya</Text>
            <View style={{flex: 1, height: 1, backgroundColor: colors.line}} />
          </View>
        </Animated.View>

        {/* Gmail Sign In */}
        <Animated.View entering={FadeInDown.delay(360).duration(360)}>
          <GradientButton
            title="Gmail ile Giris Yap"
            variant="secondary"
            iconName="logo-google"
            loading={googleLoading}
            onPress={onGoogleLogin}
          />
        </Animated.View>

        {/* Secondary Actions */}
        <Animated.View entering={FadeInDown.delay(390).duration(360)} style={{gap: 10, marginTop: 4}}>
          <GradientButton 
            title="Yeni Hesap Olustur" 
            onPress={() => navigation.navigate('Register')} 
            variant="secondary" 
            iconName="person-add-outline"
          />
          <GradientButton 
            title="Sifremi Unuttum" 
            onPress={() => navigation.navigate('ForgotPassword')} 
            variant="ghost" 
            iconName="help-circle-outline"
          />
        </Animated.View>
      </View>
    </AuthShell>
  );
}
