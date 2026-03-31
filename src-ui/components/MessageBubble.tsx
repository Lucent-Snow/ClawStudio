import type { UIMessage } from "../lib/types";
import { AssistantMessageContent } from "./AssistantMessageContent";
import { MessageAttachments } from "./MessageAttachments";
import styles from "./MessageBubble.module.css";

function normalizeLabel(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function MessageBubble({
  message,
  isStreaming = false,
  assistantName,
  assistantAvatar,
}: {
  message: UIMessage;
  isStreaming?: boolean;
  assistantName?: string | null;
  assistantAvatar?: string | null;
}) {
  const isToolMessage = message.displayKind === "tool";
  const cls = message.role === "user"
    ? styles.user
    : isToolMessage
      ? styles.tool
      : styles.assistant;
  const resolvedAssistantName = normalizeLabel(assistantName) ?? "助手";
  const resolvedAssistantAvatar = normalizeLabel(assistantAvatar);
  const renderAssistantAvatarAsImage = Boolean(
    resolvedAssistantAvatar &&
    (/^https?:\/\//i.test(resolvedAssistantAvatar) ||
      /^data:image\//i.test(resolvedAssistantAvatar) ||
      resolvedAssistantAvatar.startsWith("/")),
  );
  const assistantAvatarNode =
    resolvedAssistantAvatar && !isToolMessage ? (
      renderAssistantAvatarAsImage ? (
        <img
          className={styles.assistantAvatar}
          src={resolvedAssistantAvatar}
          alt={resolvedAssistantName}
        />
      ) : (
        <div className={styles.assistantAvatarText} aria-hidden="true">
          {resolvedAssistantAvatar}
        </div>
      )
    ) : null;
  const bubble = (
    <div className={`${styles.bubble} ${cls}`}>
      <div className={styles.meta}>
        {message.role === "user"
          ? "我 \u25C6"
          : isToolMessage
            ? "\u25C6 工具"
            : `\u25C6 ${resolvedAssistantName}`}
      </div>
      {message.role === "assistant" ? (
        <div className={styles.assistantContent}>
          {message.attachments && message.attachments.length > 0 && (
            <MessageAttachments attachments={message.attachments} />
          )}
          {message.content.trim() ? (
            <AssistantMessageContent
              content={message.content}
              toolLabel={message.toolLabel}
              forceToolBlock={isToolMessage}
            />
          ) : isStreaming ? (
            <div className={styles.thinkingDots} aria-label="AI thinking">
              ……
            </div>
          ) : null}
          {isStreaming && message.content.trim() && (
            <span className={styles.cursor} aria-hidden="true">
              &#9612;
            </span>
          )}
        </div>
      ) : (
        <div className={styles.userContent}>
          {message.attachments && message.attachments.length > 0 && (
            <MessageAttachments attachments={message.attachments} />
          )}
          {message.content.trim() ? <div className={styles.userText}>{message.content}</div> : null}
        </div>
      )}
    </div>
  );

  if (message.role === "assistant" && !isToolMessage) {
    return (
      <div className={styles.assistantRow}>
        {assistantAvatarNode}
        {bubble}
      </div>
    );
  }

  return bubble;
}
