import { describe, expect, it } from 'vitest';
import { embedPath, embedSnippet } from './EmbedBuilder';

describe('embed snippet', () => {
  it('names only the options that differ from the defaults', () => {
    expect(embedPath('dijkstra', 'auto', false)).toBe('/embed/dijkstra');
    expect(embedPath('dijkstra', 'dark', true)).toBe('/embed/dijkstra?theme=dark&mode=predict');
  });

  it('is a titled, lazy iframe pointing at the site', () => {
    const html = embedSnippet('https://algorender.dev', { slug: 'heap', name: 'Heap', type: 'data-structure' }, 'light', false, 560);
    expect(html).toBe(
      '<iframe src="https://algorender.dev/embed/heap?theme=light" title="Heap, an interactive visualiser from Algorender" width="100%" height="560" style="border:0;border-radius:16px" loading="lazy"></iframe>',
    );
  });
});
