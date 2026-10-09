import { APP_NAME, APP_TAGLINE } from '@bonamind/core';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { sendEmailCode, signInWithPassword, verifyEmailCode, type SignInError } from '../data/auth';
import { PrimaryButton } from '../design/components/PrimaryButton';
import { SecondaryButton } from '../design/components/SecondaryButton';
import { useMotion } from '../design/motion';
import { colors, fonts, radius, space } from '../design/tokens';
import { env } from '../env';
import { signInWithApple } from './apple';
import { signInWithGoogle } from './oauth';
import { TurnstileGate } from './TurnstileGate';

export const SIGN_IN_COPY: Record<SignInError | 'no_captcha', string> = {
  invalid_credentials: "That email and password don't match. Try again or use a code.",
  captcha_failed: "We couldn't verify you're human. Try again.",
  invalid_code: 'That code has expired or is wrong. Send a new one.',
  network: "You're offline. Connect to sign in.",
  unknown: 'Something went wrong. Try again in a moment.',
  no_captcha: 'Complete the check above first.',
};

type Mode = 'password' | 'code';

export function WelcomeScreen() {
  const { reduce } = useMotion();
  const [emailOpen, setEmailOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const [error, setError] = useState<keyof typeof SIGN_IN_COPY | null>(null);
  const [busy, setBusy] = useState(false);

  const fail = (e: keyof typeof SIGN_IN_COPY) => {
    setError(e);
    // A Turnstile token is single-use: re-arm the check after any failure.
    if (e !== 'no_captcha') { setCaptcha(null); setCaptchaKey((k) => k + 1); }
  };

  async function submit() {
    setError(null);
    if (mode === 'code' && codeSent) {
      setBusy(true);
      const { error: e } = await verifyEmailCode(email.trim(), code.trim());
      setBusy(false);
      if (e) fail(e);
      return;
    }
    if (!captcha) return fail('no_captcha');
    setBusy(true);
    const { error: e } = mode === 'password'
      ? await signInWithPassword(email.trim(), password, captcha)
      : await sendEmailCode(email.trim(), captcha);
    setBusy(false);
    if (e) return fail(e);
    if (mode === 'code') setCodeSent(true);
  }

  const enter = (i: number) => (reduce ? undefined : FadeInDown.delay(150 + i * 90).springify().damping(14).stiffness(160));

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Animated.View entering={reduce ? undefined : FadeIn.duration(900)} style={styles.brand}>
            <Text style={styles.wordmark} accessibilityRole="header">{APP_NAME}</Text>
            <Text style={styles.tagline}>{APP_TAGLINE}</Text>
          </Animated.View>

          {!emailOpen ? (
            <View style={styles.actions}>
              <Animated.View entering={enter(0)}><PrimaryButton label="Continue with email" onPress={() => setEmailOpen(true)} /></Animated.View>
              <Animated.View entering={enter(1)}><SecondaryButton label="Continue with Google" onPress={() => void signInWithGoogle()} /></Animated.View>
              {env.appleSignIn && (
                <Animated.View entering={enter(2)}><SecondaryButton label="Continue with Apple" onPress={() => void signInWithApple()} /></Animated.View>
              )}
            </View>
          ) : (
            <Animated.View entering={enter(0)} style={styles.form}>
              <TextInput
                accessibilityLabel="Email" value={email} onChangeText={setEmail} placeholder="you@example.com"
                placeholderTextColor={colors.textMuted} autoCapitalize="none" autoComplete="email" keyboardType="email-address"
                textContentType="emailAddress" style={styles.input}
              />
              {mode === 'password' && (
                <TextInput
                  accessibilityLabel="Password" value={password} onChangeText={setPassword} placeholder="Password"
                  placeholderTextColor={colors.textMuted} secureTextEntry autoComplete="current-password" textContentType="password" style={styles.input}
                />
              )}
              {mode === 'code' && codeSent && (
                <TextInput
                  accessibilityLabel="Code" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit code"
                  placeholderTextColor={colors.textMuted} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" style={styles.input}
                />
              )}
              {!(mode === 'code' && codeSent) && (
                <TurnstileGate key={captchaKey} onToken={(t) => { setCaptcha(t); setError((e) => (e === 'no_captcha' ? null : e)); }} onError={() => fail('captcha_failed')} />
              )}
              {error && <Text style={styles.error} accessibilityLiveRegion="polite">{SIGN_IN_COPY[error]}</Text>}
              <PrimaryButton
                label={busy ? 'One moment…' : mode === 'password' ? 'Sign in' : codeSent ? 'Verify code' : 'Email me a code'}
                onPress={() => { if (!busy) void submit(); }}
              />
              <SecondaryButton
                label={mode === 'password' ? 'Use a code instead' : 'Use a password instead'}
                onPress={() => { setMode(mode === 'password' ? 'code' : 'password'); setCodeSent(false); setError(null); }}
              />
            </Animated.View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  fill: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'flex-end', padding: space.xl, gap: space.xl },
  brand: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', gap: space.sm },
  wordmark: { color: colors.text, fontFamily: fonts.display, fontSize: 64, lineHeight: 70 },
  tagline: { color: colors.violetMist, fontFamily: fonts.displayItalic, fontSize: 20 },
  actions: { gap: space.md },
  form: { gap: space.md },
  input: {
    backgroundColor: colors.surface, color: colors.text, fontFamily: fonts.ui, fontSize: 16,
    borderRadius: radius.tile, paddingHorizontal: space.lg, paddingVertical: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline,
  },
  error: { color: colors.again, fontFamily: fonts.ui, fontSize: 14 },
});
