import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { tokenizeJson } from './json-tokens';

/** Read-only, syntax-highlighted JSON preview. */
@Component({
  selector: 'app-json-viewer',
  templateUrl: './json-viewer.html',
  styleUrl: './json-viewer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JsonViewer {
  readonly value = input.required<unknown>();

  protected readonly tokens = computed(() => tokenizeJson(this.value()));
}
