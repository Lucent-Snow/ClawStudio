import { useEffect, useMemo, useRef, useState } from "react";
import {
  gatewayAgentIdentityGet,
  gatewayModelsList,
  type GatewayModelOption,
} from "../lib/tauri-gateway";
import type { GatewayAgentIdentity } from "../lib/types";
import { useSettings } from "../stores/settings";
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

function resolveGatewayHttpBase(url: string | null | undefined): string | null {
  const normalized = url?.trim();
  if (!normalized) {
    return null;
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol === "ws:") {
      parsed.protocol = "http:";
    } else if (parsed.protocol === "wss:") {
      parsed.protocol = "https:";
    }
    parsed.pathname = "/";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function resolveAssistantAvatar(
  identity: GatewayAgentIdentity | null,
  gatewayUrl: string | null | undefined,
): string | null {
  const avatar = normalizeText(identity?.avatarUrl) ?? normalizeText(identity?.avatar);
  if (!avatar) {
    return null;
  }

  if (
    /^https?:\/\//i.test(avatar) ||
    /^data:image\//i.test(avatar) ||
    /^blob:/i.test(avatar)
  ) {
    return avatar;
  }

  if (/^file:/i.test(avatar)) {
    return null;
  }

  const base = resolveGatewayHttpBase(gatewayUrl);
  if (!base) {
    return null;
  }

  let resolved: URL;
  try {
    resolved = new URL(avatar, base);
  } catch {
    return null;
  }

  if (resolved.protocol === "file:") {
    return null;
  }

  return resolved.toString();
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
  const gatewayUrl = useSettings((s) => s.gateway.url);
  const [modelDraft, setModelDraft] = useState("");
  const [isApplyingModel, setIsApplyingModel] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [catalogModels, setCatalogModels] = useState<GatewayModelOption[]>([]);
  const [modelError, setModelError] = useState<string | null>(null);
  const [assistantIdentity, setAssistantIdentity] = useState<GatewayAgentIdentity | null>(null);
  const [readyAssistantAvatar, setReadyAssistantAvatar] = useState<string | null>(null);
  const [failedAssistantAvatar, setFailedAssistantAvatar] = useState<string | null>(null);
  const modelRequestIdRef = useRef(0);
  const identityRequestIdRef = useRef(0);

  const { scrollRef, isAtBottom, scrollToBottom, handleScroll } = useAutoScroll([
    messages,
    streamingText,
  ]);

  const session = sessions.find((s) => s.key === currentKey);
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
    if (!currentKey) {
      setAssistantIdentity(null);
      return;
    }

    if (status !== "connected") {
      if (status !== "reconnecting") {
        setAssistantIdentity(null);
      }
      return;
    }

    let cancelled = false;
    const requestId = identityRequestIdRef.current + 1;
    identityRequestIdRef.current = requestId;
    setAssistantIdentity(null);

    void gatewayAgentIdentityGet(currentKey)
      .then((identity) => {
        if (!cancelled && identityRequestIdRef.current === requestId) {
          setAssistantIdentity(identity);
        }
      })
      .catch(() => {
        if (!cancelled && identityRequestIdRef.current === requestId) {
          setAssistantIdentity(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentKey, status]);

  const connected = status === "connected";
  const modelSwitchDisabled = !currentKey || !connected || isStreaming || isApplyingModel;
  const assistantName = normalizeText(assistantIdentity?.name) ?? "助手";
  const assistantAvatar = resolveAssistantAvatar(assistantIdentity, gatewayUrl);
  const displayAssistantAvatar =
    assistantAvatar && readyAssistantAvatar === assistantAvatar && failedAssistantAvatar !== assistantAvatar
      ? assistantAvatar
      : null;
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

  useEffect(() => {
    if (!assistantAvatar) {
      setReadyAssistantAvatar(null);
      setFailedAssistantAvatar(null);
      return;
    }

    let cancelled = false;
    const image = new Image();

    setReadyAssistantAvatar(null);
    setFailedAssistantAvatar(null);

    image.onload = () => {
      if (!cancelled) {
        setReadyAssistantAvatar(assistantAvatar);
      }
    };
    image.onerror = () => {
      if (!cancelled) {
        setReadyAssistantAvatar(null);
        setFailedAssistantAvatar(assistantAvatar);
      }
    };
    image.src = assistantAvatar;

    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [assistantAvatar]);

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
      <div className={styles.messagesShell}>
        <div className={styles.messages} ref={scrollRef} onScroll={handleScroll}>
          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              assistantName={assistantName}
              assistantAvatar={displayAssistantAvatar}
            />
          ))}
          {streamingMessage && (
            <MessageBubble
              key={streamingMessage.id}
              message={streamingMessage}
              isStreaming
              assistantName={assistantName}
              assistantAvatar={displayAssistantAvatar}
            />
          )}
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
