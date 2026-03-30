import { useEffect } from "react";
import { useSettings } from "./stores/settings";
import { useUpdater } from "./stores/updater";
import { useGateway } from "./stores/gateway";
import { useChat } from "./stores/chat";
import { hasTauriBackend, subscribeGatewayEvents } from "./lib/tauri-gateway";
import { stringifyGatewayError } from "./lib/gateway-errors";
import { subscribeWindowSync } from "./lib/window-sync";
import { MainWindow } from "./windows/MainWindow";

export function App() {
  const settings = useSettings();
  const { setStatus, switchSession, refreshSessions, status, connect } = useGateway();
  const {
    appendExternalUserMessage,
    activateSession,
    hasSessionState,
    handleChatEvent,
    finalizeStream,
    loadHistory,
  } = useChat();
  const currentSessionKey = useGateway((s) => s.currentSessionKey);
  const autoCheckUpdates = useSettings((s) => s.updates.autoCheck);
  const initializeUpdater = useUpdater((s) => s.initialize);
  const checkForUpdates = useUpdater((s) => s.checkForUpdates);

  // Set initial session from settings
  useEffect(() => {
    if (!currentSessionKey && settings.gateway.sessionKey) {
      switchSession(settings.gateway.sessionKey);
    }
  }, [currentSessionKey, settings.gateway.sessionKey, switchSession]);

  // Subscribe to Tauri gateway events
  useEffect(() => {
    let cancelled = false;
    let unlisteners: (() => void)[] = [];

    void subscribeGatewayEvents({
      onChatEvent: (payload) => {
        handleChatEvent(payload);
      },
      onRunEnd: (payload) => {
        finalizeStream(payload.sessionKey ?? useGateway.getState().currentSessionKey);
      },
      onDisconnected: () => {
        setStatus("disconnected");
      },
      onError: ({ message }) => {
        setStatus("error", message);
      },
      onReconnecting: () => {
        setStatus("reconnecting");
      },
      onConnected: () => {
        void refreshSessions()
          .then(() => {
            setStatus("connected");
          })
          .catch((error) => {
            setStatus("error", stringifyGatewayError(error));
          });
      },
    }).then((fns) => {
      if (cancelled) { fns.forEach((f) => f()); return; }
      unlisteners = fns;
    });

    return () => { cancelled = true; unlisteners.forEach((f) => f()); };
  }, [setStatus, handleChatEvent, finalizeStream, refreshSessions]);

  useEffect(() => {
    let cancelled = false;
    let unlisteners: (() => void)[] = [];

    void subscribeWindowSync({
      onSessionChange: ({ sessionKey }) => {
        if (sessionKey === useGateway.getState().currentSessionKey) {
          return;
        }
        useGateway.getState().switchSession(sessionKey);
      },
      onUserMessage: ({ sessionKey, message }) => {
        if (sessionKey !== useGateway.getState().currentSessionKey) {
          return;
        }

        useChat.getState().appendExternalUserMessage(sessionKey, message);
      },
      onSettingsChange: ({ settings: nextSettings }) => {
        useSettings.getState().applySnapshot(nextSettings);
      },
    }).then((fns) => {
      if (cancelled) {
        fns.forEach((fn) => fn());
        return;
      }

      unlisteners = fns;
    });

    return () => {
      cancelled = true;
      unlisteners.forEach((fn) => fn());
    };
  }, [appendExternalUserMessage]);

  // Auto-connect on startup after listeners are ready
  useEffect(() => {
    const { url, token, autoConnect } = settings.gateway;
    if (autoConnect && token && status === "disconnected") {
      void connect(url, token);
    }
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load history when session changes
  useEffect(() => {
    if (currentSessionKey && status === "connected") {
      activateSession(currentSessionKey);
      if (!hasSessionState(currentSessionKey)) {
        void loadHistory(currentSessionKey);
      }
    }
  }, [activateSession, currentSessionKey, hasSessionState, loadHistory, status]);

  useEffect(() => {
    document.body.dataset.window = "main";
  }, []);

  useEffect(() => {
    if (!hasTauriBackend()) {
      return;
    }

    void initializeUpdater();

    if (autoCheckUpdates) {
      void checkForUpdates({ silent: true });
    }
  }, [autoCheckUpdates, checkForUpdates, initializeUpdater]);

  return <MainWindow />;
}
