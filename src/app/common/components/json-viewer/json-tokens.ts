export type JsonTokenType = 'key' | 'string' | 'number' | 'literal' | 'plain';

export interface JsonToken {
  type: JsonTokenType;
  text: string;
}

const TOKEN = /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*")(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?/g;

/** Splits pretty-printed JSON into typed tokens for syntax highlighting. */
export function tokenizeJson(value: unknown): JsonToken[] {
  const text = JSON.stringify(value, null, 2) ?? 'undefined';
  const tokens: JsonToken[] = [];
  let last = 0;
  const plain = (end: number) => {
    if (end > last) tokens.push({ type: 'plain', text: text.slice(last, end) });
  };

  for (const m of text.matchAll(TOKEN)) {
    plain(m.index);
    if (m[1] !== undefined) {
      tokens.push({ type: m[2] ? 'key' : 'string', text: m[1] });
      if (m[2]) tokens.push({ type: 'plain', text: m[2] });
    } else {
      tokens.push({ type: /^[tfn]/.test(m[0]) ? 'literal' : 'number', text: m[0] });
    }
    last = m.index + m[0].length;
  }
  plain(text.length);
  return tokens;
}
