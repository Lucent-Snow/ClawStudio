import { openUrl } from "@tauri-apps/plugin-opener";
import { hasTauriBackend } from "./tauri-gateway";

const EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

export function resolveExternalUrl(input: string): URL | null {
  try {
    const resolved = new URL(input, window.location.href);
    return EXTERNAL_PROTOCOLS.has(resolved.protocol) ? resolved : null;
  } catch {
    return null;
  }
}

export function isExternalUrl(input: string): boolean {
  return resolveExternalUrl(input) !== null;
}

export async function openExternalUrl(input: string): Promise<boolean> {
  const resolved = resolveExternalUrl(input);
  if (!resolved) {
    return false;
  }

  if (hasTauriBackend()) {
    await openUrl(resolved.toString());
    return true;
  }

  window.open(resolved.toString(), "_blank", "noopener,noreferrer");
  return true;
}
