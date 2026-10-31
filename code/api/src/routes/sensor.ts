import { Router } from 'express'
import type { SensorStore } from '../store'
import type { SensorMeasurement, ForkState } from '../types'

/** Parses a sensor measurement; null when the payload has the wrong shape. */
function parseMeasurement(body: unknown): SensorMeasurement | null {
    if (typeof body !== 'object' || body === null) {
        return null
    }
    const { time, temperature, tags } = body as Record<string, unknown>
    if (typeof time !== 'number' || !Number.isFinite(time)) {
        return null
    }
    if (typeof temperature !== 'number' || !Number.isFinite(temperature)) {
        return null
    }
    if (!Array.isArray(tags)) {
        return null
    }
    const parsedTags: ForkState[] = []
    for (const tag of tags) {
        if (typeof tag !== 'object' || tag === null) {
            return null
        }
        const { id, in_pot } = tag as Record<string, unknown>
        if (typeof id !== 'number' || !Number.isInteger(id)) {
            return null
        }
        if (typeof in_pot !== 'boolean') {
            return null
        }
        parsedTags.push({ id, in_pot })
    }
    return { time, temperature, tags: parsedTags }
}

/**
 * The device endpoint: the pot sensor reports the temperature and which
 * fork tags are currently in the pot. Measurements are appended to the
 * in-memory log of the dinner named in the path.
 */
export function createSensorRouter(store: SensorStore): Router {
    const router = Router()

    router.post('/:dinnerId', (req, res) => {
        const measurement = parseMeasurement(req.body)
        if (!measurement) {
            res.status(400).json({
                error: 'measurement must have numeric time and temperature and a tags array of { id, in_pot }',
            })
            return
        }
        store.append(req.params.dinnerId, measurement)
        res.status(201).json(measurement)
    })

    return router
}
