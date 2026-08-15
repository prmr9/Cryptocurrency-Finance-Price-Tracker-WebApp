/**
 * KAN-72 — structural guard for the four Phase 0 contract sections defined in
 * UISPEC.md: Data contract (C3), State inventory (C4), Design debt count (C6),
 * and Risk list (C7).
 *
 * This does NOT assert the doc's prose; it asserts the machine-checkable
 * contract KAN-72 names: each of the four sections is defined, linked from the
 * table of contents, and carries its load-bearing claims. It pairs the four
 * contract definitions in UISPEC.md with a test so "the contracts are defined"
 * is a checkable gate rather than a silent assumption.
 */
const fs = require('fs')
const path = require('path')

const REPO_ROOT = path.resolve(__dirname, '..', '..')
const UISPEC_PATH = path.join(REPO_ROOT, 'UISPEC.md')

const readUispec = () => fs.readFileSync(UISPEC_PATH, 'utf8')

describe('UISPEC.md — KAN-72 Phase 0 contract sections', () => {
    it('links all four contract sections from the table of contents with their C-ids', () => {
        const doc = readUispec()
        expect(doc).toContain('[Data contract](#data-contract) — per-screen API-call catalogue (C3)')
        expect(doc).toContain('[State inventory](#state-inventory) — every store, slice & `useState` (C4)')
        expect(doc).toContain('[Design debt count](#design-debt-count) — distinct in-use design-token values (C6)')
        expect(doc).toContain('[Risk list](#risk-list) — the ten riskiest places to touch the UI (C7)')
    })

    it('defines a heading for each of the four contract sections', () => {
        const doc = readUispec()
        for (const heading of ['## Data contract', '## State inventory', '## Design debt count', '## Risk list']) {
            expect(doc).toContain(heading)
        }
    })

    it('carries the four-contracts index tying C3/C4/C6/C7 together', () => {
        const doc = readUispec()
        expect(doc).toContain('C3 Data contract, C4 State inventory, C6 Design debt count, C7 Risk list.')
    })

    it('C3 Data contract catalogues every screen and flags in-component calls', () => {
        const doc = readUispec()
        // The catalogue names all four route screens...
        for (const screen of [
            '**Screen `/` — market list (Coins)**',
            '**Screen `/accounts` — watchlist (Accounts)**',
            '**Screen `/about` — about page (About)**',
            '**Screen `/coin/:coinId` — coin detail (Coin)**'
        ]) {
            expect(doc).toContain(screen)
        }
        // ...flags whether each call is made inside a component...
        expect(doc).toContain('**Made inside a component?**')
        // ...and records the present-but-unwired backend client layer.
        expect(doc).toContain('**Present-but-unwired backend client layer (called by NO screen)**')
    })

    it('C4 State inventory splits service-module stores from component useState', () => {
        const doc = readUispec()
        expect(doc).toContain('**Stateful service modules ("stores")**')
        expect(doc).toContain('**Component `useState` (and `useRef`)**')
        // Names the two stateful service modules...
        expect(doc).toContain('src/services/accountStore.js')
        expect(doc).toContain('server/src/db/pool.js#getPool')
        // ...and the App-level component state driving the market list.
        expect(doc).toContain('`coins`')
        expect(doc).toContain('`lastUpdated`')
    })

    it('C6 Design debt count reports distinct in-use values across the six token categories', () => {
        const doc = readUispec()
        expect(doc).toContain('Count of **distinct in-use values**')
        for (const category of ['**Spacing**', '**Font size**', '**Font weight**', '**Colour**', '**Radius**', '**Shadow**']) {
            expect(doc).toContain(category)
        }
    })

    it('C7 Risk list enumerates exactly ten risky places to touch the UI', () => {
        const doc = readUispec()
        expect(doc).toContain('The **ten** places')
        // The numbered list runs 1 through 10.
        expect(/^1\. /m.test(doc)).toBe(true)
        expect(/^10\. /m.test(doc)).toBe(true)
        // ...and stops there — no eleventh item.
        expect(/^11\. /m.test(doc)).toBe(false)
    })
})
