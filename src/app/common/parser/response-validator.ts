import type { MatchResponse } from '../models/match-response.model';

/** A check failed; `issues` lists the individual problems (path: problem) for display. */
export class ValidationError extends Error {
  constructor(
    message: string,
    readonly issues: string[] = [],
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

type Shape = 'string' | 'number' | 'integer' | { [key: string]: Shape } | Shape[];
type ObjectShape = { [key: string]: Shape };

const PLAYER: ObjectShape = { name: 'string', number: 'integer', position: 'string' };
const LINEUP: ObjectShape = { team: 'string', formation: 'string', coach: 'string', startingXI: [PLAYER], bench: [PLAYER] };
const SCORER: ObjectShape = { team: 'string', player: 'string', minute: 'integer', assist: 'string', type: 'string' };
const OPTIONAL_KEYS = new Set(['scorers[].assist']);

/** Expected JSON format — every generated, tested or imported response must match it exactly. */
const RESPONSE: ObjectShape = {
  competition: { name: 'string', season: 'string', round: 'string' },
  venue: { name: 'string', city: 'string' },
  kickoff: 'string',
  status: 'string',
  teams: { home: 'string', away: 'string' },
  score: { home: 'integer', away: 'integer', halfTime: { home: 'integer', away: 'integer' } },
  scorers: [SCORER],
  lineups: { home: LINEUP, away: LINEUP },
};

const MAX_ISSUES = 20;

/** Returns a list of structural problems (empty when the value matches the expected JSON format exactly). */
export function validateResponse(value: unknown, path = ''): string[] {
  const issues: string[] = [];
  check(value, RESPONSE, path, '', issues, (field) => issues.push(`${field}: missing`));
  if (issues.length === 0) checkKickoff(value, path, issues);
  return issues;
}

/**
 * Checks a partial response (parsed from a feed that lacks some data): fields that are present must have the right
 * type and no unknown fields are allowed, but absent fields are only reported in `missing` (e.g. "lineups.home.coach").
 */
export function validatePartialResponse(value: unknown, path = ''): { issues: string[]; missing: string[] } {
  const issues: string[] = [];
  const missing: string[] = [];
  check(value, RESPONSE, path, '', issues, (field) => missing.push(field.slice(path.length).replace(/^\./, '')));
  if (issues.length === 0 && (value as MatchResponse).kickoff !== undefined) checkKickoff(value, path, issues);
  return { issues, missing };
}

function checkKickoff(value: unknown, path: string, issues: string[]): void {
  if (Number.isNaN(Date.parse((value as MatchResponse).kickoff))) issues.push(`${path}.kickoff: not a valid ISO 8601 date`);
}

type OnMissing = (path: string) => void;

function check(value: unknown, shape: Shape, path: string, schemaPath: string, issues: string[], onMissing: OnMissing): void {
  if (Array.isArray(shape)) {
    if (!Array.isArray(value)) return void issues.push(`${path}: expected array`);
    value.forEach((v, i) => check(v, shape[0]!, `${path}[${i}]`, `${schemaPath}[]`, issues, onMissing));
    return;
  }
  if (typeof shape === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return void issues.push(`${path}: expected object`);
    const obj = value as Record<string, unknown>;
    for (const key of Object.keys(shape)) {
      const keyPath = schemaPath ? `${schemaPath}.${key}` : key;
      if (!(key in obj)) {
        if (!OPTIONAL_KEYS.has(keyPath)) onMissing(`${path}.${key}`);
        continue;
      }
      check(obj[key], shape[key]!, `${path}.${key}`, keyPath, issues, onMissing);
    }
    for (const key of Object.keys(obj)) {
      if (!(key in shape)) issues.push(`${path}.${key}: unexpected field`);
    }
    return;
  }
  const ok = shape === 'integer' ? Number.isInteger(value) : typeof value === shape;
  if (!ok) issues.push(`${path}: expected ${shape}, got ${value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value}`);
}

/** Keeps long issue lists readable. */
export function limitIssues(issues: string[]): string[] {
  if (issues.length <= MAX_ISSUES) return issues;
  return [...issues.slice(0, MAX_ISSUES), `…and ${issues.length - MAX_ISSUES} more`];
}

export const issueCount = (n: number): string => `${n} issue${n === 1 ? '' : 's'}`;
