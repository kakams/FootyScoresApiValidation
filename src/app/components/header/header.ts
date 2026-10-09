import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FileDownload } from '../../common/services/file-download';
import { errorMessage } from '../../common/services/match-loader';
import { MatchesStore } from '../../common/services/matches-store';
import { EXPORT_FILENAME, toExportJson } from './match-export';
import { ImportError, parseImportedJson } from './match-import';

/** App title and the data actions: load from feeds, import a JSON file, export all matches. */
@Component({
  selector: 'app-header',
  templateUrl: './header.html',
  styleUrl: './header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Header {
  protected readonly store = inject(MatchesStore);
  private readonly download = inject(FileDownload);

  protected readonly busy = computed(() => this.store.phase() === 'loading');
  protected readonly exportBlocked = computed(() => this.store.failures().length > 0);

  protected load(): void {
    this.store.load();
  }

  protected async import(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      this.store.showImported(parseImportedJson(await file.text()), file.name);
    } catch (e) {
      this.store.showImportError(file.name, errorMessage(e), e instanceof ImportError ? e.issues : undefined);
    }
  }

  protected exportAll(): void {
    if (this.store.canExport()) this.download.json(toExportJson(this.store.matches()), EXPORT_FILENAME);
  }
}
