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

export function getSessionFilterTokens(
  filterText: string,
  filterPresets: Record<WorkspaceFilterPreset, boolean>,
): string[] {
  const textTokens = filterText
    .split(/\s+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  const presetTokens = (Object.entries(filterPresets) as Array<[WorkspaceFilterPreset, boolean]>)
    .filter(([, enabled]) => enabled)
    .map(([preset]) => preset);

  return [...textTokens, ...presetTokens];
}

export function matchesSessionFilter(
  session: SessionRow,
  filterText: string,
  filterPresets: Record<WorkspaceFilterPreset, boolean>,
): boolean {
  const tokens = getSessionFilterTokens(filterText, filterPresets);
  if (tokens.length === 0) {
    return true;
  }

  const haystack = buildSessionSearchText(session);
  return tokens.every((token) => haystack.includes(token));
}
