import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, signal } from '@angular/core';

const FEEDBACK_MS = 1500;

/** Small button that copies text to the clipboard and briefly confirms the result. */
@Component({
  selector: 'app-copy-button',
  templateUrl: './copy-button.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CopyButton {
  /** Text to copy — evaluated on click, so large content is serialized only when needed. */
  readonly text = input.required<string | (() => string)>();
  readonly label = input('Copy');
  readonly ariaLabel = input<string>();

  protected readonly feedback = signal<string | undefined>(undefined);
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected async copy(): Promise<void> {
    const value = this.text();
    try {
      await navigator.clipboard.writeText(typeof value === 'function' ? value() : value);
      this.feedback.set('Copied ✓');
    } catch {
      this.feedback.set('Copy failed');
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.feedback.set(undefined), FEEDBACK_MS);
  }
}
