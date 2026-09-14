import { useEffect, useState, useCallback } from "react";
import { Capacitor } from "../lib/nativeShim";
import { Haptics, ImpactStyle, NotificationType } from "../lib/nativeShim";
import { PushNotifications } from "../lib/nativeShim";
import { LocalNotifications } from "../lib/nativeShim";
import { App } from "../lib/nativeShim";
import { Device } from "../lib/nativeShim";
import { Network } from "../lib/nativeShim";
import { Preferences } from "../lib/nativeShim";
import { Filesystem, Directory } from "../lib/nativeShim";
import { Share } from "../lib/nativeShim";
import { Clipboard } from "../lib/nativeShim";
import { StatusBar, Style } from "../lib/nativeShim";
import { SplashScreen } from "../lib/nativeShim";
import { Keyboard } from "../lib/nativeShim";
import { NativeBiometric } from "../lib/nativeShim";

export type PlatformType = "android" | "web" | "desktop";

export interface NativeDeviceInfo {
  platform: PlatformType;
  model: string;
  osVersion: string;
  appVersion: string;
  isNative: boolean;
}

export interface NetworkStatus {
  connected: boolean;
  connectionType: string;
}

export function usePlatform(): PlatformType {
  const [platform, setPlatform] = useState<PlatformType>("web");

  useEffect(() => {
    const initPlatform = async () => {
      const platform = Capacitor.getPlatform();
      if (platform === "android") setPlatform("android");
      else setPlatform("web");
    };
    initPlatform();
  }, []);

  return platform;
}

export function useNativeDeviceInfo(): NativeDeviceInfo | null {
  const [deviceInfo, setDeviceInfo] = useState<NativeDeviceInfo | null>(null);

  useEffect(() => {
    const getDeviceInfo = async () => {
      const platform = Capacitor.getPlatform();
      if (platform === "web") {
        setDeviceInfo({
          platform: "web",
          model: navigator.userAgent,
          osVersion: "",
          appVersion: "2.0.0",
          isNative: false,
        });
        return;
      }

      try {
        const [device, appInfo] = await Promise.all([Device.getInfo(), App.getInfo()]);
        setDeviceInfo({
          platform: platform === "android" ? "android" : "web",
          model: device.model,
          osVersion: device.osVersion,
          appVersion: appInfo.version,
          isNative: true,
        });
      } catch (error) {
        console.error("Failed to get device info:", error);
      }
    };
    getDeviceInfo();
  }, []);

  return deviceInfo;
}

export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({
    connected: true,
    connectionType: "unknown",
  });

  useEffect(() => {
    let disposed = false;
    let nativeListener: { remove: () => void | Promise<void> } | null = null;

    if (!Capacitor.isNativePlatform()) {
      const updateOnlineState = (connected: boolean) => {
        setStatus({ connected, connectionType: connected ? "wifi" : "none" });
      };
      const handleOnline = () => updateOnlineState(true);
      const handleOffline = () => updateOnlineState(false);
      updateOnlineState(navigator.onLine);
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
      return () => {
        // Keep stable handler references so every mounted screen cleans up its
        // listeners. The previous anonymous callbacks accumulated after route
        // changes and continued updating unmounted settings/chat surfaces.
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }

    void Network.getStatus()
      .then((networkStatus) => {
        if (disposed) return;
        setStatus({
          connected: networkStatus.connected,
          connectionType: networkStatus.connectionType,
        });
      })
      .catch(() => undefined);

    // The shim types addListener's args as `unknown[]`, so callback
    // params get no contextual type. These annotations mirror the real
    // @capacitor/network ConnectionStatus payload.
    void Network.addListener(
      "networkStatusChange",
      (networkStatus: { connected: boolean; connectionType: string }) => {
        if (!disposed) {
          setStatus({
            connected: networkStatus.connected,
            connectionType: networkStatus.connectionType,
          });
        }
      },
    )
      .then((listener) => {
        if (disposed) {
          void listener.remove();
        } else {
          nativeListener = listener;
        }
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      if (nativeListener) void nativeListener.remove();
    };
  }, []);

  return status;
}

export function useHaptics() {
  const impact = useCallback(async (style: ImpactStyle = ImpactStyle.Medium) => {
    if (!Capacitor.isNativePlatform()) return;
    await Haptics.impact({ style });
  }, []);

  const selection = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;
    await Haptics.selectionStart();
  }, []);

  const success = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;
    await Haptics.notification({ type: NotificationType.Success });
  }, []);

  const warning = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;
    await Haptics.notification({ type: NotificationType.Warning });
  }, []);

  const error = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;
    await Haptics.notification({ type: NotificationType.Error });
  }, []);

  return { impact, selection, success, warning, error };
}

