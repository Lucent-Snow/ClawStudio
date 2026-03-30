import { create } from "zustand";
import type { SessionRow, SessionsListResult } from "../lib/types";
import {
  gatewayConnect,
  gatewayDisconnect,
  gatewaySessionsDelete,
  gatewaySessionsList,
  gatewaySessionsPatch,
  gatewaySessionsReset,
  type GatewaySessionPatch,
} from "../lib/tauri-gateway";
import { shouldReconnectGateway, stringifyGatewayError } from "../lib/gateway-errors";
import { broadcastSettingsChange } from "../lib/window-sync";
import { useChat } from "./chat";
import { DEFAULT_SETTINGS, useSettings } from "./settings";
import { useWorkspace } from "./workspace";

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

interface GatewayState {
  status: ConnectionStatus;
  error: string | null;
  sessions: SessionRow[];
  currentSessionKey: string | null;
  openSessionKeys: string[];
  composerFocusToken: number;
  syncWorkspaceState: () => void;
  connect: (url: string, token: string) => Promise<void>;
  disconnect: () => Promise<void>;
  createSession: (name?: string) => Promise<string>;
  resetSession: (key: string) => Promise<void>;
  deleteSession: (key: string) => Promise<string | null>;
  renameSession: (key: string, label: string) => Promise<void>;
  updateSessionModel: (key: string, model: string) => Promise<void>;
  switchSession: (key: string) => void;
  closeSessionTab: (key: string) => void;
  reorderOpenSessions: (keys: string[]) => void;
  refreshSessions: () => Promise<void>;
  requestComposerFocus: () => void;
  setStatus: (status: ConnectionStatus, error?: string | null) => void;
}

async function persistSessionKey(key: string) {
  useSettings.getState().updateGateway({ sessionKey: key });
  const next = useSettings.getState();
  await broadcastSettingsChange({
    gateway: next.gateway,
    updates: next.updates,
  });
}

async function reconnectGatewayFromSettings() {
  const gateway = useSettings.getState().gateway;
  const url = gateway.url.trim();
  const token = gateway.token.trim();
  if (!url || !token) {
    throw new Error("gateway connection settings are incomplete");
  }

  await useGateway.getState().connect(url, token);

  const { status, error } = useGateway.getState();
  if (status !== "connected") {
    throw new Error(error ?? "gateway reconnect failed");
  }
}

async function retryGatewayRequest<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!shouldReconnectGateway(error)) {
      throw error;
    }

    await reconnectGatewayFromSettings();
    return operation();
  }
}

function mergeSessionMetadata(next: SessionRow, previous?: SessionRow): SessionRow {
  const label = next.label ?? previous?.label;
  const displayName = next.displayName ?? previous?.displayName ?? label;
  return {
    ...previous,
    ...next,
    ...(label ? { label } : {}),
    ...(displayName ? { displayName } : {}),
  };
}

function sessionNamespace(key: string | null | undefined): string {
  const normalized = key?.trim();
  if (!normalized) {
    return "agent:clawstudio";
  }

  const parts = normalized.split(":").filter(Boolean);
  if (parts[0] === "agent" && parts.length >= 3) {
    return `agent:${parts[1]}`;
  }

  if (parts.length >= 2) {
    return `${parts[0]}:${parts[1]}`;
  }

  return normalized;
}

