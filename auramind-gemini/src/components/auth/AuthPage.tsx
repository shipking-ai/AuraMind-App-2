import React, { useCallback, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2 } from "@/components/icons";
import { supabase } from "../../services/database/supabase";
import TurnstileWidget, { isTurnstileEnabled, type TurnstileHandle } from './TurnstileWidget';
import { analyticsService } from "../../services/analytics/analyticsService";
import { needsMfaChallenge, listFactors, completeMfaChallenge } from "../../services/auth/mfaService";
import { FrostGlass } from "../ui/FrostGlass";
import { BorderBeam } from "../ui/BorderBeam";
import { Capacitor } from "../../lib/nativeShim";
import { hasCompletedOnboarding } from "../../lib/onboardingGate";


export default function AuthPage() {
  const isNativeApp = Capacitor.isNativePlatform();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<"login" | "signup">(
    searchParams.get("mode") === "login" ? "login" : "signup",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Turnstile. Tokens are single-use and expire, so the widget is reset
  // after every failed attempt — otherwise the retry fails as
  // "captcha_failed" instead of showing the real error.
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle | null>(null);
  const handleCaptchaToken = useCallback((t: string | null) => setCaptchaToken(t), []);
  // Set when signup needs email confirmation before the account activates.
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);
  // Two-factor challenge state — entered after a successful password sign-in
  // when the account has TOTP factors enrolled (session is aal1 until then).
  const [mfaPending, setMfaPending] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState<string>("");
  const [mfaCode, setMfaCode] = useState("");

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await completeMfaChallenge(mfaFactorId, mfaCode.replace(/\s+/g, ""));
      // MFA users are returning accounts that finished onboarding already.
      navigate("/dashboard");
    } catch (err: any) {
      setError(err.message || "Invalid verification code");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    if (!supabase) {
      setError("Authentication is not configured. Missing Supabase credentials.");
      return;
    }

    setLoading(true);

    if (mode === "signup") {
      // fire-and-forget — analytics must never block auth
      analyticsService.trackFunnel("signup_started", { method: "email" });
    }

    try {
      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            ...(captchaToken ? { captchaToken } : {}),
          },
        });
        if (signUpError) throw signUpError;
        if (!data.session) {
          // Confirmation emails are enabled — the account activates only after
          // the user clicks the link. Show an interstitial instead of blindly
          // navigating (which would bounce straight back to /auth).
          analyticsService.trackFunnel("signup_completed", { method: "email", confirmed: false });
          setConfirmEmail(email);
          return;
        }
        analyticsService.trackFunnel("signup_completed", { method: "email", confirmed: true });
        navigate("/onboarding");
      } else {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
          options: captchaToken ? { captchaToken } : undefined,
        });
        if (signInError) throw signInError;
        // 2FA: if the account has TOTP factors the session is untrusted (aal1)
        // until the user completes a challenge. Swap the form for the code step.
        if (await needsMfaChallenge()) {
          const factors = await listFactors();
          if (factors.length > 0) {
            setMfaFactorId(factors[0].id);
            setMfaPending(true);
            return;
          }
        }
        // Returning users that finished onboarding go straight in. A fresh
        // signup that skips onboarding (e.g. the interstitial beat the confirm
        // email) is routed through the role/topic flow too.
        navigate(
          hasCompletedOnboarding(signInData.user?.user_metadata) ? "/dashboard" : "/onboarding",
        );
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
      // The token was consumed by the attempt. Without this reset the retry
      // fails as "captcha_failed" and hides the real error.
      turnstileRef.current?.reset();
    } finally {
      setLoading(false);
    }
  };

  const handleNotionSSO = async () => {
    if (!supabase) {
      setError("Authentication is not configured. Missing Supabase credentials.");
      return;
    }

    setLoading(true);
    try {
      await supabase.auth.signInWithOAuth({
        provider: "notion",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      setLoading(false);
    } catch (err: any) {
      setError(err.message || "Notion sign-in failed");
      setLoading(false);
    }
  };

  const handleGoogleSSO = async () => {
    if (!supabase) {
      setError("Authentication is not configured. Missing Supabase credentials.");
      return;
    }

    setLoading(true);
    try {
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      // Success: the browser redirects to the provider. Exiting the loading
      // state guards the edge case where the redirect is deferred/blocked.
      setLoading(false);
    } catch (err: any) {
      setError(err.message || "Google sign-in failed");
      setLoading(false);
    }
  };

  return (
    <div className={`${isNativeApp ? "android-auth-page" : ""} min-h-screen bg-[#0A0A0F] flex flex-col`}>
      <div className="px-6 py-4">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-[#7A7A96] hover:text-[#F0EFFE] text-xs transition-colors"
        >
          <span>←</span>
          <span>{isNativeApp ? "Back" : "Back to home"}</span>
        </button>
      </div>

      {/* Aurora glow background */}
      <div className="fixed inset-0 pointer-events-none">
        <img
          src="/auramind/aurora-glow.png"
          alt=""
          className="w-full h-full object-cover"
          style={{ opacity: 0.3 }}
        />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full opacity-[0.05]"
          style={{ background: "radial-gradient(circle, #7C3AED 0%, transparent 70%)", filter: "blur(80px)" }}
        />
      </div>

      <div className="flex-1 flex items-center justify-center px-6 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm"
        >
          {/* Logo */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center">
                <img src="/favicons,logos/favicon.svg" alt="AuraMind" className="h-full w-full object-contain" />
              </div>
              <span className="text-[#F0EFFE] text-base font-medium tracking-tight font-script">AuraMind</span>
            </div>
            <h1 className="text-[#F0EFFE] text-lg font-light tracking-tight mb-1">
              {mode === "signup" ? "Create your account" : "Welcome back"}
            </h1>
            <p className="text-[#7A7A96] text-xs">
              {mode === "signup"
                ? "Start with one topic. You can change everything else later."
                : "Your queue is waiting where you left it."}
            </p>
            {isNativeApp && (
              <div className="android-auth-trust" aria-label="Sign-in details">
                <span><i /> Secure sign-in</span>
                <span><i /> Preferences sync</span>
              </div>
            )}
          </div>

          {/* Card */}
          <BorderBeam duration={5} colorFrom="#7c3aed" colorTo="#3b82f6">
            <FrostGlass blur="xl" opacity={0.08} className="p-6">
            {/* SSO Buttons */}
            {/* SSO buttons — hidden during the 2FA challenge */}
            {!mfaPending && (
            <>
            <button
              onClick={handleGoogleSSO}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 bg-white rounded-lg text-[#1A1A24] text-sm font-medium hover:bg-gray-100 transition-all mb-3 disabled:opacity-50"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>
            <button
              onClick={handleNotionSSO}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 bg-white rounded-lg text-[#1A1A24] text-sm font-medium hover:bg-gray-100 transition-all mb-4 disabled:opacity-50"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <rect x="2" y="2" width="20" height="20" rx="4" fill="black"/>
                <text x="7.5" y="17" fontSize="13" fontWeight="bold" fill="white" fontFamily="Arial">N</text>
              </svg>
              Continue with Notion
            </button>

            {/* Divider */}
            <div className="relative mb-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#2A2A3A]" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-[#111118] px-3 text-[#7A7A96] text-xs">or</span>
              </div>
            </div>
            </>
            )}

            {/* Error */}
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                {error}
              </div>
            )}

            {/* Two-factor challenge — shown instead of the password form */}
            {mfaPending ? (
              <form onSubmit={handleMfaSubmit} className="space-y-3">
                <div className="text-center mb-2">
                  <h2 className="text-[#F0EFFE] text-sm font-medium">Two-factor authentication</h2>
                  <p className="text-[#7A7A96] text-xs mt-1">
                    Enter the 6-digit code from your authenticator app
                  </p>
                </div>
                <input
                  id="mfa-code"
                  name="mfaCode"
                  autoComplete="one-time-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9 ]*"
                  maxLength={7}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  className="w-full bg-[#1A1A24] border border-[#2A2A3A] rounded-lg px-3 py-2.5 text-[#F0EFFE] text-lg text-center tracking-[0.4em] outline-none focus:border-[#7C3AED]/50 focus:ring-1 focus:ring-[#7C3AED]/20 transition-all"
                  placeholder="000000"
                  required
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={loading || mfaCode.replace(/\s/g, "").length !== 6}
                  className="w-full py-2.5 bg-[#7C3AED] text-white text-sm font-medium rounded-lg hover:bg-[#6D28D9] transition-all duration-300 shadow-[0_0_20px_rgba(124,58,237,0.2)] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 size={14} className="animate-spin" />}
                  Verify →
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMfaPending(false);
                    setMfaCode("");
                    setError(null);
                    void supabase?.auth.signOut();
                  }}
                  className="w-full text-center text-[#7A7A96] hover:text-[#9090A8] text-xs transition-colors"
                >
                  Use a different account
                </button>
              </form>
            ) : (
            <>
            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label htmlFor="auth-email" className="block text-[#9090A8] text-xs mb-1">
                  Email
                </label>
                <input
                  id="auth-email"
                  name="email"
                  // Without autoComplete/name, password managers neither
                  // offer to fill nor prompt to save — a direct cost on the
                  // signup path.
                  autoComplete="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#1A1A24] border border-[#2A2A3A] rounded-lg px-3 py-2.5 text-[#F0EFFE] text-sm placeholder-[#7A7A96] outline-none focus:border-[#7C3AED]/50 focus:ring-1 focus:ring-[#7C3AED]/20 transition-all"
                  placeholder="you@example.com"
                  required
                />
              </div>
              {!mfaPending && (
                <div>
                  <label htmlFor="auth-password" className="block text-[#9090A8] text-xs mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="auth-password"
                      name="password"
                      // "new-password" tells a manager to offer a generated
                      // password on signup and not to autofill the saved one.
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-[#1A1A24] border border-[#2A2A3A] rounded-lg px-3 py-2.5 text-[#F0EFFE] text-sm placeholder-[#7A7A96] outline-none focus:border-[#7C3AED]/50 focus:ring-1 focus:ring-[#7C3AED]/20 transition-all pr-10"
                      placeholder={mode === "signup" ? "Create a password" : "Enter your password"}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      // Icon-only control: without this it is announced as an
                      // unlabelled button.
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7A7A96] hover:text-[#F0EFFE] text-sm transition-colors"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              )}
              {mode === "signup" && !mfaPending && (
                <div>
                  <label htmlFor="auth-confirm" className="block text-[#9090A8] text-xs mb-1">
                    Confirm password
                  </label>
                  <input
                    id="auth-confirm"
                    name="confirmPassword"
                    autoComplete="new-password"
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-[#1A1A24] border border-[#2A2A3A] rounded-lg px-3 py-2.5 text-[#F0EFFE] text-sm placeholder-[#7A7A96] outline-none focus:border-[#7C3AED]/50 focus:ring-1 focus:ring-[#7C3AED]/20 transition-all"
                    placeholder="Confirm your password"
                    required
                  />
                </div>
              )}

              <TurnstileWidget
                onToken={handleCaptchaToken}
                handleRef={turnstileRef}
                className="flex justify-center"
              />

              <button
                type="submit"
                disabled={loading || (isTurnstileEnabled() && !captchaToken)}
                className="w-full py-2.5 bg-[#7C3AED] text-white text-sm font-medium rounded-lg hover:bg-[#6D28D9] transition-all duration-300 shadow-[0_0_20px_rgba(124,58,237,0.2)] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 size={14} className="animate-spin" />}
                {mode === "signup" ? "Start learning" : "Sign in"} →
              </button>
            </form>
            </>
            )}

            {/* Confirmation required (email confirmations enabled) */}
            {confirmEmail && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 p-4 rounded-xl bg-violet-500/10 border border-violet-500/20 text-center"
              >
                <p className="text-sm font-semibold text-[#F0EFFE] mb-1">Check your inbox</p>
                <p className="text-xs text-[#9090A8] leading-relaxed mb-3">
                  We sent a confirmation link to <span className="text-[#8B5CF6] break-all">{confirmEmail}</span>.
                  Tap it to activate your account — your progress will be waiting when you come back.
                </p>
                <button
                  onClick={() => { setConfirmEmail(null); setMode("login"); }}
                  className="text-[10px] font-bold text-[#8B5CF6] hover:text-[#7C3AED] uppercase tracking-wider transition-colors"
                >
                  Back to sign in
                </button>
              </motion.div>
            )}
            </FrostGlass>
          </BorderBeam>

          {/* Toggle */}
          <p className="text-center mt-6 text-[#7A7A96] text-xs">
            {mode === "signup" ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              onClick={() => { setMode(mode === "signup" ? "login" : "signup"); setError(null); }}
              className="text-[#8B5CF6] hover:text-[#7C3AED] transition-colors font-medium"
            >
              {mode === "signup" ? "Sign In" : "Sign Up"}
            </button>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
