import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface RecordingSchedule {
  /** Unique id — ISO timestamp of creation */
  id: string;
  /** ISO datetime string — when recording starts */
  start: string;
  /** ISO datetime string — when recording ends */
  end: string;
  /** Optional human label */
  label?: string;
}

export interface MonitoringState {
  motionEnabled: boolean;
  recordingEnabled: boolean;
  snapshotsEnabled: boolean;
  /** All scheduled (past, current, future) recording windows */
  recordingSchedules: RecordingSchedule[];
  /** true while an API call is in flight */
  motionBusy: boolean;
  recordingBusy: boolean;
  snapshotsBusy: boolean;
  setMotion: (v: boolean) => void;
  setRecording: (v: boolean) => void;
  setSnapshots: (v: boolean) => void;
  addRecordingSchedule: (s: RecordingSchedule) => void;
  removeRecordingSchedule: (id: string) => void;
  clearPastSchedules: () => void;
  setMotionBusy: (v: boolean) => void;
  setRecordingBusy: (v: boolean) => void;
  setSnapshotsBusy: (v: boolean) => void;
}

export const useMonitoringStore = create<MonitoringState>()(
  persist(
    (set) => ({
      motionEnabled: true,
      recordingEnabled: false,
      snapshotsEnabled: true,
      recordingSchedules: [],
      motionBusy: false,
      recordingBusy: false,
      snapshotsBusy: false,
      setMotion: (v) => set({ motionEnabled: v }),
      setRecording: (v) => set({ recordingEnabled: v }),
      setSnapshots: (v) => set({ snapshotsEnabled: v }),
      addRecordingSchedule: (s) =>
        set((state) => ({ recordingSchedules: [...state.recordingSchedules, s] })),
      removeRecordingSchedule: (id) =>
        set((state) => ({
          recordingSchedules: state.recordingSchedules.filter((s) => s.id !== id),
        })),
      clearPastSchedules: () =>
        set((state) => ({
          recordingSchedules: state.recordingSchedules.filter(
            (s) => new Date(s.end).getTime() >= Date.now(),
          ),
        })),
      setMotionBusy: (v) => set({ motionBusy: v }),
      setRecordingBusy: (v) => set({ recordingBusy: v }),
      setSnapshotsBusy: (v) => set({ snapshotsBusy: v }),
    }),
    {
      name: "osp-monitoring",
      partialize: (s) => ({
        motionEnabled: s.motionEnabled,
        recordingEnabled: s.recordingEnabled,
        snapshotsEnabled: s.snapshotsEnabled,
        recordingSchedules: s.recordingSchedules,
      }),
    },
  ),
);
