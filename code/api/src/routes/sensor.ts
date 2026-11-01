import { Router } from 'express'
import { timingSafeEqual } from 'node:crypto'
import type {ForkStore, SensorStore} from '../store'
import type { SensorMeasurement, ForkState } from '../types'
import {findFood} from "../catalog";
import {logger} from "../logger";

const BEARER_PREFIX = 'Bearer '

/** True when the presented bearer token matches the expected one. */
function tokenMatches(presented: string, expected: string): boolean {
    const a = Buffer.from(presented)
    const b = Buffer.from(expected)
    return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * The device endpoint: the pot sensor reports the temperature and which
 * fork tags are currently in the pot. Every request must carry the sensor
 * bearer token; with no token configured the endpoint rejects everything
 * (fail-closed), so a deployment that forgot the secret stays protected.
 */
export function createSensorRouter(sensorStore: SensorStore, forkStore: ForkStore, token: string | undefined): Router {
    const router = Router()

    router.use((req, res, next) => {
        if (typeof token !== 'string' || token.length === 0) {
            res.status(401).json({ error: 'sensor token is not configured' })
            return
        }
        const header = req.headers.authorization
        if (typeof header !== 'string' || !header.startsWith(BEARER_PREFIX)) {
            res.status(401).json({ error: 'Authorization: Bearer <token> is required' })
            return
        }
        if (!tokenMatches(header.slice(BEARER_PREFIX.length), token)) {
            res.status(401).json({ error: 'invalid sensor token' })
            return
        }
        next()
    })

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
            let { id, in_pot, food_id } = tag as Record<string, unknown>
            if (typeof id !== 'number' || !Number.isInteger(id)) {
                return null
            }
            if (typeof in_pot !== 'boolean') {
                return null
            }
            food_id = typeof food_id !== 'string' ? null : food_id
            parsedTags.push(<ForkState>{id, in_pot, food_id});
        }
        return { time, temperature, tags: parsedTags }
    }

    router.post('/:dinnerId', (req, res) => {
        const measurement = parseMeasurement(req.body)
        if (!measurement) {
            res.status(400).json({
                error: 'measurement must have numeric time and temperature and a tags array of { id, in_pot }',
            })
            return
        }
        // convert to milliseconds
        sensorStore.append(req.params.dinnerId, { ...measurement, time: measurement.time * 1000 });
        for (const fork of measurement.tags) {
            const food = findFood(fork.food_id ?? 'unknown');
            if (!!food) {
                const forkId = `fork-${fork.id}`;
                const existing = forkStore.get(forkId)?.food ?? null;
                if (existing !== null && existing.foodId !== food.foodId) {
                    // A new piece replaces a different one already on the fork:
                    // the dip clock restarts so no cooking time carries over.
                    sensorStore.restartDip(forkId, req.params.dinnerId, fork.in_pot, measurement.time * 1000, measurement.temperature);
                }
                logger.info(`Setting food for fork ${fork.id}: ${food.foodName}`);
                forkStore.setFood(forkId, food);
            }
        }
        res.status(201).json(measurement);
    })

    return router
}
