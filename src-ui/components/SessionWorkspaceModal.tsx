import { useMemo, useState } from "react";
import { broadcastSessionChange } from "../lib/window-sync";
import {
  buildDisambiguatedSessionTitles,
  getSessionAgentName,
  getSessionSourceTitle,
} from "../lib/session-display";
import { matchesSessionFilter } from "../lib/session-filter";
import type { SessionRow } from "../lib/types";
import { useChat } from "../stores/chat";
import { useGateway } from "../stores/gateway";
import { useWorkspace } from "../stores/workspace";
import styles from "./SessionWorkspaceModal.module.css";

export function SessionWorkspaceModal({ onClose }: { onClose: () => void }) {
  const sessions = useGateway((state) => state.sessions);
  const isStreaming = useChat((state) => state.isStreaming);
  const currentSessionKey = useGateway((state) => state.currentSessionKey);
  const status = useGateway((state) => state.status);
  const createSession = useGateway((state) => state.createSession);
  const switchSession = useGateway((state) => state.switchSession);
  const workspaceSessionKeys = useWorkspace((state) => state.sessionKeys);
  const addSession = useWorkspace((state) => state.addSession);
  const filterText = useWorkspace((state) => state.filterText);
  const filterPresets = useWorkspace((state) => state.filterPresets);
  const setFilterText = useWorkspace((state) => state.setFilterText);
  const toggleFilterPreset = useWorkspace((state) => state.toggleFilterPreset);
  const clearFilters = useWorkspace((state) => state.clearFilters);
  const [newSessionLabel, setNewSessionLabel] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const connected = status === "connected" || status === "reconnecting";
  const hasActiveFilters = filterText.trim().length > 0 || filterPresets.subagent || filterPresets.cron;

  const workspaceKeySet = useMemo(() => new Set(workspaceSessionKeys), [workspaceSessionKeys]);
  const filteredSessions = useMemo(
    () =>
      sessions.filter((session) =>
        matchesSessionFilter(session, filterText.trim(), filterPresets),
      ),
    [filterPresets, filterText, sessions],
  );
  const titles = useMemo(
    () => buildDisambiguatedSessionTitles(filteredSessions),
    [filteredSessions],
  );

  const workspaceSessions = filteredSessions.filter((session) => workspaceKeySet.has(session.key));
  const availableSessions = filteredSessions.filter((session) => !workspaceKeySet.has(session.key));

  const handleAddToWorkspace = (sessionKey: string) => {
    addSession(sessionKey);
  };

  const handleCreateSession = async () => {
    if (!connected || isCreating) {
      return;
    }

    setIsCreating(true);
    setCreateError(null);
    try {
      const key = await createSession(newSessionLabel);
      switchSession(key);
      void broadcastSessionChange(key);
      setNewSessionLabel("");
      onClose();
    } finally {
      setIsCreating(false);
    }
  };

  const renderSessionCopy = (session: SessionRow) => {
    const agentName = getSessionAgentName(session);
    const sourceTitle = getSessionSourceTitle(session);
    const sourceLabel = agentName && sourceTitle === agentName ? "Agent" : "来源";

    return (
      <div className={styles.sessionCopy}>
        <div className={styles.sessionTitle}>
          <span className={styles.sessionTitleText}>{titles.get(session.key) ?? session.key}</span>
          {isStreaming && session.key === currentSessionKey && (
            <span className={styles.streamingIndicator}>...</span>
          )}
        </div>
        {sourceTitle && (
          <div className={styles.sessionMeta}>
            {sourceLabel}: {sourceTitle}
          </div>
        )}
        <div className={styles.sessionKey}>{session.key}</div>
      </div>
    );
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(event) => event.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <div className={styles.title}>管理工作区</div>
            <div className={styles.subtitle}>工作区内容、过滤条件和标签顺序都会自动恢复。</div>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            关闭
          </button>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>新建会话</div>
          <div className={styles.sectionHint}>
            输入内容会直接作为 key 尾部；重名时会自动追加编号。留空时默认使用 `session-N`。
          </div>
          <div className={styles.createRow}>
            <input
              className={styles.input}
              value={newSessionLabel}
              onChange={(event) => setNewSessionLabel(event.target.value)}
              placeholder="输入会话名称"
              disabled={!connected || isCreating}
            />
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void handleCreateSession()}
              disabled={!connected || isCreating}
            >
              {isCreating ? "创建中..." : "新建并加入"}
            </button>
          </div>
          {createError && <div className={styles.errorText}>{createError}</div>}
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>现有会话</div>
          <div className={styles.toolbar}>
            <input
              className={styles.input}
              value={filterText}
              onChange={(event) => setFilterText(event.target.value)}
              placeholder="搜索会话名称、agent、key、model"
            />
            <div className={styles.filterRow}>
              <button
                type="button"
                className={`${styles.filterChip} ${filterPresets.subagent ? styles.filterChipActive : ""}`}
                onClick={() => toggleFilterPreset("subagent")}
              >
                隐藏 subagent
              </button>
              <button
                type="button"
                className={`${styles.filterChip} ${filterPresets.cron ? styles.filterChipActive : ""}`}
                onClick={() => toggleFilterPreset("cron")}
              >
                隐藏 cron
              </button>
              {hasActiveFilters && (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={clearFilters}
                >
                  重置
                </button>
              )}
            </div>
          </div>
          <div className={styles.sectionHint}>过滤只影响这里的展示，不会删除会话。</div>

          <div className={styles.listShell}>
            {workspaceSessions.length > 0 && (
              <div className={styles.group}>
                <div className={styles.groupTitle}>已在工作区</div>
                {workspaceSessions.map((session) => (
                  <div key={session.key} className={styles.sessionRow}>
                    {renderSessionCopy(session)}
                    <button type="button" className={styles.secondaryButton} disabled>
                      已加入
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className={styles.group}>
              <div className={styles.groupTitle}>可加入的会话</div>
              {availableSessions.length === 0 ? (
                <div className={styles.empty}>没有匹配当前过滤条件且可加入的会话。</div>
              ) : (
                availableSessions.map((session) => (
                  <div key={session.key} className={styles.sessionRow}>
                    {renderSessionCopy(session)}
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() => handleAddToWorkspace(session.key)}
                    >
                      加入
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
