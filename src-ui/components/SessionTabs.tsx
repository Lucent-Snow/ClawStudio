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
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, useState } from "react";
import type { SessionRow } from "../lib/types";
import { broadcastSessionChange } from "../lib/window-sync";
import { buildDisambiguatedSessionTitles } from "../lib/session-display";
import { useChat } from "../stores/chat";
import { useGateway } from "../stores/gateway";
import styles from "./SessionTabs.module.css";

interface SortableTabProps {
  active: boolean;
  currentSessionKey: string | null;
  draggingKey: string | null;
  onClose: (key: string) => void;
  onSwitch: (key: string) => void;
  session: SessionRow;
  streaming: boolean;
  title: string;
}

function SortableTab({
  active,
  currentSessionKey,
  draggingKey,
  onClose,
  onSwitch,
  session,
  streaming,
  title,
}: SortableTabProps) {
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
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={[
        styles.tab,
        active ? styles.active : "",
        isDragging ? styles.dragging : "",
        isSorting ? styles.sorting : "",
      ].filter(Boolean).join(" ")}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        className={styles.tabButton}
        onClick={() => onSwitch(session.key)}
        title={session.key}
        aria-current={session.key === currentSessionKey ? "page" : undefined}
        {...attributes}
        {...listeners}
      >
        <span
          className={`${styles.dragHandle} ${draggingKey === session.key ? styles.dragHandleActive : ""}`}
          aria-hidden="true"
        >
          &#8801;
        </span>
        <span className={styles.tabCopy}>
          <span className={styles.tabLabel}>
            <span className={styles.tabLabelText}>{title}</span>
            {streaming && <span className={styles.streamingIndicator}>...</span>}
          </span>
          {session.model && (
            <span className={styles.tabMeta}>{session.model}</span>
          )}
        </span>
      </button>
      <button
        type="button"
        className={styles.closeButton}
        onClick={() => onClose(session.key)}
        aria-label={`关闭 ${title}`}
        title="关闭标签页"
      >
        &#10005;
      </button>
    </div>
  );
}

export function SessionTabs() {
  const sessions = useGateway((state) => state.sessions);
  const currentSessionKey = useGateway((state) => state.currentSessionKey);
  const openSessionKeys = useGateway((state) => state.openSessionKeys);
  const switchSession = useGateway((state) => state.switchSession);
  const closeSessionTab = useGateway((state) => state.closeSessionTab);
  const reorderOpenSessions = useGateway((state) => state.reorderOpenSessions);
  const streamingSessionKeys = useChat((state) => state.streamingSessionKeys);
  const [activeDragKey, setActiveDragKey] = useState<string | null>(null);
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
  const openSessionIds = useMemo(
    () => openSessions.map((session) => session.key),
    [openSessions],
  );
  const sessionTitles = useMemo(
    () => buildDisambiguatedSessionTitles(openSessions),
    [openSessions],
  );
  const streamingSessionKeySet = useMemo(
    () => new Set(streamingSessionKeys),
    [streamingSessionKeys],
  );
  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragKey(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const activeKey = String(event.active.id);
    const overKey = event.over ? String(event.over.id) : null;
    setActiveDragKey(null);

    if (!overKey || activeKey === overKey) {
      return;
    }

    const fromIndex = openSessionKeys.indexOf(activeKey);
    const toIndex = openSessionKeys.indexOf(overKey);
    if (fromIndex === -1 || toIndex === -1) {
      return;
    }

    reorderOpenSessions(arrayMove(openSessionKeys, fromIndex, toIndex));
  };

  if (openSessions.length === 0) {
    return (
      <div className={styles.emptyBar}>
        <span className={styles.emptyText}>打开一个会话后会显示在这里</span>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToHorizontalAxis]}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDragKey(null)}
    >
      <SortableContext items={openSessionIds} strategy={horizontalListSortingStrategy}>
        <div className={styles.tabBar}>
          {openSessions.map((session) => (
            <SortableTab
              key={session.key}
              active={session.key === currentSessionKey}
              currentSessionKey={currentSessionKey}
              draggingKey={activeDragKey}
              onClose={handleClose}
              onSwitch={handleSwitch}
              session={session}
              streaming={streamingSessionKeySet.has(session.key)}
              title={sessionTitles.get(session.key) ?? session.key}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
