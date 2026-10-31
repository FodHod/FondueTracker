import { describe, expect, it } from 'vitest'
import { createSensorStore } from '../src/store'
import type { SensorMeasurement } from '../src/types'

const EXAMPLE: SensorMeasurement = {
    time: 1793443169.0806723,
    temperature: 27,
    tags: [
        { id: 7, in_pot: true },
        { id: 4, in_pot: true },
        { id: 3, in_pot: true },
        { id: 2, in_pot: true },
        { id: 1, in_pot: true },
        { id: 5, in_pot: true },
        { id: 6, in_pot: true },
        { id: 8, in_pot: true },
    ],
}

describe('sensor store', () => {
    it('appends measurements per dinner in order', () => {
        const store = createSensorStore()
        store.append('default', { ...EXAMPLE, time: 1 })
        store.append('default', { ...EXAMPLE, time: 2 })
        expect(store.list('default').map((m) => m.time)).toEqual([1, 2])
    })

    it('keeps dinners isolated and returns nothing for unknown ones', () => {
        const store = createSensorStore()
        store.append('default', EXAMPLE)
        store.append('other', { ...EXAMPLE, time: 99 })
        expect(store.list('default')).toEqual([EXAMPLE])
        expect(store.list('other').map((m) => m.time)).toEqual([99])
        expect(store.list('missing')).toEqual([])
    })

    it('owns its data: appending and listing work on copies', () => {
        const store = createSensorStore()
        const m: SensorMeasurement = { ...EXAMPLE, tags: [{ id: 1, in_pot: true }] }
        store.append('default', m)
        m.tags[0].in_pot = false
        expect(store.list('default')[0].tags[0].in_pot).toBe(true)

        const first = store.list('default')[0]
        first.tags[0].in_pot = false
        expect(store.list('default')[0].tags[0].in_pot).toBe(true)
    })
})
