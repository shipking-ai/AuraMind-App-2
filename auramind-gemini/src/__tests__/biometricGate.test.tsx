import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { setAppPreference } from "../lib/appPreferences";
import { BiometricGate, APP_LOCK_PREF_KEY } from "../components/native/BiometricGate";

vi.mock("../lib/nativeShim", () => ({
  Capacitor: { isNativePlatform: () => true },
}));

vi.mock("../hooks/useNative", () => ({
  useAppLifecycle: () => "active",
  useBiometricAuth: () => ({
    getAvailability: async () => ({ isAvailable: true, biometryType: "fingerprint" }),
    // The user dismisses the sheet: the gate must stay up.
    authenticate: async () => false,
  }),
}));

vi.mock("../components/native/androidHaptics", () => ({
  hapticSuccess: () => undefined,
  hapticWarning: () => undefined,
}));

describe("BiometricGate", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders nothing when the lock preference is off", () => {
    const { container } = render(<BiometricGate />);
    expect(container).toBeEmptyDOMElement();
  });

  it("covers the app when the lock preference is on and auth fails", async () => {
    setAppPreference(APP_LOCK_PREF_KEY, true);
    render(<BiometricGate />);
    expect(await screen.findByRole("alertdialog", { name: "Unlock AuraMind" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Unlock" })).not.toBeNull();
  });
});
