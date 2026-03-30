import { create } from "zustand";
import { persist } from "zustand/middleware";

export type WorkspaceFilterPreset = "subagent" | "cron";

interface FilterPresets {
  subagent: boolean;
  cron: boolean;
}

interface WorkspaceState {
  sessionKeys: string[];
  openSessionKeys: string[];
  activeSessionKey: string | null;
  sidebarCollapsed: boolean;
  filterText: string;
  filterPresets: FilterPresets;
  initialized: boolean;
  initialize: (payload?: {
    sessionKeys?: string[];
    openSessionKeys?: string[];
    activeSessionKey?: string | null;
  }) => void;
  reconcileSessions: (availableKeys: string[], fallbackKey?: string | null) => void;
  addSession: (key: string) => void;
  addOpenSession: (key: string) => void;
  removeSession: (key: string) => void;
  removeOpenSession: (key: string, nextActiveKey?: string | null) => void;
  setSessionOrder: (keys: string[]) => void;
  setOpenSessionOrder: (keys: string[]) => void;
  setActiveSessionKey: (key: string | null) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
  setFilterText: (value: string) => void;
  toggleFilterPreset: (preset: WorkspaceFilterPreset) => void;
  clearFilters: () => void;
}

function uniqueKeys(keys: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const key of keys) {
    const normalized = key.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function ensureKey(keys: string[], key: string | null | undefined): string[] {
  const normalized = key?.trim();
  if (!normalized) {
    return uniqueKeys(keys);
  }

  return uniqueKeys(keys.includes(normalized) ? keys : [...keys, normalized]);
}

function normalizeOrders(input: {
  sessionKeys?: string[];
  openSessionKeys?: string[];
  activeSessionKey?: string | null;
}) {
  const sessionKeys = uniqueKeys(input.sessionKeys ?? []);
  let openSessionKeys = uniqueKeys(input.openSessionKeys ?? []);
  const activeSessionKey = input.activeSessionKey?.trim() || null;

  if (activeSessionKey) {
    openSessionKeys = ensureKey(openSessionKeys, activeSessionKey);
  }

  return {
    sessionKeys,
    openSessionKeys,
    activeSessionKey,
  };
}

export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      sessionKeys: [],
      openSessionKeys: [],
      activeSessionKey: null,
      sidebarCollapsed: false,
      filterText: "",
      filterPresets: {
        subagent: false,
        cron: false,
      },
      initialized: false,

      initialize: (payload) =>
        set((state) => {
          if (state.initialized) {
            return state;
          }

          const normalized = normalizeOrders(payload ?? {});
          return {
            ...normalized,
            initialized: true,
          };
        }),

      reconcileSessions: (availableKeys, fallbackKey = null) =>
        set((state) => {
          const available = new Set(availableKeys);

          if (!state.initialized) {
            const seedKey = fallbackKey && available.has(fallbackKey)
              ? fallbackKey
              : availableKeys[0] ?? null;

            if (!seedKey) {
              return {
                initialized: true,
              };
            }

            return {
              sessionKeys: [seedKey],
              openSessionKeys: [seedKey],
              activeSessionKey: seedKey,
              initialized: true,
            };
          }

          const sessionKeys = state.sessionKeys.filter((key) => available.has(key));
          let openSessionKeys = state.openSessionKeys.filter((key) => available.has(key));
          let activeSessionKey =
            state.activeSessionKey && available.has(state.activeSessionKey)
              ? state.activeSessionKey
              : null;

          if (activeSessionKey && !openSessionKeys.includes(activeSessionKey)) {
            openSessionKeys = [...openSessionKeys, activeSessionKey];
          }

          if (!activeSessionKey && openSessionKeys.length > 0) {
            activeSessionKey = openSessionKeys[0] ?? null;
          }

          return {
            sessionKeys,
            openSessionKeys,
            activeSessionKey,
            initialized: true,
          };
        }),

      addSession: (key) =>
        set((state) => ({
          sessionKeys: ensureKey(state.sessionKeys, key),
          initialized: true,
        })),

      addOpenSession: (key) =>
        set((state) => {
          const normalized = key.trim();
          if (!normalized) {
            return state;
          }

          return {
            sessionKeys: ensureKey(state.sessionKeys, normalized),
            openSessionKeys: ensureKey(state.openSessionKeys, normalized),
            activeSessionKey: normalized,
            initialized: true,
          };
        }),

      removeSession: (key) =>
        set((state) => {
          const sessionKeys = state.sessionKeys.filter((sessionKey) => sessionKey !== key);
          const openSessionKeys = state.openSessionKeys.filter((sessionKey) => sessionKey !== key);
          const activeSessionKey = state.activeSessionKey === key
            ? openSessionKeys[0] ?? null
            : state.activeSessionKey;

          return {
            sessionKeys,
            openSessionKeys,
            activeSessionKey,
            initialized: true,
          };
        }),

      removeOpenSession: (key, nextActiveKey = null) =>
        set((state) => {
          const openSessionKeys = state.openSessionKeys.filter((sessionKey) => sessionKey !== key);
          const fallbackActiveKey = nextActiveKey && openSessionKeys.includes(nextActiveKey)
            ? nextActiveKey
            : openSessionKeys[0] ?? null;

          return {
            openSessionKeys,
            activeSessionKey:
              state.activeSessionKey === key
                ? fallbackActiveKey
                : state.activeSessionKey,
            initialized: true,
          };
        }),

      setSessionOrder: (keys) =>
        set((state) => ({
          sessionKeys: uniqueKeys(keys),
          initialized: true,
          activeSessionKey:
            state.activeSessionKey && keys.includes(state.activeSessionKey)
              ? state.activeSessionKey
              : state.activeSessionKey,
        })),

      setOpenSessionOrder: (keys) =>
        set((state) => {
          let openSessionKeys = uniqueKeys(keys);
          if (state.activeSessionKey) {
            openSessionKeys = ensureKey(openSessionKeys, state.activeSessionKey);
          }

          return {
            openSessionKeys,
            initialized: true,
          };
        }),

      setActiveSessionKey: (key) =>
        set((state) => {
          const normalized = key?.trim() || null;
          if (!normalized) {
            return {
              activeSessionKey: null,
              initialized: true,
            };
          }

          return {
            sessionKeys: ensureKey(state.sessionKeys, normalized),
            openSessionKeys: ensureKey(state.openSessionKeys, normalized),
            activeSessionKey: normalized,
            initialized: true,
          };
        }),

      setSidebarCollapsed: (collapsed) =>
        set({
          sidebarCollapsed: collapsed,
          initialized: true,
        }),

      toggleSidebarCollapsed: () =>
        set((state) => ({
          sidebarCollapsed: !state.sidebarCollapsed,
          initialized: true,
        })),

      setFilterText: (value) =>
        set({
          filterText: value,
          initialized: true,
        }),

      toggleFilterPreset: (preset) =>
        set((state) => ({
          filterPresets: {
            ...state.filterPresets,
            [preset]: !state.filterPresets[preset],
          },
          initialized: true,
        })),

      clearFilters: () =>
        set({
          filterText: "",
          filterPresets: {
            subagent: false,
            cron: false,
          },
          initialized: true,
        }),
    }),
    {
      name: "clawstudio-workspace",
      version: 2,
      partialize: (state) => ({
        sessionKeys: state.sessionKeys,
        openSessionKeys: state.openSessionKeys,
        activeSessionKey: state.activeSessionKey,
        sidebarCollapsed: state.sidebarCollapsed,
        filterText: state.filterText,
        filterPresets: state.filterPresets,
        initialized: state.initialized,
      }),
      migrate: (persistedState) => {
        if (!persistedState || typeof persistedState !== "object") {
          return {
            sessionKeys: [],
            openSessionKeys: [],
            activeSessionKey: null,
            sidebarCollapsed: false,
            filterText: "",
            filterPresets: {
              subagent: false,
              cron: false,
            },
            initialized: false,
          };
        }

        const candidate = persistedState as Record<string, unknown>;
        const sessionKeys = Array.isArray(candidate.sessionKeys)
          ? candidate.sessionKeys.filter((value): value is string => typeof value === "string")
          : [];
        const openSessionKeys = Array.isArray(candidate.openSessionKeys)
          ? candidate.openSessionKeys.filter((value): value is string => typeof value === "string")
          : sessionKeys;
        const activeSessionKey =
          typeof candidate.activeSessionKey === "string" ? candidate.activeSessionKey : null;
        const filterPresetsInput =
          candidate.filterPresets && typeof candidate.filterPresets === "object"
            ? candidate.filterPresets as Record<string, unknown>
            : {};

        return {
          ...normalizeOrders({
            sessionKeys,
            openSessionKeys,
            activeSessionKey,
          }),
          sidebarCollapsed: candidate.sidebarCollapsed === true,
          filterText: typeof candidate.filterText === "string" ? candidate.filterText : "",
          filterPresets: {
            subagent: filterPresetsInput.subagent === true,
            cron: filterPresetsInput.cron === true,
          },
          initialized: candidate.initialized === true || sessionKeys.length > 0 || openSessionKeys.length > 0,
        };
      },
    },
  ),
);