function normalizeSessionKeyTail(name: string | null | undefined): string | null {
  const normalized = name?.trim().normalize("NFKC") ?? "";
  if (!normalized) {
    return null;
  }

  const safeTail = normalized
    .toLowerCase()
    .replace(/[:/\\]+/g, "-")
    .replace(/[\s_]+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return safeTail || null;
}

function buildNewSessionKey(
  sessions: SessionRow[],
  currentSessionKey: string | null,
  defaultSessionKey: string,
  preferredName?: string,
): string {
  const namespace = sessionNamespace(currentSessionKey || defaultSessionKey);
  const pattern = new RegExp(`^${namespace.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:session-(\\d+)$`);
  const existingKeys = new Set(
    sessions
      .map((session) => session.key)
      .filter((key) => key.startsWith(`${namespace}:`)),
  );
  const preferredTail = normalizeSessionKeyTail(preferredName);

  let maxIndex = 0;
  for (const session of sessions) {
    const match = session.key.match(pattern);
    const value = match ? Number(match[1]) : 0;
    if (Number.isFinite(value) && value > maxIndex) {
      maxIndex = value;
    }
  }

  const defaultTail = `session-${maxIndex + 1}`;
  const baseTail = preferredTail ?? defaultTail;
  const baseKey = `${namespace}:${baseTail}`;
  if (!existingKeys.has(baseKey)) {
    return baseKey;
  }

  let suffix = 2;
  while (existingKeys.has(`${namespace}:${baseTail}-${suffix}`)) {
    suffix += 1;
  }

  return `${namespace}:${baseTail}-${suffix}`;
}

function splitGatewayModelValue(model: string): { model: string; provider?: string } {
  const normalized = model.trim();
  if (!normalized) {
    return { model: "" };
  }

  const slashIndex = normalized.indexOf("/");
  if (slashIndex <= 0) {
    return { model: normalized };
  }

  return {
    provider: normalized.slice(0, slashIndex),
    model: normalized.slice(slashIndex + 1),
  };
}

export const useGateway = create<GatewayState>()((set, get) => ({
  status: "disconnected",
  error: null,
  sessions: [],
  currentSessionKey: useWorkspace.getState().activeSessionKey,
  openSessionKeys: useWorkspace.getState().openSessionKeys,
  composerFocusToken: 0,

  setStatus: (status, error = null) => set({ status, error }),

  syncWorkspaceState: () => {
    const workspace = useWorkspace.getState();
    set({
      currentSessionKey: workspace.activeSessionKey,
      openSessionKeys: workspace.openSessionKeys,
    });
  },

  requestComposerFocus: () =>
    set((state) => ({ composerFocusToken: state.composerFocusToken + 1 })),

  connect: async (url, token) => {
    set({ status: "connecting", error: null });
    try {
      await gatewayConnect(url, token);
      const result = await gatewaySessionsList();
      applySessionsResult(result, set, get);
      set({ status: "connected", error: null });
    } catch (err) {
      const msg = stringifyGatewayError(err);
      set({ status: "error", error: msg });
    }
  },

  disconnect: async () => {
    try {
      await gatewayDisconnect();
    } catch {
      // ignore
    }
    set({ status: "disconnected", error: null, sessions: [] });
  },

  createSession: async (name) => {
    const key = buildNewSessionKey(
      get().sessions,
      get().currentSessionKey,
      useSettings.getState().gateway.sessionKey,
      name,
    );
    await retryGatewayRequest(() => gatewaySessionsReset(key, "new"));
    useWorkspace.getState().addSession(key);
    useWorkspace.getState().addOpenSession(key);
    set((state) => ({
      currentSessionKey: key,
      openSessionKeys: state.openSessionKeys.includes(key)
        ? state.openSessionKeys
        : [...state.openSessionKeys, key],
      composerFocusToken: state.composerFocusToken + 1,
    }));
    useChat.getState().clearMessages(key);
    await get().refreshSessions();
    return key;
  },

  resetSession: async (key) => {
    await retryGatewayRequest(() => gatewaySessionsReset(key));
    if (get().currentSessionKey === key) {
      useChat.getState().clearMessages(key);
    }
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.key === key
          ? {
              ...session,
              updatedAt: Date.now(),
            }
          : session,
      ),
    }));
    await get().refreshSessions();
  },

  deleteSession: async (key) => {
    const prev = get();
    const savedSessionKey = useSettings.getState().gateway.sessionKey;
    await retryGatewayRequest(() => gatewaySessionsDelete(key));
    const sessions = prev.sessions.filter((session) => session.key !== key);
    useWorkspace.getState().removeSession(key);
    const workspaceState = useWorkspace.getState();
    const nextKey =
      prev.currentSessionKey === key
        ? workspaceState.activeSessionKey ?? null
        : prev.currentSessionKey;
    const nextDefaultKey =
      key === savedSessionKey
        ? nextKey ?? sessions[0]?.key ?? DEFAULT_SETTINGS.gateway.sessionKey
        : null;

    if (nextDefaultKey) {
      await persistSessionKey(nextDefaultKey);
    }

    set({
      sessions,
      currentSessionKey: nextKey,
      openSessionKeys: workspaceState.openSessionKeys,
    });
    if (prev.currentSessionKey === key) {
      useChat.getState().clearMessages(key);
    }

    await get().refreshSessions();
    return nextKey;
  },

  renameSession: async (key, label) => {
    const normalized = label.trim();
    const patch: GatewaySessionPatch = {
      label: normalized || null,
    };
    await retryGatewayRequest(() => gatewaySessionsPatch(key, patch));
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.key === key
          ? {
              ...session,
              label: normalized || undefined,
              updatedAt: Date.now(),
            }
          : session,
      ),
    }));
    await get().refreshSessions();
  },

  updateSessionModel: async (key, model) => {
    const normalized = model.trim();
    const patch: GatewaySessionPatch = {
      model: normalized || null,
    };
    const parsed = splitGatewayModelValue(normalized);
    await retryGatewayRequest(() => gatewaySessionsPatch(key, patch));
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.key === key
          ? {
              ...session,
              model: parsed.model || undefined,
              modelProvider: parsed.provider ?? session.modelProvider,
              updatedAt: Date.now(),
            }
          : session,
      ),
    }));
    await get().refreshSessions();
  },

  switchSession: (key) => {
    useWorkspace.getState().addOpenSession(key);
    set((state) => ({
      currentSessionKey: key,
      openSessionKeys: state.openSessionKeys.includes(key)
        ? state.openSessionKeys
        : [...state.openSessionKeys, key],
    }));
  },

  closeSessionTab: (key) => {
    set((state) => {
      const index = state.openSessionKeys.indexOf(key);
      if (index === -1) {
        return state;
      }

      const openSessionKeys = state.openSessionKeys.filter((sessionKey) => sessionKey !== key);
      const nextCurrentSessionKey =
        state.currentSessionKey !== key
          ? state.currentSessionKey
          : openSessionKeys[index] ?? openSessionKeys[index - 1] ?? null;
      useWorkspace.getState().removeOpenSession(key, nextCurrentSessionKey);

      return {
        openSessionKeys,
        currentSessionKey: nextCurrentSessionKey,
      };
    });
  },

  reorderOpenSessions: (keys) => {
    const available = new Set(get().sessions.map((session) => session.key));
    const nextKeys = keys.filter((key) => available.has(key));
    useWorkspace.getState().setOpenSessionOrder(nextKeys);
    set({ openSessionKeys: useWorkspace.getState().openSessionKeys });
  },

  refreshSessions: async () => {
    const result = await retryGatewayRequest(() => gatewaySessionsList());
    applySessionsResult(result, set, get);
  },
}));

