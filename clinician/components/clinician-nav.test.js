// @vitest-environment happy-dom
import '../../tests/setup-dom.js';
import { describe, it, expect } from 'vitest';
import { fixture, html as testHtml } from '@open-wc/testing';
import './clinician-nav.js';

async function makeEl({ page, subtitle } = {}) {
  const el = await fixture(testHtml`<clinician-nav></clinician-nav>`);
  if (page) el.page = page;
  if (subtitle) el.subtitle = subtitle;
  await el.updateComplete;
  return el;
}

describe('clinician-nav', () => {
  it('renders the brand and a link per clinician surface', async () => {
    const el = await makeEl();
    expect(el.shadowRoot.querySelector('.brand').textContent).toBe('מדד');
    const links = [...el.shadowRoot.querySelectorAll('nav .link')];
    expect(links.map((a) => a.textContent.trim())).toEqual(['מחולל קישורים', 'סיכום מטופל']);
    // Relative one-level-up hrefs work under any deploy base path.
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['../composer/', '../aggregate/']);
    expect(el.shadowRoot.querySelector('.brand').getAttribute('href')).toBe('../landing/');
  });

  it('marks only the current page with aria-current', async () => {
    const el = await makeEl({ page: 'aggregate' });
    const current = el.shadowRoot.querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0].textContent.trim()).toBe('סיכום מטופל');
  });

  it('marks no link when page is unknown or unset', async () => {
    const unset = await makeEl();
    expect(unset.shadowRoot.querySelector('[aria-current]')).toBeNull();
    const unknown = await makeEl({ page: 'help' });
    expect(unknown.shadowRoot.querySelector('[aria-current]')).toBeNull();
  });

  it('renders the subtitle only when provided', async () => {
    const withSub = await makeEl({ subtitle: 'הקבצים נטענים בדפדפן שלך בלבד.' });
    expect(withSub.shadowRoot.querySelector('.subtitle').textContent).toContain('בדפדפן שלך');
    const without = await makeEl();
    expect(without.shadowRoot.querySelector('.subtitle')).toBeNull();
  });
});
