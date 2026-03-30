import type { UIMessage } from "../lib/types";
import { AssistantMessageContent } from "./AssistantMessageContent";
import { MessageAttachments } from "./MessageAttachments";
import styles from "./MessageBubble.module.css";

export function MessageBubble({
  message,
  isStreaming = false,
}: {
  message: UIMessage;
  isStreaming?: boolean;
}) {
  const isToolMessage = message.displayKind === "tool";
  const cls = message.role === "user"
    ? styles.user
    : isToolMessage
      ? styles.tool
      : styles.assistant;

  return (
    <div className={`${styles.bubble} ${cls}`}>
      <div className={styles.meta}>
        {message.role === "user"
          ? "我 \u25C6"
          : isToolMessage
            ? "\u25C6 工具"
            : "\u25C6 助手"}
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
}
