import { create } from "zustand";

export interface NotificationPrefs {
  readonly pushEnabled: boolean;
  readonly emailEnabled: boolean;
  readonly severityThreshold: "all" | "high" | "critical";
  readonly quietHoursEnabled: boolean;
  readonly quietHoursStart: string; // "23:00"
  readonly quietHoursEnd: string; // "07:00"
}

interface NotificationPrefsState extends NotificationPrefs {
  readonly setPref: <K extends keyof NotificationPrefs>(
    key: K,
    value: NotificationPrefs[K],
  ) => void;
  readonly setPrefs: (prefs: Partial<NotificationPrefs>) => void;
}

const STORAGE_KEY = "osp_notification_prefs";

const DEFAULTS: NotificationPrefs = {
  pushEnabled: true,
  emailEnabled: true,
  severityThreshold: "all",
  quietHoursEnabled: false,
  quietHoursStart: "23:00",
  quietHoursEnd: "07:00",
};

function readStoredPrefs(): NotificationPrefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

function persistPrefs(prefs: NotificationPrefs): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export const useNotificationPrefsStore = create<NotificationPrefsState>(
  (set, get) => ({
    ...readStoredPrefs(),
    setPref: (key, value) => {
      const current = get();
      const updated: NotificationPrefs = {
        pushEnabled: current.pushEnabled,
        emailEnabled: current.emailEnabled,
        severityThreshold: current.severityThreshold,
        quietHoursEnabled: current.quietHoursEnabled,
        quietHoursStart: current.quietHoursStart,
        quietHoursEnd: current.quietHoursEnd,
        [key]: value,
      };
      persistPrefs(updated);
      set({ [key]: value });
    },
    setPrefs: (prefs) => {
      const current = get();
      const updated: NotificationPrefs = {
        pushEnabled: current.pushEnabled,
        emailEnabled: current.emailEnabled,
        severityThreshold: current.severityThreshold,
        quietHoursEnabled: current.quietHoursEnabled,
        quietHoursStart: current.quietHoursStart,
        quietHoursEnd: current.quietHoursEnd,
        ...prefs,
      };
      persistPrefs(updated);
      set(prefs);
    },
  }),
);

/**
 * Check whether a notification should be shown right now based on user prefs.
 */
export function shouldShowNotification(severity: string): boolean {
  const state = useNotificationPrefsStore.getState();

  if (!state.pushEnabled) return false;

  // Severity threshold check
  const SEVERITY_RANK: Record<string, number> = {
    low: 0,
    medium: 1,
    high: 2,
    critical: 3,
  };

  const eventRank = SEVERITY_RANK[severity] ?? 0;

  if (state.severityThreshold === "high" && eventRank < 2) return false;
  if (state.severityThreshold === "critical" && eventRank < 3) return false;

  // Quiet hours check
  if (state.quietHoursEnabled) {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const [startH, startM] = state.quietHoursStart.split(":").map(Number);
    const [endH, endM] = state.quietHoursEnd.split(":").map(Number);
    const startMinutes = (startH ?? 23) * 60 + (startM ?? 0);
    const endMinutes = (endH ?? 7) * 60 + (endM ?? 0);

    if (startMinutes <= endMinutes) {
      // Same-day range (e.g. 09:00 - 17:00)
      if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
        return false;
      }
    } else {
      // Overnight range (e.g. 23:00 - 07:00)
      if (currentMinutes >= startMinutes || currentMinutes < endMinutes) {
        return false;
      }
    }
  }

  return true;
}
