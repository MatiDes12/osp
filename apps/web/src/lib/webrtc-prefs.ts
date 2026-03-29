/**
 * Browser-only preference for WebRTC ICE: use gateway TURN (e.g. Metered) or STUN-only.
 * Default off — faster when direct/tunnel paths work; turn on for strict NATs.
 */

export const OSP_USE_METERED_TURN_KEY = "osp_use_metered_turn";

export function getUseMeteredTurn(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(OSP_USE_METERED_TURN_KEY) === "1";
  } catch {
    return false;
  }
}

export function setUseMeteredTurn(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (enabled) {
      localStorage.setItem(OSP_USE_METERED_TURN_KEY, "1");
    } else {
      localStorage.removeItem(OSP_USE_METERED_TURN_KEY);
    }
  } catch {
    /* ignore */
  }
}
