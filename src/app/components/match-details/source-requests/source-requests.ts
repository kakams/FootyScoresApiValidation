import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { resultUrl, scheduleUrl } from '../../../common/api/olympics.api';
import { CopyButton } from '../../../common/components/copy-button/copy-button';
import type { ParsedMatch } from '../../../common/models/parsed-match.model';

interface SourceRequest {
  label: string;
  description: string;
  url: string;
  curl: string;
}

/**
 * The data server answers 403 to some non-browser clients (e.g. default curl or python-requests user agents),
 * so the copied command sends a browser-like User-Agent.
 */
export const toCurl = (url: string): string =>
  `curl -A 'Mozilla/5.0' -H 'Accept: application/json' '${url}'`;

const request = (label: string, description: string, url: string): SourceRequest => ({
  label,
  description,
  url,
  curl: toCurl(url),
});

/** The GET requests whose responses were used to build the selected match — ready to copy or open. */
@Component({
  selector: 'app-source-requests',
  imports: [CopyButton],
  templateUrl: './source-requests.html',
  styleUrl: './source-requests.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SourceRequests {
  /** Match built from feed data (`match.source` is set). */
  readonly match = input.required<ParsedMatch>();

  /** Only the requests whose responses were actually used to build the match. */
  protected readonly requests = computed<SourceRequest[]>(() => {
    const source = this.match().source;
    const requests: SourceRequest[] = [];
    if (source?.result) {
      const url = source.requestUrl ?? resultUrl(this.match().code);
      requests.push(request('Match data', 'score, half-time, status, scorers, lineups', url));
    }
    if (source?.schedule) {
      const url = source.scheduleUrl ?? scheduleUrl();
      requests.push(request('Schedule', 'match list, kickoff, venue — shared by all listed matches', url));
    }
    return requests;
  });
}
