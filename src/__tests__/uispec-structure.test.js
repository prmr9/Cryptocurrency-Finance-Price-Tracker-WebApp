/**
 * Structure guard for KAN-72: the four Phase 0 UISPEC sections must be defined.
 *
 * KAN-72 adds the risk-first spine of the UISPEC audit — C3 Data contract,
 * C4 State inventory, C6 Design debt count, C7 Risk list. Each must exist as a
 * real section (a `## ` heading), be reachable by its GitHub-slug anchor, be
 * linked from the table of contents, and carry its C-code label. Self-review
 * treats a section as "not defined" unless a test pins it, so this guard is the
 * proof the acceptance criteria stay met.
 *
 * These assertions are document-level on purpose: the contract is the shape of
 * UISPEC.md itself, not the behaviour of any component.
 */
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const UISPEC = path.join(REPO_ROOT, 'UISPEC.md');

/** GitHub's heading-to-anchor slug: lowercase, drop punctuation, spaces to hyphens. */
function slugify(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\w\- ]/g, '')
    .replace(/ /g, '-');
}

const SECTIONS = [
  { code: 'C3', heading: 'Data contract', anchor: 'data-contract' },
  { code: 'C4', heading: 'State inventory', anchor: 'state-inventory' },
  { code: 'C6', heading: 'Design debt count', anchor: 'design-debt-count' },
  { code: 'C7', heading: 'Risk list', anchor: 'risk-list' },
];

describe('UISPEC.md Phase 0 sections (KAN-72)', () => {
  const uispec = fs.readFileSync(UISPEC, 'utf8');

  it('UISPEC.md exists and is non-empty', () => {
    expect(uispec.length).toBeGreaterThan(0);
  });

  SECTIONS.forEach(({ code, heading, anchor }) => {
    describe(`${code} — ${heading}`, () => {
      it('is defined as a `## ` section heading', () => {
        expect(uispec).toContain(`## ${heading}`);
      });

      it('uses a heading whose GitHub anchor matches the cited link', () => {
        expect(slugify(heading)).toBe(anchor);
      });

      it('is linked from the table of contents by its anchor', () => {
        expect(uispec).toContain(`(#${anchor})`);
      });

      it('carries its C-code label in the table of contents', () => {
        expect(uispec).toContain(`(${code})`);
      });
    });
  });

  it('names all four sections in the contracts index line', () => {
    expect(uispec).toContain(
      'C3 Data contract, C4 State inventory, C6 Design debt count, C7 Risk list'
    );
  });
});
