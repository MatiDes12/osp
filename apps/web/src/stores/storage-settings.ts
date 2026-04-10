"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type StorageSaveMode = "local_and_db" | "local_only";

interface StorageSettingsState {
  /** Whether to create DB rows / upload to cloud, or keep everything local. */
  saveMode: StorageSaveMode;
  /** Custom recordings folder path. Empty string = use AppData default. */
  recordingsPath: string;
  /** Custom snapshots folder path. Empty string = use AppData default. */
  snapshotsPath: string;

  setSaveMode: (mode: StorageSaveMode) => void;
  setRecordingsPath: (path: string) => void;
  setSnapshotsPath: (path: string) => void;
}

export const useStorageSettings = create<StorageSettingsState>()(
  persist(
    (set) => ({
      saveMode: "local_and_db",
      recordingsPath: "",
      snapshotsPath: "",

      setSaveMode: (saveMode) => set({ saveMode }),
      setRecordingsPath: (recordingsPath) => set({ recordingsPath }),
      setSnapshotsPath: (snapshotsPath) => set({ snapshotsPath }),
    }),
    {
      name: "osp-storage-settings",
      partialize: (s) => ({
        saveMode: s.saveMode,
        recordingsPath: s.recordingsPath,
        snapshotsPath: s.snapshotsPath,
      }),
    },
  ),
);