function applySessionsResult(
  result: SessionsListResult,
  set: (partial: Partial<GatewayState> | ((state: GatewayState) => Partial<GatewayState>)) => void,
  get: () => GatewayState,
) {
  const defaultKey = useSettings.getState().gateway.sessionKey;
  const previousByKey = new Map(get().sessions.map((session) => [session.key, session]));
  const currentSessionKey = get().currentSessionKey;
  const fallbackCurrent = get().sessions.find((session) => session.key === currentSessionKey);
  const sorted = result.sessions
    .map((session) => mergeSessionMetadata(session, previousByKey.get(session.key)))
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  const merged =
    fallbackCurrent && !sorted.some((session) => session.key === fallbackCurrent.key)
      ? [fallbackCurrent, ...sorted]
      : sorted;
  const availableKeys = merged.map((session) => session.key);
  const workspace = useWorkspace.getState();
  const fallbackKey =
    workspace.activeSessionKey && availableKeys.includes(workspace.activeSessionKey)
      ? workspace.activeSessionKey
      : merged.find((session) => session.key === defaultKey)?.key ?? merged[0]?.key ?? null;

  workspace.reconcileSessions(availableKeys, fallbackKey);
  const restored = useWorkspace.getState();

  set({
    sessions: merged,
    currentSessionKey: restored.activeSessionKey,
    openSessionKeys: restored.openSessionKeys,
  });
}
