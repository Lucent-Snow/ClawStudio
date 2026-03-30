import type { SessionRow } from "./types";
import type { WorkspaceFilterPreset } from "../stores/workspace";
import { getSessionSourceTitle } from "./session-display";

export function buildSessionSearchText(session: SessionRow): string {
  return [
    session.label,
    session.displayName,
    getSessionSourceTitle(session),
    session.key,
    session.model,
    session.modelProvider,
    session.kind,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
}

function getSessionSearchTokens(filterText: string): string[] {
  return filterText
    .split(/\s+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function sessionMatchesPreset(session: SessionRow, preset: WorkspaceFilterPreset): boolean {
  return buildSessionSearchText(session).includes(preset);
}

function sessionIsHiddenByPreset(
  session: SessionRow,
  filterPresets: Record<WorkspaceFilterPreset, boolean>,
): boolean {
  return (Object.entries(filterPresets) as Array<[WorkspaceFilterPreset, boolean]>)
    .some(([preset, enabled]) => enabled && sessionMatchesPreset(session, preset));
}

export function matchesSessionFilter(
  session: SessionRow,
  filterText: string,
  filterPresets: Record<WorkspaceFilterPreset, boolean>,
): boolean {
  if (sessionIsHiddenByPreset(session, filterPresets)) {
    return false;
  }

  const tokens = getSessionSearchTokens(filterText);
  if (tokens.length === 0) {
    return true;
  }

  const haystack = buildSessionSearchText(session);
  return tokens.every((token) => haystack.includes(token));
}
