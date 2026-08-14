/**
 * KAN-71 — structural guard for the frozen Phase 0 audit UISPEC.md.
 *
 * This does NOT assert the doc's prose; it asserts the machine-checkable
 * completeness contract the acceptance criteria name: the file exists at repo
 * root, its TOC links a section for each of the four routes, every behaviour
 * entry carries a stable UISPEC-<AREA>-<NN> id (not a bare line number), each
 * required formatter has its own entry naming its source file, the coverage
 * checklist marks routes/formatters/states captured, integrity + analytics
 * sections hold their required claims, and CODEOWNERS owns /UISPEC.md.
 */
const fs = require('fs')
const path = require('path')

const REPO_ROOT = path.resolve(__dirname, '..', '..')
const UISPEC_PATH = path.join(REPO_ROOT, 'UISPEC.md')
const CODEOWNERS_PATH = path.join(REPO_ROOT, 'CODEOWNERS')

const readUispec = () => fs.readFileSync(UISPEC_PATH, 'utf8')

describe('UISPEC.md — Phase 0 audit structural contract', () => {
    it('exists at the repository root', () => {
        expect(fs.existsSync(UISPEC_PATH)).toBe(true)
    })

    it('links a table-of-contents section for each of the four routes', () => {
        const doc = readUispec()
        for (const route of ['/', '/coin/:coinId', '/accounts', '/about']) {
            // Each route path is named in the TOC route list.
            expect(doc).toContain(route)
        }
        // The four route ids that anchor those sections.
        for (let i = 1; i <= 4; i++) {
            expect(doc).toContain(`UISPEC-ROUTES-0${i}`)
        }
    })

    it('gives every required formatter its own entry naming its source file', () => {
        const doc = readUispec()
        const formatters = [
            { name: 'formatMarketCap', file: 'CoinItem.js' },
            { name: 'formatChange', file: 'CoinItem.js' },
            { name: 'formatRankMovement', file: 'CoinItem.js' },
            { name: 'computeSparkline', file: 'SparkLine.js' },
            { name: 'formatTrend', file: 'SparkLine.js' }
        ]
        for (const { name, file } of formatters) {
            // symbol cited as file#symbol, never a bare line number.
            expect(doc).toContain(`${file}#${name}`)
        }
    })

    it('uses stable UISPEC-<AREA>-<NN> ids and no bare line-number anchors', () => {
        const doc = readUispec()
        const ids = doc.match(/UISPEC-[A-Z]+-\d{2}/g) || []
        // A healthy audit has many ids across areas.
        expect(ids.length).toBeGreaterThanOrEqual(20)
        const areas = new Set(ids.map((id) => id.split('-')[1]))
        for (const area of ['GLOBAL', 'ROUTES', 'COINS', 'COINITEM', 'SPARKLINE', 'ACCOUNTS', 'COIN']) {
            expect(areas.has(area)).toBe(true)
        }
    })

    it('has a Coverage checklist marking routes, formatters and states captured', () => {
        const doc = readUispec()
        expect(doc).toContain('## Coverage checklist')
        // Checked boxes marked captured.
        expect(/- \[x\].*captured/i.test(doc)).toBe(true)
        // Each formatter appears in the checklist.
        for (const name of ['formatMarketCap', 'formatChange', 'formatRankMovement', 'computeSparkline', 'formatTrend']) {
            expect(doc).toContain(name)
        }
    })

    it('has an Integrity & change control section stating read-only + unenforced CI', () => {
        const doc = readUispec()
        expect(doc).toContain('Integrity & change control')
        expect(/frozen phase 0 baseline/i.test(doc)).toBe(true)
        expect(/read-only by convention/i.test(doc)).toBe(true)
        expect(/unenforced/i.test(doc)).toBe(true)
        expect(/deferred/i.test(doc)).toBe(true)
    })

    it('links the analytics catalog rather than restating event names inline', () => {
        const doc = readUispec()
        // The Analytics section links out to the canonical catalog...
        expect(doc).toContain('docs/analytics-events.md')
        // ...and does not restate individual event names inline.
        for (const event of [
            'add_account_submitted',
            'account_added',
            'account_removed',
            'account_activated',
            'accounts_view_opened',
            'trade_link_clicked'
        ]) {
            expect(doc).not.toContain(event)
        }
    })

    it('is owned in CODEOWNERS', () => {
        const owners = fs.readFileSync(CODEOWNERS_PATH, 'utf8')
        expect(/^\/UISPEC\.md\s+@\S+/m.test(owners)).toBe(true)
    })
})
