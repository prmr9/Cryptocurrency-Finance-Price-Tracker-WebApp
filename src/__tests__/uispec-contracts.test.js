/**
 * KAN-72 — completeness guard for the four Phase 0 contracts in UISPEC.md.
 *
 * The ticket requires UISPEC.md to define all four contracts — C3 (data
 * contract), C4 (state inventory), C6 (design debt count) and C7 (risk list) —
 * each as its own section, linked from the table of contents with its (Cn)
 * label and reachable by a matching auto-anchor. This asserts that
 * machine-checkable completeness so a regression that drops C6 or C7 (or their
 * TOC entries) fails loudly rather than silently shrinking the audit.
 */
const fs = require('fs')
const path = require('path')

const UISPEC_PATH = path.join(path.resolve(__dirname, '..', '..'), 'UISPEC.md')
const readUispec = () => fs.readFileSync(UISPEC_PATH, 'utf8')

const CONTRACTS = [
    { id: 'C3', heading: '## Data contract', anchor: '#data-contract' },
    { id: 'C4', heading: '## State inventory', anchor: '#state-inventory' },
    { id: 'C6', heading: '## Design debt count', anchor: '#design-debt-count' },
    { id: 'C7', heading: '## Risk list', anchor: '#risk-list' }
]

// GitHub-style auto-anchor for a markdown heading.
const slugOf = (heading) =>
    '#' +
    heading
        .replace(/^#+\s*/, '')
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, '')
        .trim()
        .replace(/\s+/g, '-')

describe('UISPEC.md — KAN-72 four-contract completeness', () => {
    it('defines a section heading for each of the four contracts', () => {
        const doc = readUispec()
        for (const { heading } of CONTRACTS) {
            expect(doc).toContain(`\n${heading}\n`)
        }
    })

    it('links every contract from the table of contents with its (Cn) label', () => {
        const doc = readUispec()
        const start = doc.indexOf('## Table of contents')
        const end = doc.indexOf('## How to cite')
        expect(start).toBeGreaterThanOrEqual(0)
        expect(end).toBeGreaterThan(start)
        const toc = doc.slice(start, end)
        for (const { id, anchor } of CONTRACTS) {
            expect(toc).toContain(anchor)
            expect(toc).toContain(`(${id})`)
        }
    })

    it('gives each TOC anchor a matching section auto-anchor', () => {
        const doc = readUispec()
        for (const { heading, anchor } of CONTRACTS) {
            expect(slugOf(heading)).toBe(anchor)
            expect(doc).toContain(heading)
        }
    })

    it('surfaces all four contract ids together up front (preview visibility)', () => {
        const doc = readUispec()
        const region = doc.slice(doc.indexOf('## Data contract'))
        // The contracts index directly under the first contract heading names
        // every contract, so a truncated preview of the section shows C6/C7 too.
        for (const { id } of CONTRACTS) {
            expect(region.indexOf(id)).toBeGreaterThanOrEqual(0)
            expect(region.indexOf(id)).toBeLessThan(region.indexOf('Per-screen catalogue'))
        }
    })
})
