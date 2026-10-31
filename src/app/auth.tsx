import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";
import { useAuth, useSignIn, useSignUp, useSSO } from "@clerk/expo";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { posthog } from "@/lib/posthog";
import { posthogLogs } from "@/lib/posthog-logs";

function useWarmUpBrowser() {
  useEffect(() => {
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
}

type AuthStep = "signup" | "verify" | "signin";
type VerificationFlow = "signup" | "signin";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function ChevronLeftIcon({ size = 20, color = "#111116" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 19l-7-7 7-7"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function PersonIcon({ size = 22, color = "#111116" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle
        cx="12"
        cy="7"
        r="4"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function MailIcon({ size = 22, color = "#111116" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="3"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M3 7l9 6 9-6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function LockIcon({ size = 22, color = "#111116" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect
        x="4"
        y="10"
        width="16"
        height="11"
        rx="2.5"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M7 10V7a5 5 0 0 1 10 0v3"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function EyeIcon({ visible, size = 22, color = "#111116" }: { visible: boolean; size?: number; color?: string }) {
  if (visible) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
          d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth={2} />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line
        x1="1"
        y1="1"
        x2="23"
        y2="23"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ArrowRightIcon({ size = 20, color = "#111116" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 12h14M13 5l7 7-7 7"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function GoogleLogo({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"
      />
      <Path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.15v2.84C3.96 20.53 7.7 23 12 23Z"
      />
      <Path
        fill="#FBBC05"
        d="M5.84 14.1a6.8 6.8 0 0 1 0-4.2V7.06H2.15a11 11 0 0 0 0 9.88l3.69-2.84Z"
      />
      <Path
        fill="#EA4335"
        d="M12 4.36c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45.99 14.97 0 12 0 7.7 0 3.96 2.47 2.15 6.06l3.69 2.84C6.71 6.29 9.14 4.36 12 4.36Z"
      />
    </Svg>
  );
}

function AppleLogo({ size = 20, color = "#111116" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size * 1.2} viewBox="0 0 170 170">
      <Path
        fill={color}
        d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.69-3.04-7.56-7.71-11.61-14.01-6.19-9.56-10.9-20.2-14.13-31.93-3.23-11.73-4.85-22.75-4.85-33.05 0-14.35 3.69-26.24 11.06-35.66 7.37-9.42 16.73-14.24 28.09-14.46 5.03 0 10.56 1.34 16.59 4.02 6.03 2.68 10.02 4.07 11.97 4.18 1.45 0 5.69-1.45 12.72-4.35 7.03-2.9 12.87-4.18 17.52-3.84 13.74.89 24.38 5.75 31.93 14.58-12.18 7.37-18.17 17.52-17.96 30.45.22 10.39 4.13 19.14 11.73 26.26 7.6 7.12 16.63 11.22 27.09 12.3-2.35 7.03-5.25 14.31-8.71 21.84zm-37.47-111.4c0 6.81-2.51 13.3-7.53 18.47-5.02 5.17-11.04 8.44-18.06 9.8-1.01-6.59.84-13.25 5.56-18.42 4.72-5.17 11.23-8.83 18.23-9.85.67 0 1.25 0 1.8.05z"
      />
    </Svg>
  );
}

export default function AuthScreen() {
  useWarmUpBrowser();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { signIn, fetchStatus: signInFetchStatus } = useSignIn();
  const { signUp, fetchStatus: signUpFetchStatus } = useSignUp();
  const { startSSOFlow } = useSSO();
  const [step, setStep] = useState<AuthStep>(mode === "signin" ? "signin" : "signup");
  const [verificationFlow, setVerificationFlow] = useState<VerificationFlow>(
    mode === "signin" ? "signin" : "signup",
  );
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isGoogleBusy, setIsGoogleBusy] = useState(false);
  const [isAppleBusy, setIsAppleBusy] = useState(false);
  const isBusy =
    isGoogleBusy || isAppleBusy || signInFetchStatus === "fetching" || signUpFetchStatus === "fetching";

  if (!authLoaded) return null;
  if (isSignedIn) return <Redirect href="/home" />;

  function clearMessages() {
    setError("");
    setNotice("");
  }

  function goBack() {
    clearMessages();
    if (step === "verify") {
      setStep(verificationFlow);
      return;
    }
    if (step === "signin") {
      setStep("signup");
      return;
    }
    // Check if there is a screen in history to prevent "The action GO_BACK was not handled" error
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  }

  async function submitSignUp() {
    if (fullName.trim().length < 2) {
      setError("Enter your full name to continue.");
      return;
    }
    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    clearMessages();
    setVerificationCode("");
    try {
      const { error: resetError } = await signUp.reset();
      if (resetError) {
        setError(resetError.message);
        return;
      }
      const { error: createError } = await signUp.password({
        emailAddress: email.trim(),
        password,
        unsafeMetadata: { fullName: fullName.trim() },
      });
      if (createError) {
        setError(createError.message);
        return;
      }
      const { error: sendError } = await signUp.verifications.sendEmailCode();
      if (sendError) {
        setError(sendError.message);
        return;
      }
      setVerificationFlow("signup");
      setStep("verify");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to send a verification code. Please try again.",
      );
    }
  }

  async function submitVerification() {
    if (verificationCode.length !== 6) {
      setError("Enter the 6-digit verification code.");
      return;
    }
    clearMessages();
    try {
      const { error: verificationError } =
        verificationFlow === "signup"
          ? await signUp.verifications.verifyEmailCode({ code: verificationCode })
          : await signIn.mfa.verifyEmailCode({ code: verificationCode });
      if (verificationError) {
        setError(verificationError.message);
        return;
      }

      const { error: finalizeError } =
        verificationFlow === "signup"
          ? signUp.status === "complete"
            ? await signUp.finalize()
            : { error: null }
          : signIn.status === "complete"
            ? await signIn.finalize()
            : { error: null };
      if (finalizeError) {
        setError(finalizeError.message);
        return;
      }
      if (
        (verificationFlow === "signup" && signUp.status !== "complete") ||
        (verificationFlow === "signin" && signIn.status !== "complete")
      ) {
        setError("More information is required to finish signing in. Please contact support.");
        return;
      }
      posthog?.capture("authentication_completed", {
        authentication_method: "email_code",
        authentication_flow: verificationFlow,
      });
      posthogLogs.authenticationCompleted("email_code", verificationFlow);
      router.replace("/home");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to verify your code. Please try again.",
      );
    }
  }

  async function submitSignIn() {
    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setError("Your password must be at least 8 characters.");
      return;
    }
    clearMessages();
    setVerificationCode("");
    try {
      const { error: signInError } = await signIn.password({
        identifier: email.trim(),
        password,
      });
      if (signInError) {
        setError(signInError.message);
        return;
      }
      if (signIn.status === "complete") {
        const { error: finalizeError } = await signIn.finalize();
        if (finalizeError) {
          setError(finalizeError.message);
          return;
        }
        posthog?.capture("authentication_completed", {
          authentication_method: "password",
          authentication_flow: "signin",
        });
        posthogLogs.authenticationCompleted("password", "signin");
        router.replace("/home");
        return;
      }
      if (
        (signIn.status === "needs_client_trust" || signIn.status === "needs_second_factor") &&
        signIn.supportedSecondFactors.some((factor) => factor.strategy === "email_code")
      ) {
        const { error: sendError } = await signIn.mfa.sendEmailCode();
        if (sendError) {
          setError(sendError.message);
          return;
        }
        setVerificationFlow("signin");
        setStep("verify");
        return;
      }
      setError("This sign-in requires a verification method that isn’t available here.");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to sign in. Please try again.",
      );
    }
  }

  async function continueWithGoogle() {
    clearMessages();
    setIsGoogleBusy(true);
    try {
      const redirectUrl = Linking.createURL("sso-callback");
      console.log("[Google Auth] Initiating SSO with redirectUrl:", redirectUrl);

      const result = await startSSOFlow({
        strategy: "oauth_google",
        redirectUrl,
        unsafeMetadata: isSignUp && fullName.trim() ? { fullName: fullName.trim() } : undefined,
      });

      console.log("[Google Auth] Result:", JSON.stringify(result, null, 2));

      if (result.createdSessionId) {
        if (result.setActive) {
          await result.setActive({ session: result.createdSessionId });
        }
        const authenticationFlow = isSignUp ? "signup" : "signin";
        posthog?.capture("authentication_completed", {
          authentication_method: "google_sso",
          authentication_flow: authenticationFlow,
        });
        posthogLogs.authenticationCompleted("google_sso", authenticationFlow);
        router.replace("/home");
      } else if (result.signUp?.status === "missing_requirements") {
        setError("We couldn’t finish setting up your account. Try signing up with email.");
      } else if (result.authSessionResult?.type === "cancel" || result.authSessionResult?.type === "dismiss") {
        console.log("[Google Auth] User dismissed or cancelled authentication browser.");
      } else {
        const errorDesc =
          (result.signIn as any)?.firstFactorVerification?.error?.message ||
          result.authSessionResult?.type ||
          "Session not created";
        setError(`Google sign-in incomplete: ${errorDesc}. You can also sign in with Email & Password.`);
      }
    } catch (caughtError) {
      console.error("[Google Auth Error]", caughtError);
      const rawMsg = caughtError instanceof Error ? caughtError.message : String(caughtError);
      if (
        rawMsg.toLowerCase().includes("cancel") ||
        rawMsg.toLowerCase().includes("dismiss") ||
        rawMsg.includes("SIGN_IN_CANCELLED") ||
        rawMsg.includes("-5")
      ) {
        return;
      }
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to continue with Google. Please try again or use Email.",
      );
    } finally {
      setIsGoogleBusy(false);
    }
  }

  async function continueWithApple() {
    clearMessages();
    setIsAppleBusy(true);
    try {
      const redirectUrl = Linking.createURL("sso-callback");
      const { createdSessionId, setActive, signUp: pendingSignUp } = await startSSOFlow({
        strategy: "oauth_apple",
        redirectUrl,
        unsafeMetadata: isSignUp && fullName.trim() ? { fullName: fullName.trim() } : undefined,
      });
      if (createdSessionId) {
        if (setActive) {
          await setActive({ session: createdSessionId });
        }
        const authenticationFlow = isSignUp ? "signup" : "signin";
        posthog?.capture("authentication_completed", {
          authentication_method: "apple_sso",
          authentication_flow: authenticationFlow,
        });
        posthogLogs.authenticationCompleted("apple_sso", authenticationFlow);
        router.replace("/home");
      } else if (pendingSignUp?.status === "missing_requirements") {
        setError("We couldn’t finish setting up your account. Try signing up with email.");
      }
    } catch (caughtError) {
      const rawMsg = caughtError instanceof Error ? caughtError.message : String(caughtError);
      if (
        rawMsg.toLowerCase().includes("cancel") ||
        rawMsg.toLowerCase().includes("dismiss") ||
        rawMsg.includes("SIGN_IN_CANCELLED") ||
        rawMsg.includes("-5")
      ) {
        return;
      }
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to continue with Apple. Please try again.",
      );
    } finally {
      setIsAppleBusy(false);
    }
  }

  const isSignUp = step === "signup";
  const isVerification = step === "verify";
  const title = isVerification
    ? "Check your\nemail"
    : isSignUp
      ? "Create\nyour account"
      : "Welcome\nback";

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Top Bar: Circle Back Button + Logo */}
          <View style={styles.topBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={goBack}
              hitSlop={8}
              style={({ pressed }) => [styles.backButtonCircle, pressed && styles.pressedCircle]}
            >
              <ChevronLeftIcon size={20} color="#111116" />
            </Pressable>
            <Text style={styles.logo}>roam</Text>
          </View>

          {/* Heading and Subtitle */}
          <View style={styles.intro}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>
              {isVerification
                ? `We sent a 6-digit code to ${email.trim()}. Enter it below to ${verificationFlow === "signup" ? "verify your email" : "sign in"}.`
                : isSignUp
                  ? "Join roam to save your stays, get personalized recommendations and access them across all your devices."
                  : "Sign in to see your saved stays and get back to planning your next trip."}
            </Text>
          </View>

          {/* Form Fields */}
          {isVerification ? (
            <View style={styles.form}>
              <Text style={styles.fieldLabel}>Verification code</Text>
              <View style={styles.codeContainer}>
                <View style={styles.codeBoxes} pointerEvents="none">
                  {Array.from({ length: 6 }, (_, index) => (
                    <View
                      key={index}
                      style={[
                        styles.codeBox,
                        index === verificationCode.length && styles.codeBoxActive,
                      ]}
                    >
                      <Text style={styles.codeDigit}>{verificationCode[index] ?? ""}</Text>
                    </View>
                  ))}
                </View>
                <TextInput
                  accessibilityLabel="6-digit verification code"
                  autoComplete="one-time-code"
                  autoFocus
                  keyboardType="number-pad"
                  maxLength={6}
                  onChangeText={(value) => {
                    setVerificationCode(value.replace(/\D/g, "").slice(0, 6));
                    setError("");
                  }}
                  style={styles.codeInput}
                  textContentType="oneTimeCode"
                  value={verificationCode}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={async () => {
                  clearMessages();
                  try {
                    const { error: resendError } =
                      verificationFlow === "signup"
                        ? await signUp.verifications.sendEmailCode()
                        : await signIn.mfa.sendEmailCode();
                    if (resendError) {
                      setError(resendError.message);
                      return;
                    }
                    setVerificationCode("");
                    setNotice(`A new code was sent to ${email.trim()}.`);
                  } catch (caughtError) {
                    setError(
                      caughtError instanceof Error
                        ? caughtError.message
                        : "Unable to resend the code. Please try again.",
                    );
                  }
                }}
                style={styles.resendButton}
                disabled={isBusy}
              >
                <Text style={styles.resendText}>Didn’t get a code? Resend</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.form}>
              {isSignUp && (
                <View style={styles.fieldCard}>
                  <View style={styles.fieldIcon}>
                    <PersonIcon size={22} color="#111116" />
                  </View>
                  <View style={styles.fieldContent}>
                    <Text style={styles.fieldLabel}>Full name</Text>
                    <TextInput
                      accessibilityLabel="Full name"
                      autoComplete="name"
                      onChangeText={(value) => {
                        setFullName(value);
                        setError("");
                      }}
                      placeholder="e.g. Adrian Hajdin"
                      placeholderTextColor="#9CA3AF"
                      returnKeyType="next"
                      style={styles.fieldInput}
                      textContentType="name"
                      value={fullName}
                    />
                  </View>
                </View>
              )}

              <View style={styles.fieldCard}>
                <View style={styles.fieldIcon}>
                  <MailIcon size={22} color="#111116" />
                </View>
                <View style={styles.fieldContent}>
                  <Text style={styles.fieldLabel}>Email address</Text>
                  <TextInput
                    accessibilityLabel="Email address"
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                    onChangeText={(value) => {
                      setEmail(value);
                      setError("");
                    }}
                    placeholder="you@example.com"
                    placeholderTextColor="#9CA3AF"
                    returnKeyType="next"
                    style={styles.fieldInput}
                    textContentType="emailAddress"
                    value={email}
                  />
                </View>
              </View>

              <View style={styles.fieldCard}>
                <View style={styles.fieldIcon}>
                  <LockIcon size={22} color="#111116" />
                </View>
                <View style={styles.fieldContent}>
                  <Text style={styles.fieldLabel}>Password</Text>
                  <TextInput
                    accessibilityLabel="Password"
                    autoCapitalize="none"
                    autoComplete={isSignUp ? "new-password" : "current-password"}
                    onChangeText={(value) => {
                      setPassword(value);
                      setError("");
                    }}
                    onSubmitEditing={isSignUp ? submitSignUp : submitSignIn}
                    placeholder={isSignUp ? "At least 8 characters" : "Your password"}
                    placeholderTextColor="#9CA3AF"
                    returnKeyType="go"
                    secureTextEntry={!passwordVisible}
                    style={styles.fieldInput}
                    textContentType={isSignUp ? "newPassword" : "password"}
                    value={password}
                  />
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={passwordVisible ? "Hide password" : "Show password"}
                  onPress={() => setPasswordVisible((visible) => !visible)}
                  hitSlop={12}
                  style={styles.visibilityButton}
                >
                  <EyeIcon visible={passwordVisible} size={21} color="#6B7280" />
                </Pressable>
              </View>
            </View>
          )}

          {/* Feedback & Actions */}
          <View style={styles.actions}>
            {notice ? (
              <View style={styles.notice}>
                <Text style={styles.noticeText}>{notice}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss message"
                  onPress={() => setNotice("")}
                  hitSlop={8}
                >
                  <Text style={styles.noticeClose}>×</Text>
                </Pressable>
              </View>
            ) : null}

            {!isVerification ? <View nativeID="clerk-captcha" /> : null}

            {error ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            ) : null}

            {/* Primary Action Button */}
            <Pressable
              accessibilityRole="button"
              onPress={isVerification ? submitVerification : isSignUp ? submitSignUp : submitSignIn}
              disabled={isBusy}
              style={({ pressed }) => [
                styles.primaryButton,
                (pressed || isBusy) && styles.pressed,
              ]}
            >
              {isBusy ? (
                <ActivityIndicator color="#111116" size="small" />
              ) : (
                <>
                  <Text style={styles.primaryButtonText}>
                    {isVerification
                      ? verificationFlow === "signup"
                        ? "Verify email"
                        : "Verify sign-in"
                      : isSignUp
                        ? "Create account"
                        : "Sign in"}
                  </Text>
                  <View style={styles.primaryArrowWrap}>
                    <ArrowRightIcon size={20} color="#111116" />
                  </View>
                </>
              )}
            </Pressable>

            {!isVerification && (
              <View style={styles.socialOptions}>
                {/* Divider with 'or' */}
                <View style={styles.separator}>
                  <View style={styles.separatorLine} />
                  <Text style={styles.separatorText}>or</Text>
                  <View style={styles.separatorLine} />
                </View>

                {/* Continue with Google */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Continue with Google"
                  disabled={isBusy}
                  onPress={continueWithGoogle}
                  style={({ pressed }) => [
                    styles.socialButton,
                    (pressed || isGoogleBusy) && styles.pressed,
                  ]}
                >
                  <GoogleLogo size={20} />
                  <Text style={styles.socialButtonText}>
                    {isGoogleBusy ? "Connecting..." : "Continue with Google"}
                  </Text>
                </Pressable>

                {/* Continue with Apple */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Continue with Apple"
                  disabled={isBusy}
                  onPress={continueWithApple}
                  style={({ pressed }) => [
                    styles.socialButton,
                    (pressed || isAppleBusy) && styles.pressed,
                  ]}
                >
                  <AppleLogo size={19} color="#111116" />
                  <Text style={styles.socialButtonText}>
                    {isAppleBusy ? "Connecting..." : "Continue with Apple"}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>

          {/* Footer toggle between sign in / sign up */}
          <View style={styles.footer}>
            {isVerification ? (
              <>
                <Text style={styles.footerText}>Wrong email? </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    clearMessages();
                    setStep(verificationFlow);
                  }}
                >
                  <Text style={styles.footerLink}>Edit details</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.footerText}>
                  {isSignUp ? "Already have an account? " : "Don't have an account? "}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    clearMessages();
                    setStep(isSignUp ? "signin" : "signup");
                  }}
                >
                  <Text style={styles.footerLink}>
                    {isSignUp ? "Sign in" : "Sign up"}
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: "#FFFFFF" },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 28,
  },
  topBar: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButtonCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.2,
    borderColor: "#EBEBEF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  pressedCircle: {
    backgroundColor: "#F4F4F6",
  },
  logo: {
    color: "#111116",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 27,
    letterSpacing: -1.7,
  },
  intro: {
    marginTop: 22,
    marginBottom: 24,
  },
  title: {
    color: "#111116",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 38,
    lineHeight: 42,
    letterSpacing: -1.6,
  },
  subtitle: {
    marginTop: 10,
    color: "#7E8494",
    fontFamily: "Manrope_500Medium",
    fontSize: 14.5,
    lineHeight: 22,
  },
  form: {
    gap: 13,
  },
  fieldCard: {
    height: 68,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: "#F5F6F8",
    gap: 14,
  },
  fieldIcon: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldContent: {
    flex: 1,
    justifyContent: "center",
  },
  fieldLabel: {
    color: "#111116",
    fontFamily: "Manrope_700Bold",
    fontSize: 13.5,
    marginBottom: 2,
  },
  fieldInput: {
    height: 22,
    padding: 0,
    margin: 0,
    color: "#111116",
    fontFamily: "Manrope_500Medium",
    fontSize: 14,
  },
  visibilityButton: {
    padding: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  codeContainer: {
    height: 58,
    justifyContent: "center",
    marginTop: 8,
  },
  codeBoxes: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  codeBox: {
    flex: 1,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.2,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    backgroundColor: "#F5F6F8",
  },
  codeBoxActive: {
    borderColor: "#A98BFF",
    borderWidth: 2,
  },
  codeDigit: {
    color: "#111116",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 20,
  },
  codeInput: {
    ...StyleSheet.absoluteFill,
    zIndex: 1,
    color: "transparent",
    opacity: 0.02,
    fontSize: 24,
  },
  resendButton: {
    alignSelf: "center",
    paddingVertical: 12,
  },
  resendText: {
    color: "#7453D6",
    fontFamily: "Manrope_700Bold",
    fontSize: 12.5,
  },
  actions: {
    marginTop: 18,
  },
  error: {
    marginBottom: 10,
    color: "#C62C4B",
    fontFamily: "Manrope_600SemiBold",
    fontSize: 12,
  },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#E5F5EC",
  },
  noticeText: {
    flex: 1,
    color: "#176B4B",
    fontFamily: "Manrope_600SemiBold",
    fontSize: 12,
  },
  noticeClose: {
    marginLeft: 10,
    color: "#176B4B",
    fontSize: 18,
  },
  primaryButton: {
    height: 58,
    borderRadius: 29,
    backgroundColor: "#FFB800",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  primaryButtonText: {
    color: "#111116",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 16,
  },
  primaryArrowWrap: {
    position: "absolute",
    right: 20,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  socialOptions: {
    marginTop: 4,
  },
  separator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 18,
  },
  separatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#ECECEE",
  },
  separatorText: {
    color: "#9CA3AF",
    fontFamily: "Manrope_500Medium",
    fontSize: 13,
  },
  socialButton: {
    height: 54,
    borderRadius: 27,
    borderWidth: 1.3,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 12,
  },
  socialButtonText: {
    color: "#111116",
    fontFamily: "Manrope_700Bold",
    fontSize: 14.5,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
    marginBottom: 10,
  },
  footerText: {
    color: "#7E8494",
    fontFamily: "Manrope_500Medium",
    fontSize: 13.5,
  },
  footerLink: {
    color: "#111116",
    fontFamily: "Manrope_700Bold",
    fontSize: 13.5,
    textDecorationLine: "underline",
  },
});
