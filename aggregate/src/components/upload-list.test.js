// @vitest-environment happy-dom
import '../../../tests/setup-dom.js';
import { describe, it, expect } from 'vitest';
import { fixture, html as testHtml } from '@open-wc/testing';
import './upload-list.js';

async function makeEl(files = []) {
  const el = await fixture(testHtml`<upload-list></upload-list>`);
  el.files = files;
  await el.updateComplete;
  return el;
}

describe('upload-list', () => {
  it('collapses successes into a one-line summary (plural and singular)', async () => {
    const many = await makeEl([
      { name: 'a.pdf', status: 'ok' },
      { name: 'b.pdf', status: 'ok' },
      { name: 'c.pdf', status: 'ok' },
    ]);
    const summary = many.shadowRoot.querySelector('details.ok-summary summary');
    expect(summary.textContent).toContain('נקלטו 3 דוחות');
    expect(many.shadowRoot.querySelector('details.ok-summary').open).toBe(false);

    const one = await makeEl([{ name: 'a.pdf', status: 'ok' }]);
    expect(one.shadowRoot.querySelector('summary').textContent).toContain('דוח אחד נקלט');
  });

  it('expanding the summary reveals the individual file rows', async () => {
    const el = await makeEl([{ name: 'a.pdf', status: 'ok' }, { name: 'b.pdf', status: 'ok' }]);
    const details = el.shadowRoot.querySelector('details.ok-summary');
    details.open = true;
    const rows = details.querySelectorAll('li.ok');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('a.pdf');
  });

  it('failures always render as individual rows with their reason', async () => {
    const el = await makeEl([
      { name: 'a.pdf', status: 'ok' },
      { name: 'notes.txt', status: 'not-pdf' },
      { name: 'other.pdf', status: 'no-attachment', detail: 'x' },
    ]);
    const failed = el.shadowRoot.querySelectorAll('li.failed');
    expect(failed).toHaveLength(2);
    expect(failed[0].textContent).toContain('לא קובץ PDF');
    expect(failed[1].textContent).toContain('לא דוח מדד');
    // Failures live outside the collapsed details.
    expect(el.shadowRoot.querySelector('details li.failed')).toBeNull();
  });

  it('renders neither summary nor rows when empty', async () => {
    const el = await makeEl([]);
    expect(el.shadowRoot.querySelector('details.ok-summary')).toBeNull();
    expect(el.shadowRoot.querySelector('li')).toBeNull();
  });

  it('emits files-selected with non-empty files from the input', async () => {
    const el = await makeEl();
    const events = [];
    el.addEventListener('files-selected', (e) => events.push(e.detail.files));

    const input = el.shadowRoot.querySelector('input[type="file"]');
    Object.defineProperty(input, 'files', {
      value: [{ name: 'a.pdf', size: 10 }, { name: 'empty.pdf', size: 0 }],
      configurable: true,
    });
    input.dispatchEvent(new Event('change'));

    expect(events).toHaveLength(1);
    expect(events[0].map(f => f.name)).toEqual(['a.pdf']);
  });
});