export function usePushNotifications() {
  const [token, setToken] = useState<string | null>(null);
  const [permission, setPermission] = useState<"granted" | "denied" | "prompt">("prompt");

  const requestPermissions = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;
    const perm = await PushNotifications.requestPermissions();
    setPermission(perm.receive as "granted" | "denied" | "prompt");
    if (perm.receive === "granted") {
      await PushNotifications.register();
    }
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    PushNotifications.addListener("registration", (t: { value: string }) => {
      setToken(t.value);
    });

    PushNotifications.addListener("registrationError", (err: unknown) => {
      console.error("Push registration error:", err);
    });

    return () => {
      PushNotifications.removeAllListeners();
    };
  }, []);

  return { token, permission, requestPermissions };
}

export function useLocalNotifications() {
  const requestPermissions = useCallback(async (): Promise<string> => {
    if (!Capacitor.isNativePlatform()) return "denied";
    const result = await LocalNotifications.requestPermissions();
    return result.display;
  }, []);

  /**
   * Read the current permission without prompting.
   *
   * Distinct from requestPermissions on purpose: the app-start reminder sync
   * needs to know whether it may schedule, but must never raise a system
   * dialog on launch. Only an explicit user action in Settings should ask.
   */
  const checkPermissions = useCallback(async (): Promise<string> => {
    if (!Capacitor.isNativePlatform()) return "denied";
    const result = await LocalNotifications.checkPermissions();
    return result.display;
  }, []);

  const schedule = useCallback(
    async (notification: {
      title: string;
      body: string;
      id: number;
      schedule?: {
        at?: Date;
        repeats?: boolean;
        on?: { weekday?: number; hour?: number; minute?: number };
      };
      sound?: string;
      attachments?: Array<{ id: string; url: string }>;
    }) => {
      if (!Capacitor.isNativePlatform()) return;
      await LocalNotifications.schedule({
        notifications: [
          {
            ...notification,
            schedule: notification.schedule ? { ...notification.schedule } : undefined,
            sound: notification.sound || "default",
            attachments: notification.attachments,
          },
        ],
      });
    },
    [],
  );

  const cancel = useCallback(async (id: number) => {
    if (!Capacitor.isNativePlatform()) return;
    await LocalNotifications.cancel({ notifications: [{ id }] });
  }, []);

  const getPending = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return [];
    const result = await LocalNotifications.getPending();
    return result.notifications;
  }, []);

  return { requestPermissions, checkPermissions, schedule, cancel, getPending };
}

export function useAppLifecycle() {
  const [state, setState] = useState<"active" | "background">("active");

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const handleStateChange = ({ isActive }: { isActive: boolean }) => {
      setState(isActive ? "active" : "background");
    };

    const setup = async () => {
      await App.addListener("appStateChange", handleStateChange);
    };
    setup();
    return () => {
      App.removeAllListeners();
    };
  }, []);

  return state;
}

export function useStatusBar() {
  const setStyle = useCallback(async (style: Style) => {
    if (!Capacitor.isNativePlatform()) return;
    await StatusBar.setStyle({ style });
  }, []);

  const setBackgroundColor = useCallback(async (color: string) => {
    if (!Capacitor.isNativePlatform()) return;
    await StatusBar.setBackgroundColor({ color });
  }, []);

  const show = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;
    await StatusBar.show();
  }, []);

  const hide = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;
    await StatusBar.hide();
  }, []);

  return { setStyle, setBackgroundColor, show, hide };
}

export function useKeyboard() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const setup = async () => {
      const showListener = await Keyboard.addListener("keyboardWillShow", () => setIsOpen(true));
      const hideListener = await Keyboard.addListener("keyboardWillHide", () => setIsOpen(false));
      return () => {
        showListener.remove();
        hideListener.remove();
      };
    };
    const cleanup = setup();
    return () => {
      cleanup.then((fn) => fn());
    };
  }, []);

  const setResizeMode = useCallback(async (mode: string) => {
    if (!Capacitor.isNativePlatform()) return;
    await Keyboard.setResizeMode({ mode: mode as any });
  }, []);

  return { isOpen, setResizeMode };
}

export function useSplashScreen() {
  const hide = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;
    await SplashScreen.hide();
  }, []);

  const show = useCallback(async (duration = 2000) => {
    if (!Capacitor.isNativePlatform()) return;
    await SplashScreen.show({ autoHide: true, showDuration: duration });
  }, []);

  return { hide, show };
}

