import { getCurrentWindow } from "@tauri-apps/api/window";
import { useGateway } from "../stores/gateway";
import styles from "./TitleBar.module.css";

const appWindow = getCurrentWindow();
const STATUS_CLASS_MAP = {
  disconnected: styles.statusDisconnected,
  connecting: styles.statusConnecting,
  connected: styles.statusConnected,
  reconnecting: styles.statusReconnecting,
  error: styles.statusError,
} as const;

export function TitleBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const status = useGateway((s) => s.status);

  return (
    <div className={styles.titlebar}>
      <div className={styles.drag} data-tauri-drag-region>
        <div className={styles.titleGroup}>
          <span className={styles.titleEn}>CLAWSTUDIO</span>
          <span className={styles.titleJa}>工作台</span>
        </div>
      </div>
      <div className={styles.right}>
        <div className={`${styles.status} ${STATUS_CLASS_MAP[status]}`}>
          <span className={`${styles.dot} ${styles[status]}`} />
          {status}
        </div>
        <button className={styles.iconBtn} onClick={onOpenSettings} title="Settings">
          &#9881;
        </button>
        <button className={styles.iconBtn} onClick={() => appWindow.minimize()}>
          &#8211;
        </button>
        <button className={styles.iconBtn} onClick={() => appWindow.toggleMaximize()}>
          &#9633;
        </button>
        <button className={styles.iconBtn} onClick={() => appWindow.close()}>
          &#10005;
        </button>
      </div>
    </div>
  );
}
