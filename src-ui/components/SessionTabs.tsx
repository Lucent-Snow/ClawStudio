import { useMemo, useState, type DragEvent } from "react";
import type { SessionRow } from "../lib/types";
import { broadcastSessionChange } from "../lib/window-sync";
import { buildDisambiguatedSessionTitles } from "../lib/session-display";
import { useGateway } from "../stores/gateway";
import styles from "./SessionTabs.module.css";

function moveKeyBeforeTarget(keys: string[], draggedKey: string, targetKey: string): string[] {
  if (draggedKey === targetKey) {
    return keys;
  }

  const next = keys.filter((key) => key !== draggedKey);
  const targetIndex = next.indexOf(targetKey);
  if (targetIndex === -1) {
    return keys;
  }

  next.splice(targetIndex, 0, draggedKey);
  return next;
}

export function SessionTabs() {
  const sessions = useGateway((state) => state.sessions);
  const currentSessionKey = useGateway((state) => state.currentSessionKey);
  const openSessionKeys = useGateway((state) => state.openSessionKeys);
  const switchSession = useGateway((state) => state.switchSession);
  const closeSessionTab = useGateway((state) => state.closeSessionTab);
  const reorderOpenSessions = useGateway((state) => state.reorderOpenSessions);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);

  const handleSwitch = (key: string) => {
    switchSession(key);
    void broadcastSessionChange(key);
  };

  const handleClose = (key: string) => {
    closeSessionTab(key);
    const nextKey = useGateway.getState().currentSessionKey;
    if (nextKey) {
      void broadcastSessionChange(nextKey);
    }
  };

  const openSessions = useMemo(
    () =>
      openSessionKeys
        .map((key) => sessions.find((session) => session.key === key))
        .filter((session): session is SessionRow => Boolean(session)),
    [openSessionKeys, sessions],
  );
  const sessionTitles = useMemo(
    () => buildDisambiguatedSessionTitles(openSessions),
    [openSessions],
  );

  if (openSessions.length === 0) {
    return (
      <div className={styles.emptyBar}>
        <span className={styles.emptyText}>打开一个会话后会显示在这里</span>
      </div>
    );
  }

  return (
    <div className={styles.tabBar}>
      {openSessions.map((session) => {
        const active = session.key === currentSessionKey;
        return (
          <div
            key={session.key}
            className={`${styles.tab} ${active ? styles.active : ""} ${draggingKey === session.key ? styles.dragging : ""}`}
            draggable
            onDragStart={(event: DragEvent<HTMLDivElement>) => {
              setDraggingKey(session.key);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", session.key);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDragEnd={() => setDraggingKey(null)}
            onDrop={(event) => {
              event.preventDefault();
              if (draggingKey) {
                reorderOpenSessions(moveKeyBeforeTarget(openSessionKeys, draggingKey, session.key));
              }
              setDraggingKey(null);
            }}
          >
            <button
              type="button"
              className={styles.tabButton}
              onClick={() => handleSwitch(session.key)}
              title={session.key}
              aria-current={active ? "page" : undefined}
            >
              <span className={styles.dragHandle} aria-hidden="true">
                &#8801;
              </span>
              <span className={styles.tabCopy}>
                <span className={styles.tabLabel}>{sessionTitles.get(session.key) ?? session.key}</span>
                {session.model && (
                  <span className={styles.tabMeta}>{session.model}</span>
                )}
              </span>
            </button>
            <button
              type="button"
              className={styles.closeButton}
              onClick={() => handleClose(session.key)}
              aria-label={`关闭 ${sessionTitles.get(session.key) ?? session.key}`}
              title="关闭标签页"
            >
              &#10005;
            </button>
          </div>
        );
      })}
    </div>
  );
}
