import type { TachieName } from "./emotions";

export interface ParsedMessage {
  text: string;
  tachie: TachieName | null;
  style: string | null;
}

export interface StreamingParseResult {
  text: string;
  tachie: TachieName | null;
  style: string | null;
}

export interface StreamingTagParser {
  feed: (delta: string) => StreamingParseResult;
  flush: () => string;
  reset: () => void;
}

export function parseMessageTags(raw: string): ParsedMessage {
  return {
    text: raw,
    tachie: null,
    style: null,
  };
}

export function parseEmotions(raw: string): { text: string; emotions: TachieName[] } {
  return {
    text: raw,
    emotions: [],
  };
}

export function createStreamingParser(): StreamingTagParser {
  let buffered = "";

  return {
    feed(delta) {
      buffered += delta;
      const text = buffered;
      buffered = "";
      return { text, tachie: null, style: null };
    },
    flush() {
      const text = buffered;
      buffered = "";
      return text;
    },
    reset() {
      buffered = "";
    },
  };
}
