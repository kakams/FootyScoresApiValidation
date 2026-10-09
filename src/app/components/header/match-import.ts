import type { MatchResponse } from '../../common/models/match-response.model';
import type { CompleteMatch, Gender } from '../../common/models/parsed-match.model';
import { issueCount, limitIssues, validateResponse, ValidationError } from '../../common/parser/response-validator';

/** The imported file was rejected. */
export class ImportError extends ValidationError {
  override readonly name = 'ImportError';
}

function genderOf(r: MatchResponse): Gender | null {
  if (/^women'?s\b/i.test(r.competition.name)) return 'W';
  if (/^men'?s\b/i.test(r.competition.name)) return 'M';
  return null;
}

/**
 * Parses a file exported by this app (array of objects in the expected JSON format; a single object is also accepted).
 * The whole file is rejected if any item does not match the structure exactly.
 */
export function parseImportedJson(text: string): CompleteMatch[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new ImportError(`File is not valid JSON${e instanceof Error ? ` (${e.message})` : ''}`);
  }
  const items = Array.isArray(data) ? data : [data];
  if (items.length === 0) throw new ImportError('File contains an empty array — nothing to import');

  const issues = items.flatMap((item, i) => validateResponse(item, Array.isArray(data) ? `[${i}]` : '$'));
  if (issues.length) {
    throw new ImportError(`File does not match the expected JSON format (${issueCount(issues.length)})`, limitIssues(issues));
  }

  const seen = new Map<string, number>();
  return (items as MatchResponse[]).map((response, i) => {
    const key = `${response.kickoff}|${response.teams.home}|${response.teams.away}`;
    const warnings: string[] = [];
    if (seen.has(key)) warnings.push(`duplicate of item #${seen.get(key)! + 1} in the imported file`);
    else seen.set(key, i);
    return {
      // Zero-padded file position keeps ties in kickoff ordered as in the file.
      code: `import-${String(i + 1).padStart(4, '0')}`,
      gender: genderOf(response),
      response,
      warnings,
    };
  });
}