export function usePreferences() {
  const get = useCallback(async <T>(key: string, defaultValue?: T): Promise<T | undefined> => {
    if (!Capacitor.isNativePlatform()) {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    }
    const { value } = await Preferences.get({ key });
    return value ? JSON.parse(value) : defaultValue;
  }, []);

  const set = useCallback(async <T>(key: string, value: T) => {
    if (!Capacitor.isNativePlatform()) {
      localStorage.setItem(key, JSON.stringify(value));
      return;
    }
    await Preferences.set({ key, value: JSON.stringify(value) });
  }, []);

  const remove = useCallback(async (key: string) => {
    if (!Capacitor.isNativePlatform()) {
      localStorage.removeItem(key);
      return;
    }
    await Preferences.remove({ key });
  }, []);

  const clear = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) {
      localStorage.clear();
      return;
    }
    await Preferences.clear();
  }, []);

  return { get, set, remove, clear };
}

export function useFilesystem() {
  const readFile = useCallback(
    async (path: string, directory: Directory = Directory.Data): Promise<string> => {
      if (!Capacitor.isNativePlatform()) {
        throw new Error("Filesystem not available on web");
      }
      const result = await Filesystem.readFile({ path, directory });
      return result.data as string;
    },
    [],
  );

  const writeFile = useCallback(
    async (path: string, data: string, directory: Directory = Directory.Data) => {
      if (!Capacitor.isNativePlatform()) {
        throw new Error("Filesystem not available on web");
      }
      await Filesystem.writeFile({ path, data, directory });
    },
    [],
  );

  const deleteFile = useCallback(async (path: string, directory: Directory = Directory.Data) => {
    if (!Capacitor.isNativePlatform()) {
      throw new Error("Filesystem not available on web");
    }
    await Filesystem.deleteFile({ path, directory });
  }, []);

  const listFiles = useCallback(async (path: string, directory: Directory = Directory.Data) => {
    if (!Capacitor.isNativePlatform()) {
      throw new Error("Filesystem not available on web");
    }
    const result = await Filesystem.readdir({ path, directory });
    return result.files;
  }, []);

  return { readFile, writeFile, deleteFile, listFiles };
}

export function useShare() {
  const share = useCallback(async (data: { title?: string; text?: string; url?: string }) => {
    if (!Capacitor.isNativePlatform()) {
      if (navigator.share) {
        await navigator.share(data);
      }
      return;
    }
    await Share.share(data);
  }, []);

  return { share };
}

export function useClipboard() {
  const write = useCallback(async (text: string) => {
    if (!Capacitor.isNativePlatform()) {
      await navigator.clipboard.writeText(text);
      return;
    }
    await Clipboard.write({ string: text });
  }, []);

  const read = useCallback(async (): Promise<string> => {
    if (!Capacitor.isNativePlatform()) {
      return navigator.clipboard.readText();
    }
    const result = await Clipboard.read();
    return result.value;
  }, []);

  return { write, read };
}

export function useBiometricAuth() {
  /**
   * Full availability payload. Distinct from isAvailable() on purpose: the
   * settings row needs the `reason` (e.g. not_enrolled → "add a fingerprint
   * in Settings") without raising the system sheet.
   */
  const getAvailability = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) {
      return { isAvailable: false as const, biometryType: 'none' as const, reason: 'web' };
    }
    try {
      return await NativeBiometric.isAvailable();
    } catch {
      return { isAvailable: false as const, biometryType: 'none' as const, reason: 'unknown' };
    }
  }, []);

  const isAvailable = useCallback(async (): Promise<boolean> => {
    return (await getAvailability()).isAvailable;
  }, [getAvailability]);

  const authenticate = useCallback(async (reason?: string): Promise<boolean> => {
    if (!Capacitor.isNativePlatform()) return false;
    try {
      await NativeBiometric.verifyIdentity({
        reason: reason || "Authentication required",
        title: "Unlock AuraMind",
        subtitle: "Confirm it's you to continue",
      });
      return true;
    } catch {
      return false;
    }
  }, []);

  const setCredentials = useCallback(async (username: string, password: string, server: string) => {
    if (!Capacitor.isNativePlatform()) return;
    await NativeBiometric.setCredentials({ username, password, server });
  }, []);

  const getCredentials = useCallback(async (server: string) => {
    if (!Capacitor.isNativePlatform()) return null;
    try {
      const credentials = await NativeBiometric.getCredentials({ server });
      return credentials;
    } catch {
      return null;
    }
  }, []);

  const deleteCredentials = useCallback(async (server: string) => {
    if (!Capacitor.isNativePlatform()) return;
    await NativeBiometric.deleteCredentials({ server });
  }, []);

  return { isAvailable, getAvailability, authenticate, setCredentials, getCredentials, deleteCredentials };
}
