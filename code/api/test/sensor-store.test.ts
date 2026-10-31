import { describe, expect, it } from 'vitest'
import { createSensorStore } from '../src/store'
import type { SensorMeasurement } from '../src/types'

/** One pot report: time in ms, broth at 90 °C, and the given tag states. */
function report(timeMs: number, tags: { id: number; in_pot: boolean }[]): SensorMeasurement {
    return { time: timeMs, temperature: 90, tags }
}

describe('sensor store (materialized dip state)', () => {
    it('treats a tag first seen in the pot as inserted at that report', () => {
        const store = createSensorStore()
        store.append('default', report(1000, [{ id: 1, in_pot: true }]))
        expect(store.getDipState('fork-1', 'default')).toEqual({
            inPot: true,
            insertedAt: 1000,
            removedAt: null,
            tempAtInsertC: 90,
        })
    })

    it('treats a tag first seen out of the pot as not dipped', () => {
        const store = createSensorStore()
        store.append('default', report(1000, [{ id: 1, in_pot: false }]))
        expect(store.getDipState('fork-1', 'default')).toEqual({
            inPot: false,
            insertedAt: null,
            removedAt: null,
            tempAtInsertC: null,
        })
    })

    it('stamps insertion and removal as the status flips', () => {
        const store = createSensorStore()
        store.append('default', report(1000, [{ id: 1, in_pot: false }]))
        store.append('default', report(2000, [{ id: 1, in_pot: true }]))
        store.append('default', report(3000, [{ id: 1, in_pot: false }]))
        expect(store.getDipState('fork-1', 'default')).toEqual({
            inPot: false,
            insertedAt: 2000,
            removedAt: 3000,
            tempAtInsertC: 90,
        })
    })

    it('starts a fresh dip on re-insertion, clearing the old removal', () => {
        const store = createSensorStore()
        store.append('default', report(1000, [{ id: 1, in_pot: true }]))
        store.append('default', report(2000, [{ id: 1, in_pot: false }]))
        store.append('default', report(3000, [{ id: 1, in_pot: true }]))
        expect(store.getDipState('fork-1', 'default')).toEqual({
            inPot: true,
            insertedAt: 3000,
            removedAt: null,
            tempAtInsertC: 90,
        })
    })

    it('reads a tag absent from a report as out of the pot', () => {
        const store = createSensorStore()
        store.append('default', report(1000, [{ id: 1, in_pot: true }]))
        store.append('default', report(2000, []))
        expect(store.getDipState('fork-1', 'default')).toEqual({
            inPot: false,
            insertedAt: 1000,
            removedAt: 2000,
            tempAtInsertC: 90,
        })
    })

    it('keeps dinners isolated and returns null for unknown ones', () => {
        const store = createSensorStore()
        store.append('default', report(1000, [{ id: 1, in_pot: true }]))
        store.append('other', report(5000, [{ id: 1, in_pot: false }]))
        expect(store.getDipState('fork-1', 'default')?.insertedAt).toBe(1000)
        expect(store.getDipState('fork-1', 'other')).toEqual({
            inPot: false,
            insertedAt: null,
            removedAt: null,
            tempAtInsertC: null,
        })
        expect(store.getDipState('fork-1', 'missing')).toBeNull()
        expect(store.getDipState('fork-2', 'default')).toBeNull()
    })

    it('owns its data: reads return copies', () => {
        const store = createSensorStore()
        store.append('default', report(1000, [{ id: 1, in_pot: true }]))
        const dip = store.getDipState('fork-1', 'default')
        dip!.inPot = false
        dip!.insertedAt = 42
        expect(store.getDipState('fork-1', 'default')).toEqual({
            inPot: true,
            insertedAt: 1000,
            removedAt: null,
            tempAtInsertC: 90,
        })
    })
})
