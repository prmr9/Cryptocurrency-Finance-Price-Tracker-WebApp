/**
 * KAN-5: address-derived properties are stripped inside track(), at the emit
 * boundary, so a call site cannot leak one by forgetting to leave it out.
 */
import {
    track,
    configureAnalytics,
    getTrackedEventsForTest,
    resetAnalyticsForTest
} from '../analytics'

beforeEach(() => {
    window.localStorage.clear()
    resetAnalyticsForTest()
})

describe('track() address-derived property sanitization', () => {
    test('drops address_length before the event reaches the sink', () => {
        const event = track('add_account_submitted', {
            label_provided: true,
            address_format: 'evm_hex_42',
            address_length: 42,
            existing_account_count: 0
        })

        expect(event.properties).not.toHaveProperty('address_length')
        expect(JSON.stringify(getTrackedEventsForTest())).not.toMatch(/address_length/)
    })

    test('keeps the shape enum and the rest of the payload intact', () => {
        const event = track('add_account_submitted', {
            label_provided: false,
            address_format: 'too_short',
            address_length: 12,
            existing_account_count: 3
        })

        expect(event.properties).toEqual({
            label_provided: false,
            address_format: 'too_short',
            existing_account_count: 3
        })
    })

    test("leaves the caller's own object untouched", () => {
        const props = { address_length: 42, existing_account_count: 0 }

        track('add_account_submitted', props)

        expect(props.address_length).toBe(42)
    })

    test('strips the property before a configured custom sink sees it', () => {
        const seen = []
        configureAnalytics({ sink: (event) => seen.push(event) })

        track('add_account_submitted', { address_length: 42 })

        expect(seen).toHaveLength(1)
        expect(seen[0].properties).not.toHaveProperty('address_length')
    })

    test('is a no-op for payloads that never carried the property', () => {
        const event = track('accounts_view_opened', { existing_account_count: 0 })

        expect(event.properties).toEqual({ existing_account_count: 0 })
    })
})
