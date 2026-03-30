import { useEffect, useMemo, useState, type DragEvent, type MouseEvent } from "react";
import { useChat } from "../stores/chat";
import { useGateway } from "../stores/gateway";
import { useWorkspace } from "../stores/workspace";
import {
  buildDisambiguatedSessionTitles,
  getSessionSourceTitle,
} from "../lib/session-display";
import { matchesSessionFilter } from "../lib/session-filter";
import { broadcastSessionChange } from "../lib/window-sync";
import type { SessionRow } from "../lib/types";
import styles from "./SessionList.module.css";

interface SessionMenuState {
  key: string;
  x: number;
  y: number;
}

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

export function SessionList({ onOpenWorkspaceManager }: { onOpenWorkspaceManager: () => void }) {
  const clearMessages = useChat((state) => state.clearMessages);
  const sessions = useGateway((state) => state.sessions);
  const currentKey = useGateway((state) => state.currentSessionKey);
  const openSessionKeys = useGateway((state) => state.openSessionKeys);
  const status = useGateway((state) => state.status);
  const switchSession = useGateway((state) => state.switchSession);
  const resetSession = useGateway((state) => state.resetSession);
  const deleteSession = useGateway((state) => state.deleteSession);
  const renameSession = useGateway((state) => state.renameSession);
  const syncWorkspaceState = useGateway((state) => state.syncWorkspaceState);
  const workspaceSessionKeys = useWorkspace((state) => state.sessionKeys);
  const sidebarCollapsed = useWorkspace((state) => state.sidebarCollapsed);
  const filterText = useWorkspace((state) => state.filterText);
  const filterPresets = useWorkspace((state) => state.filterPresets);
  const removeFromWorkspace = useWorkspace((state) => state.removeSession);
  const pruneWorkspace = useWorkspace((state) => state.reconcileSessions);
  const setSessionOrder = useWorkspace((state) => state.setSessionOrder);
  const setFilterText = useWorkspace((state) => state.setFilterText);
  const toggleFilterPreset = useWorkspace((state) => state.toggleFilterPreset);
  const clearFilters = useWorkspace((state) => state.clearFilters);
  const toggleSidebarCollapsed = useWorkspace((state) => state.toggleSidebarCollapsed);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [menu, setMenu] = useState<SessionMenuState | null>(null);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const connected = status === "connected" || status === "reconnecting";

  const workspaceSessions = useMemo(() => {
    const byKey = new Map(sessions.map((session) => [session.key, session]));
    return workspaceSessionKeys
      .map((key) => byKey.get(key))
      .filter((session): session is SessionRow => Boolean(session));
  }, [sessions, workspaceSessionKeys]);
  const filteredWorkspaceSessions = useMemo(
    () =>
      workspaceSessions.filter((session) =>
        matchesSessionFilter(session, filterText.trim(), filterPresets),
      ),
    [filterPresets, filterText, workspaceSessions],
  );
  const sessionTitles = useMemo(
    () => buildDisambiguatedSessionTitles(filteredWorkspaceSessions),
    [filteredWorkspaceSessions],
  );
  const hasActiveFilters = filterText.trim().length > 0 || filterPresets.subagent || filterPresets.cron;

  useEffect(() => {
    if (!menu) {
      return;
    }

    const closeMenu = () => setMenu(null);
    const handleWindowBlur = () => closeMenu();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    window.addEventListener("click", closeMenu);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menu]);

  useEffect(() => {
    if (sessions.length === 0) {
      return;
    }

    pruneWorkspace(sessions.map((session) => session.key));
  }, [pruneWorkspace, sessions]);

  const handleClick = (key: string) => {
    if (key === currentKey) {
      return;
    }

    switchSession(key);
    void broadcastSessionChange(key);
  };

  const beginRename = (session: SessionRow) => {
    setMenu(null);
    setEditingKey(session.key);
    setDraftLabel(session.label || "");
  };

  const cancelRename = () => {
    setEditingKey(null);
    setDraftLabel("");
  };

  const commitRename = async () => {
    if (!editingKey) {
      return;
    }

    const key = editingKey;
    const normalized = draftLabel.trim();
    cancelRename();
    await renameSession(key, normalized);
  };

  const handleReset = async (key: string) => {
    setMenu(null);
    await resetSession(key);
    if (key === currentKey) {
      clearMessages(key);
    }
  };

  const handleDelete = async (key: string) => {
    setMenu(null);
    if (!window.confirm("删除这个会话？这会移除当前 session 记录。")) {
      return;
    }

    const wasCurrent = key === currentKey;
    const nextKey = await deleteSession(key);

    if (wasCurrent) {
      clearMessages(key);
      if (nextKey) {
        void broadcastSessionChange(nextKey);
      }
    }
  };

  const handleRemoveFromWorkspace = (key: string) => {
    setMenu(null);
    const tabIndex = openSessionKeys.indexOf(key);
    const remainingOpenSessionKeys = openSessionKeys.filter((sessionKey) => sessionKey !== key);
    const nextActiveKey =
      key === currentKey && tabIndex !== -1
        ? remainingOpenSessionKeys[tabIndex] ?? remainingOpenSessionKeys[tabIndex - 1] ?? null
        : null;

    removeFromWorkspace(key);

    if (key === currentKey && tabIndex !== -1) {
      useWorkspace.getState().setActiveSessionKey(nextActiveKey);
    }

    syncWorkspaceState();

    if (key === currentKey) {
      const restoredActiveKey = useWorkspace.getState().activeSessionKey;
      if (restoredActiveKey) {
        void broadcastSessionChange(restoredActiveKey);
      }
    }
  };

  const openMenu = (event: MouseEvent, session: SessionRow) => {
    event.preventDefault();
    event.stopPropagation();

    const menuWidth = 180;
    const menuHeight = 168;
    const padding = 12;
    const x = Math.min(event.clientX, window.innerWidth - menuWidth - padding);
    const y = Math.min(event.clientY, window.innerHeight - menuHeight - padding);

    setMenu({
      key: session.key,
      x: Math.max(padding, x),
      y: Math.max(padding, y),
    });
  };

  const handleDragStart = (event: DragEvent<HTMLDivElement>, key: string) => {
    if (editingKey) {
      event.preventDefault();
      return;
    }

    setDraggingKey(key);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", key);
  };

  const handleDrop = (targetKey: string) => {
    if (!draggingKey || draggingKey === targetKey) {
      return;
    }

    setSessionOrder(moveKeyBeforeTarget(workspaceSessionKeys, draggingKey, targetKey));
    setDraggingKey(null);
  };

  const menuSession = menu
    ? workspaceSessions.find((session) => session.key === menu.key) ?? null
    : null;

  if (sidebarCollapsed) {
    return (
      <aside className={`${styles.sidebar} ${styles.sidebarCollapsed}`}>
        <div className={styles.collapsedControls}>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={toggleSidebarCollapsed}
            title="展开侧栏"
          >
            &#8250;
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={onOpenWorkspaceManager}
            title="管理工作区"
          >
            +
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebarHeader}>
        <div>
          <div className={styles.headerEn}>WORKSPACE</div>
          <div className={styles.headerJa}>工作区会话</div>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={onOpenWorkspaceManager}
            title="添加会话"
          >
            +
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={toggleSidebarCollapsed}
            title="折叠侧栏"
          >
            &#8249;
          </button>
        </div>
      </div>

      <div className={styles.filterPanel}>
        <input
          className={styles.filterInput}
          value={filterText}
          onChange={(event) => setFilterText(event.target.value)}
          placeholder="关键词过滤"
        />
        <div className={styles.filterRow}>
          <button
            type="button"
            className={`${styles.filterChip} ${filterPresets.subagent ? styles.filterChipActive : ""}`}
            onClick={() => toggleFilterPreset("subagent")}
          >
            subagent
          </button>
          <button
            type="button"
            className={`${styles.filterChip} ${filterPresets.cron ? styles.filterChipActive : ""}`}
            onClick={() => toggleFilterPreset("cron")}
          >
            cron
          </button>
          {hasActiveFilters && (
            <button
              type="button"
              className={styles.filterClear}
              onClick={clearFilters}
            >
              清空
            </button>
          )}
        </div>
      </div>

      {workspaceSessions.length === 0 ? (
        <div className={styles.empty}>工作区里还没有会话，点击右上角添加。</div>
      ) : filteredWorkspaceSessions.length === 0 ? (
        <div className={styles.empty}>没有匹配当前过滤条件的会话。</div>
      ) : (
        <div className={styles.list}>
          {filteredWorkspaceSessions.map((session) => (
            <div
              key={session.key}
              className={`${styles.itemRow} ${session.key === currentKey ? styles.active : ""} ${draggingKey === session.key ? styles.dragging : ""}`}
              title={session.key}
              draggable={editingKey !== session.key}
              onDragStart={(event) => handleDragStart(event, session.key)}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDragEnd={() => setDraggingKey(null)}
              onDrop={(event) => {
                event.preventDefault();
                handleDrop(session.key);
              }}
              onContextMenu={(event) => openMenu(event, session)}
            >
              {editingKey === session.key ? (
                <div className={styles.renameRow}>
                  <input
                    className={styles.renameInput}
                    value={draftLabel}
                    onChange={(event) => setDraftLabel(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void commitRename();
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        cancelRename();
                      }
                    }}
                    placeholder="输入会话名"
                    autoFocus
                  />
                  <button className={styles.actionBtn} onClick={() => void commitRename()}>
                    保存
                  </button>
                  <button className={styles.actionBtn} onClick={cancelRename}>
                    取消
                  </button>
                </div>
              ) : (
                <button className={styles.item} onClick={() => handleClick(session.key)}>
                  <span className={styles.dragHandle} aria-hidden="true">
                    &#8801;
                  </span>
                  <span className={styles.itemLabel}>{sessionTitles.get(session.key) ?? session.key}</span>
                  {getSessionSourceTitle(session) && (
                    <span className={styles.itemMeta}>{getSessionSourceTitle(session)}</span>
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {menu && menuSession ? (
        <div
          className={styles.contextMenu}
          style={{ left: menu.x, top: menu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button className={styles.menuItem} onClick={() => beginRename(menuSession)}>
            改名
          </button>
          <button className={styles.menuItem} onClick={() => handleRemoveFromWorkspace(menuSession.key)}>
            移出工作区
          </button>
          <button
            className={styles.menuItem}
            onClick={() => void handleReset(menuSession.key)}
            disabled={!connected}
          >
            重置
          </button>
          <button
            className={`${styles.menuItem} ${styles.menuDanger}`}
            onClick={() => void handleDelete(menuSession.key)}
            disabled={!connected}
          >
            删除
          </button>
        </div>
      ) : null}
    </aside>
  );
}
