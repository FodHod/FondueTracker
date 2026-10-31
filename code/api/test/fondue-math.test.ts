import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fondueInfo } from '../src/fondue-math'
import { FOOD_CATALOG } from '../src/catalog'

// The faked "now" every dip start is set against.
const NOW = new Date('2026-01-01T12:00:00Z')
const SEC = 1000

/** A dip that started `secondsAgo` seconds before the faked now. */
function started(secondsAgo: number): Date {
    return new Date(NOW.getTime() - secondsAgo * SEC)
}

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
})

afterEach(() => {
    vi.useRealTimers()
})

describe('fondueInfo progress (beef rare: 10-20 s)', () => {
    it('ramps linearly to 1.0 at the earliest estimated take-out', () => {
        expect(fondueInfo('beef', 'rare', 90, started(0)).progress).toBe(0)
        expect(fondueInfo('beef', 'rare', 90, started(2.5)).progress).toBe(0.25)
        expect(fondueInfo('beef', 'rare', 90, started(5)).progress).toBe(0.5)
        expect(fondueInfo('beef', 'rare', 90, started(10)).progress).toBe(1)
    })

    it('holds 1.0 through the rest of the estimated window', () => {
        expect(fondueInfo('beef', 'rare', 90, started(15)).progress).toBe(1)
        expect(fondueInfo('beef', 'rare', 90, started(20)).progress).toBe(1)
    })

    it('flips to 2 once the latest estimate is exceeded', () => {
        expect(fondueInfo('beef', 'rare', 90, started(20.001)).progress).toBe(2)
        expect(fondueInfo('beef', 'rare', 90, started(60)).progress).toBe(2)
    })

    it('treats a future dip start as not started', () => {
        expect(fondueInfo('beef', 'rare', 90, started(-5)).progress).toBe(0)
    })

    it('judges a finished dip as of its end time, not now', () => {
        const start = started(15)
        const asOf = new Date(start.getTime() + 3 * SEC)
        expect(fondueInfo('beef', 'rare', 90, start, asOf).progress).toBe(0.3)
    })

    it('scales with the estimate (chicken fully-cooked: 90-120 s)', () => {
        expect(fondueInfo('chicken', 'fully-cooked', 90, started(30)).progress).toBeCloseTo(1 / 3, 6)
        expect(fondueInfo('chicken', 'fully-cooked', 90, started(90)).progress).toBe(1)
        expect(fondueInfo('chicken', 'fully-cooked', 90, started(120)).progress).toBe(1)
        expect(fondueInfo('chicken', 'fully-cooked', 90, started(121)).progress).toBe(2)
    })

    it('still reports the unchanged reference payload', () => {
        const info = fondueInfo('beef', 'rare', 90, started(5))
        expect(info.meat).toBe('beef')
        expect(info.doneness).toBe('rare')
        expect(info.culinary_core_temp_C).toBe(52)
        expect(info.safety_core_temp_C).toBe(62.8)
        expect(info.safety_rest_seconds).toBe(180)
        expect(info.broth_temp_C).toBe(90)
        expect(info.reference_time_seconds).toEqual([10, 20])
        expect(info.estimated_dipping_time_seconds).toEqual([10, 20])
    })

    it('still rejects unknown meats and doneness ids', () => {
        expect(() => fondueInfo('stone', 'rare', 90, started(5))).toThrow(/unknown meat/i)
        expect(() => fondueInfo('beef', 'well', 90, started(5))).toThrow(/invalid doneness/i)
    })
})

describe('catalog alignment with the doneness tables', () => {
    it('computes progress for every food and doneness id the catalog offers', () => {
        for (const food of FOOD_CATALOG) {
            for (const pref of food.prefs) {
                const info = fondueInfo(food.foodId, pref.id, 90, started(5))
                expect(info.progress).toBeGreaterThanOrEqual(0)
                expect(info.progress).toBeLessThanOrEqual(1)
            }
        }
    })
})
