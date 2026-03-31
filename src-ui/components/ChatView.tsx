import { useEffect, useMemo, useRef, useState } from "react";
import {
  gatewayAgentIdentityGet,
  gatewayModelsList,
  type GatewayModelOption,
} from "../lib/tauri-gateway";
import { getSessionAgentName } from "../lib/session-display";
import type { GatewayAgentIdentity } from "../lib/types";
import { useChat } from "../stores/chat";
import { useGateway } from "../stores/gateway";
import { useAutoScroll } from "../hooks/useAutoScroll";
import { MessageBubble } from "./MessageBubble";
import { Composer } from "./Composer";
import styles from "./ChatView.module.css";

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function composeGatewayModelValue(model: string | null | undefined, provider?: string | null): string {
  const normalizedModel = model?.trim() ?? "";
  if (!normalizedModel) {
    return "";
  }

  const normalizedProvider = provider?.trim() ?? "";
  return normalizedProvider ? `${normalizedProvider}/${normalizedModel}` : normalizedModel;
}

export function ChatView() {
  const messages = useChat((s) => s.messages);
  const streamingText = useChat((s) => s.streamingText);
  const isStreaming = useChat((s) => s.isStreaming);
  const currentKey = useGateway((s) => s.currentSessionKey);
  const sessions = useGateway((s) => s.sessions);
  const status = useGateway((s) => s.status);
  const updateSessionModel = useGateway((s) => s.updateSessionModel);
  const [modelDraft, setModelDraft] = useState("");
  const [isApplyingModel, setIsApplyingModel] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [catalogModels, setCatalogModels] = useState<GatewayModelOption[]>([]);
  const [modelError, setModelError] = useState<string | null>(null);
  const [identity, setIdentity] = useState<GatewayAgentIdentity | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [isLoadingIdentity, setIsLoadingIdentity] = useState(false);
  const modelRequestIdRef = useRef(0);
  const identityRequestIdRef = useRef(0);

  const { scrollRef, isAtBottom, scrollToBottom, handleScroll } = useAutoScroll([
    messages,
    streamingText,
  ]);

  const session = sessions.find((s) => s.key === currentKey);
  const sessionAgentName = session ? getSessionAgentName(session) : null;
  const sessionModelValue = composeGatewayModelValue(session?.model, session?.modelProvider);
  const availableModels = useMemo(() => {
    const options = new Map<string, { value: string; label: string }>();

    for (const option of catalogModels) {
      const value = composeGatewayModelValue(option.id, option.provider);
      if (!value || options.has(value)) {
        continue;
      }

      options.set(value, {
        value,
        label: option.label || value,
      });
    }

    return Array.from(options.values());
  }, [catalogModels]);

  const selectedKnownModel = useMemo(() => {
    const normalized = modelDraft.trim();
    return availableModels.some((option) => option.value === normalized) ? normalized : "";
  }, [availableModels, modelDraft]);

  const currentModelMissing =
    Boolean(sessionModelValue) &&
    !availableModels.some((option) => option.value === sessionModelValue);

  useEffect(() => {
    setModelDraft(sessionModelValue);
    setModelError(null);
    setIsApplyingModel(false);
  }, [session?.key, sessionModelValue]);

  useEffect(() => {
    setIdentity(null);
    setIdentityError(null);
    setIsLoadingIdentity(false);
  }, [currentKey]);

  useEffect(() => {
    let cancelled = false;

    const loadModelCatalog = async () => {
      if (status !== "connected" && status !== "reconnecting") {
        setCatalogModels([]);
        setIsLoadingModels(false);
        return;
      }

      setIsLoadingModels(true);

      try {
        const models = await gatewayModelsList();
        if (!cancelled) {
          setCatalogModels(models);
        }
      } catch {
        if (!cancelled) {
          setCatalogModels([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingModels(false);
        }
      }
    };

    void loadModelCatalog();

    return () => {
      cancelled = true;
    };
  }, [status]);

  useEffect(() => {
    if (!currentKey || status !== "connected") {
      setIsLoadingIdentity(false);
      return;
    }

    let cancelled = false;
    const requestId = identityRequestIdRef.current + 1;
    identityRequestIdRef.current = requestId;
    setIsLoadingIdentity(true);
    setIdentityError(null);

    void gatewayAgentIdentityGet(currentKey)
      .then((nextIdentity) => {
        if (!cancelled && identityRequestIdRef.current === requestId) {
          setIdentity(nextIdentity);
        }
      })
      .catch((error) => {
        if (!cancelled && identityRequestIdRef.current === requestId) {
          setIdentity(null);
          setIdentityError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled && identityRequestIdRef.current === requestId) {
          setIsLoadingIdentity(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentKey, status]);

  const connected = status === "connected";
  const modelSwitchDisabled = !currentKey || !connected || isStreaming || isApplyingModel;
  const identityAgentId = normalizeText(identity?.agentId) ?? sessionAgentName;
  const identityName = normalizeText(identity?.name);
  const identityAvatar = normalizeText(identity?.avatar);
  const identityEmoji = normalizeText(identity?.emoji);
  const identityTitle = identityAgentId ?? identityName ?? "unknown-agent";
  const hasDistinctIdentityName =
    Boolean(identityAgentId && identityName) &&
    identityAgentId!.toLocaleLowerCase() !== identityName!.toLocaleLowerCase();
  const identityFallbackGlyph = (identityEmoji ?? identityTitle.slice(0, 1)).toUpperCase();
  const streamingMessage = isStreaming
      ? {
          id: "__streaming__",
          role: "assistant" as const,
          content: streamingText,
          tachie: null,
          style: null,
          timestamp: Date.now(),
          displayKind: "message" as const,
        toolLabel: null,
      }
    : null;

  const handleModelApply = async (nextModel = modelDraft) => {
    if (!currentKey || !connected || isStreaming || isApplyingModel) {
      return;
    }

    const normalized = nextModel.trim();
    if (normalized === sessionModelValue) {
      setModelError(null);
      return;
    }

    const requestId = modelRequestIdRef.current + 1;
    modelRequestIdRef.current = requestId;
    setIsApplyingModel(true);
    setModelError(null);

    try {
      await updateSessionModel(currentKey, normalized);
    } catch (error) {
      if (modelRequestIdRef.current === requestId) {
        setModelError(error instanceof Error ? error.message : String(error));
        setModelDraft(sessionModelValue);
      }
    } finally {
      if (modelRequestIdRef.current === requestId) {
        setIsApplyingModel(false);
      }
    }
  };

  if (status !== "connected" && status !== "reconnecting") {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>请先连接网关</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.infoBar}>
        <span className={styles.infoLabel}>模型</span>
        <select
          className={styles.modelSelect}
          value={selectedKnownModel}
          onChange={(event) => {
            const nextValue = event.target.value;
            setModelDraft(nextValue);
            setModelError(null);
            if (nextValue) {
              void handleModelApply(nextValue);
            }
          }}
          disabled={modelSwitchDisabled || availableModels.length === 0}
        >
          <option value="">
            {isLoadingModels
              ? "读取模型列表中..."
              : availableModels.length > 0
                ? "选择要切换的模型"
                : "未发现模型列表"}
          </option>
          {availableModels.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className={styles.modelHint}>
          {isLoadingModels ? "正在同步模型候选..." : "选择后立即切换"}
        </span>
        {isApplyingModel && <span className={styles.modelHint}>切换中...</span>}
        {currentModelMissing && (
          <span className={styles.modelHint}>
            当前模型 {sessionModelValue} 不在可选列表中
          </span>
        )}
        {modelError && <span className={styles.modelError}>{modelError}</span>}
      </div>
      {currentKey && (
        <div className={styles.identityBar}>
          <div className={styles.identityCard}>
            <div className={styles.identityAvatar} aria-hidden="true">
              {identityAvatar ? (
                <img
                  className={styles.identityAvatarImage}
                  src={identityAvatar}
                  alt={`${identityTitle} avatar`}
                />
              ) : (
                <span className={styles.identityAvatarFallback}>{identityFallbackGlyph}</span>
              )}
            </div>
            <div className={styles.identityBody}>
              <div className={styles.identityEyebrow}>Agent Identity</div>
              <div className={styles.identityTitleRow}>
                <strong className={styles.identityTitle}>{identityTitle}</strong>
                {hasDistinctIdentityName && (
                  <span className={styles.identityDisplayName}>{identityName}</span>
                )}
              </div>
              <div className={styles.identityMetaRow}>
                {identityAgentId && (
                  <span className={styles.identityMeta}>
                    <span className={styles.identityMetaLabel}>Agent</span>
                    <span className={styles.identityMetaValue}>{identityAgentId}</span>
                  </span>
                )}
                {hasDistinctIdentityName && (
                  <span className={styles.identityMeta}>
                    <span className={styles.identityMetaLabel}>Display</span>
                    <span className={styles.identityMetaValue}>{identityName}</span>
                  </span>
                )}
                <span className={styles.identityMeta}>
                  <span className={styles.identityMetaLabel}>Session</span>
                  <span className={styles.identityMetaValue}>{currentKey}</span>
                </span>
              </div>
              {isLoadingIdentity && (
                <div className={styles.identityHint}>正在读取当前 agent identity...</div>
              )}
              {!isLoadingIdentity && identityError && (
                <div className={styles.identityError}>
                  identity 读取失败，当前使用 session 信息兜底
                </div>
              )}
              {!isLoadingIdentity && !identity && !identityError && (
                <div className={styles.identityHint}>
                  当前网关未返回额外 identity 字段，界面使用 session 信息展示。
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <div className={styles.messagesShell}>
        <div className={styles.messages} ref={scrollRef} onScroll={handleScroll}>
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {streamingMessage && <MessageBubble key={streamingMessage.id} message={streamingMessage} isStreaming />}
        </div>
        {!isAtBottom && (
          <button
            className={styles.scrollToBottomBtn}
            onClick={scrollToBottom}
            type="button"
          >
            回到底部
          </button>
        )}
      </div>
      <Composer />
    </div>
  );
}
