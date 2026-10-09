import type { ParsedMatch } from '../../common/models/parsed-match.model';
import { toPrettyJson } from '../../common/services/file-download';

export const EXPORT_FILENAME = 'paris2024-football-expected-responses.json';

/** Machine-readable export: array of expected responses (expected JSON format) in default order. */
export const toExportJson = (matches: ParsedMatch[]): string => toPrettyJson(matches.map((m) => m.response));
