import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  restrictToFirstScrollableAncestor,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from "react";
import { useChat } from "../stores/chat";
import { useGateway } from "../stores/gateway";
import { useWorkspace } from "../stores/workspace";
import {
  buildDisambiguatedSessionTitles,
  getSessionSourceTitle,
} from "../lib/session-display";
import { broadcastSessionChange } from "../lib/window-sync";
import type { SessionRow } from "../lib/types";
import styles from "./SessionList.module.css";

interface SessionMenuState {
  key: string;
  x: number;
  y: number;
}

function reorderFilteredKeys(
  allKeys: string[],
  visibleKeys: string[],
  activeKey: string,
  overKey: string,
) {
  const visibleOrder = visibleKeys.filter((key) => allKeys.includes(key));
  const fromIndex = visibleOrder.indexOf(activeKey);
  const toIndex = visibleOrder.indexOf(overKey);

  if (fromIndex === -1 || toIndex === -1) {
    return allKeys;
  }

  const reorderedVisibleKeys = arrayMove(visibleOrder, fromIndex, toIndex);
  const visibleKeySet = new Set(reorderedVisibleKeys);
  let visibleIndex = 0;

  return allKeys.map((key) => {
    if (!visibleKeySet.has(key)) {
      return key;
    }

    return reorderedVisibleKeys[visibleIndex++] ?? key;
  });
}

interface SortableSessionItemProps {
  currentKey: string | null;
  draftLabel: string;
  editing: boolean;
  isDraggingOverlayActive: boolean;
  onClick: (key: string) => void;
  onContextMenu: (event: MouseEvent, session: SessionRow) => void;
  onDraftLabelChange: (value: string) => void;
  onRenameCancel: () => void;
  onRenameCommit: () => void | Promise<void>;
  session: SessionRow;
  streaming: boolean;
  title: string;
}

function SortableSessionItem({
  currentKey,
  draftLabel,
  editing,
  isDraggingOverlayActive,
  onClick,
  onContextMenu,
  onDraftLabelChange,
  onRenameCancel,
  onRenameCommit,
  session,
  streaming,
  title,
}: SortableSessionItemProps) {
  const sourceTitle = getSessionSourceTitle(session);
  const {
    attributes,
    isDragging,
    isSorting,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: session.key,
    disabled: editing,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={[
        styles.itemRow,
        session.key === currentKey ? styles.active : "",
        isDragging ? styles.dragging : "",
        isSorting ? styles.sorting : "",
      ].filter(Boolean).join(" ")}
      title={session.key}
      onContextMenu={(event) => onContextMenu(event, session)}
    >
      {editing ? (
        <div className={styles.renameRow}>
          <input
            className={styles.renameInput}
            value={draftLabel}
            onChange={(event) => onDraftLabelChange(event.target.value)}
            onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void onRenameCommit();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                onRenameCancel();
              }
            }}
            placeholder="输入会话名"
            autoFocus
          />
          <button className={styles.actionBtn} onClick={() => void onRenameCommit()}>
            保存
          </button>
          <button className={styles.actionBtn} onClick={onRenameCancel}>
            取消
          </button>
        </div>
      ) : (
        <button
          type="button"
          ref={setActivatorNodeRef}
          className={styles.item}
          onClick={() => onClick(session.key)}
          {...attributes}
          {...listeners}
        >
          <span
            className={`${styles.dragHandle} ${isDraggingOverlayActive ? styles.dragHandleActive : ""}`}
            aria-hidden="true"
          >
            &#8801;
          </span>
          <span className={styles.itemLabel}>
            <span className={styles.itemLabelText}>{title}</span>
            {streaming && <span className={styles.streamingIndicator}>...</span>}
          </span>
          {sourceTitle && (
            <span className={styles.itemMeta}>{sourceTitle}</span>
          )}
        </button>
      )}
    </div>
  );
}

export function SessionList({ onOpenWorkspaceManager }: { onOpenWorkspaceManager: () => void }) {
  const clearMessages = useChat((state) => state.clearMessages);
  const streamingSessionKeys = useChat((state) => state.streamingSessionKeys);
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
  const removeFromWorkspace = useWorkspace((state) => state.removeSession);
  const pruneWorkspace = useWorkspace((state) => state.reconcileSessions);
  const setSessionOrder = useWorkspace((state) => state.setSessionOrder);
  const toggleSidebarCollapsed = useWorkspace((state) => state.toggleSidebarCollapsed);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [menu, setMenu] = useState<SessionMenuState | null>(null);
  const [activeDragKey, setActiveDragKey] = useState<string | null>(null);
  const connected = status === "connected" || status === "reconnecting";
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const workspaceSessions = useMemo(() => {
    const byKey = new Map(sessions.map((session) => [session.key, session]));
    return workspaceSessionKeys
      .map((key) => byKey.get(key))
      .filter((session): session is SessionRow => Boolean(session));
  }, [sessions, workspaceSessionKeys]);
  const workspaceKeys = useMemo(
    () => workspaceSessions.map((session) => session.key),
    [workspaceSessions],
  );
  const sessionTitles = useMemo(
    () => buildDisambiguatedSessionTitles(workspaceSessions),
    [workspaceSessions],
  );
  const streamingSessionKeySet = useMemo(
    () => new Set(streamingSessionKeys),
    [streamingSessionKeys],
  );

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

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragKey(String(event.active.id));
    setMenu(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const activeKey = String(event.active.id);
    const overKey = event.over ? String(event.over.id) : null;
    setActiveDragKey(null);

    if (!overKey || activeKey === overKey) {
      return;
    }

    if (!workspaceKeys.includes(activeKey) || !workspaceKeys.includes(overKey)) {
      return;
    }

    setSessionOrder(
      reorderFilteredKeys(
        workspaceSessionKeys,
        workspaceKeys,
        activeKey,
        overKey,
      ),
    );
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

      {workspaceSessions.length === 0 ? (
        <div className={styles.empty}>工作区里还没有会话，点击右上角添加。</div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToFirstScrollableAncestor]}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveDragKey(null)}
        >
          <SortableContext items={workspaceKeys} strategy={verticalListSortingStrategy}>
            <div className={styles.list}>
              {workspaceSessions.map((session) => (
                <SortableSessionItem
                  key={session.key}
                  currentKey={currentKey}
                  draftLabel={draftLabel}
                  editing={editingKey === session.key}
                  isDraggingOverlayActive={activeDragKey === session.key}
                  onClick={handleClick}
                  onContextMenu={openMenu}
                  onDraftLabelChange={setDraftLabel}
                  onRenameCancel={cancelRename}
                  onRenameCommit={commitRename}
                  session={session}
                  streaming={streamingSessionKeySet.has(session.key)}
                  title={sessionTitles.get(session.key) ?? session.key}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
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
