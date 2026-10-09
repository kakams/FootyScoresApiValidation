import { DOCUMENT, inject, Injectable } from '@angular/core';

/** Saves text content as a .json file through a temporary download link. */
@Injectable({ providedIn: 'root' })
export class FileDownload {
  private readonly document = inject(DOCUMENT);

  json(content: string, fileName: string): void {
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    const link = this.document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export const toPrettyJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
