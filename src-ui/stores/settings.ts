import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface GatewaySettings {
  url: string;
  token: string;
  sessionKey: string;
  autoConnect: boolean;
}

export interface UpdateSettings {
  autoCheck: boolean;
}

export interface SettingsSnapshot {
  gateway: GatewaySettings;
  updates: UpdateSettings;
}

type SettingsSnapshotPatch = {
  gateway?: Partial<GatewaySettings>;
  updates?: Partial<UpdateSettings>;
};

interface SettingsState extends SettingsSnapshot {
  updateGateway: (partial: Partial<GatewaySettings>) => void;
  updateUpdates: (partial: Partial<UpdateSettings>) => void;
  applySnapshot: (snapshot: SettingsSnapshotPatch) => void;
}

export const DEFAULT_SETTINGS: SettingsSnapshot = {
  gateway: {
    url: "ws://127.0.0.1:18789",
    token: "",
    sessionKey: "agent:clawstudio:main",
    autoConnect: true,
  },
  updates: {
    autoCheck: true,
  },
};

function normalizeSessionKey(value: string | undefined): string {
  if (!value) {
    return DEFAULT_SETTINGS.gateway.sessionKey;
  }

  if (value === "agent:main:clawstudio" || value === "agent:main:clawtachie") {
    return DEFAULT_SETTINGS.gateway.sessionKey;
  }

  return value;
}

function mergeSnapshot(
  snapshot: SettingsSnapshotPatch | undefined,
): SettingsSnapshot {
  const gatewayInput: Partial<GatewaySettings> = snapshot?.gateway ?? {};
  const updatesInput: Partial<UpdateSettings> = snapshot?.updates ?? {};

  return {
    gateway: {
      ...DEFAULT_SETTINGS.gateway,
      ...gatewayInput,
      sessionKey: normalizeSessionKey(gatewayInput.sessionKey),
    },
    updates: {
      ...DEFAULT_SETTINGS.updates,
      ...updatesInput,
      autoCheck:
        typeof updatesInput.autoCheck === "boolean"
          ? updatesInput.autoCheck
          : DEFAULT_SETTINGS.updates.autoCheck,
    },
  };
}

function normalizePersistedState(value: unknown): SettingsSnapshot {
  if (!value || typeof value !== "object") {
    return DEFAULT_SETTINGS;
  }

  const candidate = value as Record<string, unknown>;

  if ("gateway" in candidate || "updates" in candidate || "tts" in candidate || "pet" in candidate) {
    const gatewayInput = (candidate.gateway as Partial<GatewaySettings> | undefined) ?? {};
    const updatesInput = (candidate.updates as Partial<UpdateSettings> | undefined) ?? {};

    return mergeSnapshot({
      gateway: gatewayInput,
      updates: updatesInput,
    });
  }

  const legacyGateway: Partial<GatewaySettings> = {};
  if (typeof candidate.gatewayUrl === "string") {
    legacyGateway.url = candidate.gatewayUrl;
  }
  if (typeof candidate.token === "string") {
    legacyGateway.token = candidate.token;
  }
  if (typeof candidate.sessionKey === "string") {
    legacyGateway.sessionKey = candidate.sessionKey;
  }

  return mergeSnapshot({
    gateway: legacyGateway,
  });
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      updateGateway: (partial) =>
        set((state) => ({
          gateway: {
            ...state.gateway,
            ...partial,
            sessionKey: normalizeSessionKey(partial.sessionKey ?? state.gateway.sessionKey),
          },
        })),
      updateUpdates: (partial) =>
        set((state) => ({
          updates: {
            ...state.updates,
            ...partial,
          },
        })),
      applySnapshot: (snapshot) =>
        set((state) => ({
          gateway: {
            ...state.gateway,
            ...(snapshot.gateway ?? {}),
            sessionKey: normalizeSessionKey(
              snapshot.gateway?.sessionKey ?? state.gateway.sessionKey,
            ),
          },
          updates: {
            ...state.updates,
            ...(snapshot.updates ?? {}),
          },
        })),
    }),
    {
      name: "clawstudio-settings",
      version: 6,
      partialize: (state) => ({
        gateway: state.gateway,
        updates: state.updates,
      }),
      migrate: (persistedState) => normalizePersistedState(persistedState),
    },
  ),
);
