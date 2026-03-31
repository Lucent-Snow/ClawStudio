import type { SessionRow } from "./types";

function normalizeLabel(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function sessionKeyTail(key: string): string {
  return key.split(":").pop() || key;
}

export function getSessionAgentName(session: SessionRow): string | null {
  const parts = session.key.split(":").filter(Boolean);
  if (parts[0] === "agent" && parts.length >= 3) {
    return normalizeLabel(parts[1]);
  }

  return null;
}

export function getSessionDisplayTitle(session: SessionRow): string {
  return normalizeLabel(session.label) ?? sessionKeyTail(session.key);
}

export function getSessionSourceTitle(session: SessionRow): string | null {
  const agentName = getSessionAgentName(session);
  const displayTitle = normalizeLabel(getSessionDisplayTitle(session));
  if (agentName && agentName !== displayTitle) {
    return agentName;
  }

  const displayName = normalizeLabel(session.displayName);
  const label = normalizeLabel(session.label);

  if (!displayName || displayName === label) {
    return null;
  }

  return displayName;
}

export function buildDisambiguatedSessionTitles(sessions: SessionRow[]): Map<string, string> {
  const totals = new Map<string, number>();
  const sourceTotals = new Map<string, number>();
  const indexes = new Map<string, number>();
  const titles = new Map<string, string>();

  for (const session of sessions) {
    const baseTitle = getSessionDisplayTitle(session);
    totals.set(baseTitle, (totals.get(baseTitle) ?? 0) + 1);

    const sourceTitle = getSessionSourceTitle(session);
    if (sourceTitle) {
      const sourceKey = `${baseTitle}\u0000${sourceTitle}`;
      sourceTotals.set(sourceKey, (sourceTotals.get(sourceKey) ?? 0) + 1);
    }
  }

  for (const session of sessions) {
    const baseTitle = getSessionDisplayTitle(session);
    const total = totals.get(baseTitle) ?? 1;
    if (total <= 1) {
      titles.set(session.key, baseTitle);
      continue;
    }

    const sourceTitle = getSessionSourceTitle(session);
    if (sourceTitle) {
      const sourceKey = `${baseTitle}\u0000${sourceTitle}`;
      if ((sourceTotals.get(sourceKey) ?? 0) === 1) {
        titles.set(session.key, `${baseTitle} · ${sourceTitle}`);
        continue;
      }
    }

    const nextIndex = (indexes.get(baseTitle) ?? 0) + 1;
    indexes.set(baseTitle, nextIndex);
    titles.set(session.key, `${baseTitle} (${nextIndex})`);
  }

  return titles;
}
