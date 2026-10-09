import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { CopyButton } from '../../common/components/copy-button/copy-button';
import { JsonViewer } from '../../common/components/json-viewer/json-viewer';
import type { ParsedMatch } from '../../common/models/parsed-match.model';
import { FileDownload, toPrettyJson } from '../../common/services/file-download';
import { MatchesStore } from '../../common/services/matches-store';
import { SourceRequests } from './source-requests/source-requests';

export type DetailsTab = 'response' | 'schedule' | 'result';

interface TabDefinition {
  id: DetailsTab;
  label: string;
  /**
   * Raw feed data is not part of an exported file, so source tabs are missing for imported matches;
   * a match built from a single tested URL has no schedule entry.
   */
  available: (m: ParsedMatch) => boolean;
}

const TABS: TabDefinition[] = [
  { id: 'response', label: 'Parsed response', available: () => true },
  { id: 'schedule', label: 'Source: schedule', available: (m) => !!m.source?.schedule },
  { id: 'result', label: 'Source: match data', available: (m) => !!m.source?.result },
];

/** Details of the selected match: parsed response and the raw data it was built from. */
@Component({
  selector: 'app-match-details',
  imports: [JsonViewer, CopyButton, SourceRequests],
  templateUrl: './match-details.html',
  styleUrl: './match-details.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-label': 'Match details' },
})
export class MatchDetails {
  private readonly store = inject(MatchesStore);
  private readonly download = inject(FileDownload);

  private readonly requestedTab = signal<DetailsTab>('response');

  readonly match = input.required<ParsedMatch>();

  protected readonly tabs = computed(() => TABS.filter((t) => t.available(this.match())));
  protected readonly tab = computed<DetailsTab>(() =>
    this.tabs().some((t) => t.id === this.requestedTab()) ? this.requestedTab() : 'response',
  );
  protected readonly subtitle = computed(() => {
    const { competition: c, venue: v } = this.match().response;
    const venue = [v?.name, v?.city].filter(Boolean).join(', ');
    return [c?.name, c?.round, venue].filter(Boolean).join(' · ');
  });
  protected readonly content = computed(() => {
    const m = this.match();
    if (this.tab() === 'schedule') return m.source?.schedule;
    if (this.tab() === 'result') return m.source?.result;
    return m.response;
  });

  protected selectTab(tab: DetailsTab): void {
    this.requestedTab.set(tab);
  }

  protected close(): void {
    this.store.toggleSelection();
  }

  /** Serialized lazily — the raw match feed is large. */
  protected readonly contentText = (): string => JSON.stringify(this.content(), null, 2);

  protected downloadResponse(): void {
    this.download.json(toPrettyJson(this.match().response), fileNameFor(this.match()));
  }
}

function fileNameFor(m: ParsedMatch): string {
  if (m.source) return `${m.code.replace(/-+/g, '-').replace(/-$/, '')}.json`;
  const r = m.response;
  return `${`${r.kickoff?.slice(0, 10)}-${r.teams?.home}-${r.teams?.away}`.replace(/[^\w-]+/g, '-')}.json`;
}
