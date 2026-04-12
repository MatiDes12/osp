import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface RecordingSchedule {
  /** ISO datetime string */
  start: string;
  /** ISO datetime string */
  end: string;
}

export interface MonitoringState {
  motionEnabled: boolean;
  recordingEnabled: boolean;
  snapshotsEnabled: boolean;
  /** Scheduled recording window — null means no schedule set */
  recordingSchedule: RecordingSchedule | null;
  /** true while an API call is in flight */
  motionBusy: boolean;
  recordingBusy: boolean;
  snapshotsBusy: boolean;
  setMotion: (v: boolean) => void;
  setRecording: (v: boolean) => void;
  setSnapshots: (v: boolean) => void;
  setRecordingSchedule: (s: RecordingSchedule | null) => void;
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
      recordingSchedule: null,
      motionBusy: false,
      recordingBusy: false,
      snapshotsBusy: false,
      setMotion: (v) => set({ motionEnabled: v }),
      setRecording: (v) => set({ recordingEnabled: v }),
      setSnapshots: (v) => set({ snapshotsEnabled: v }),
      setRecordingSchedule: (s) => set({ recordingSchedule: s }),
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
        recordingSchedule: s.recordingSchedule,
      }),
    },
  ),
);
