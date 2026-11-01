import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app'
import { fullFoodPrefs } from './helpers'
import type { Fork } from '../src/types'

type Agent = ReturnType<typeof request.agent>

const ORIGINAL_TOKEN = process.env.SENSOR_TOKEN

// The faked "now" every dip is backdated against.
const NOW_MS = new Date('2026-01-01T12:00:00Z').getTime()
const SEC = 1000

describe('fork progress on GET /api/forks', () => {
    let app: ReturnType<typeof createApp>

    beforeEach(() => {
        process.env.SENSOR_TOKEN = 'test-token'
        vi.useFakeTimers()
        vi.setSystemTime(new Date(NOW_MS))
        app = createApp()
    })

    afterEach(() => {
        vi.useRealTimers()
        if (ORIGINAL_TOKEN === undefined) {
            delete process.env.SENSOR_TOKEN
        } else {
            process.env.SENSOR_TOKEN = ORIGINAL_TOKEN
        }
    })

    /** Reports the pot sensor; `timeMs` is the device clock in ms (the route takes seconds). */
    async function report(timeMs: number, inPot: boolean) {
        const res = await request(app)
            .post('/api/sensor/default')
            .set('Authorization', 'Bearer test-token')
            .send({ time: timeMs / SEC, temperature: 90, tags: [{ id: 1, in_pot: inPot }] })
        expect(res.status).toBe(201)
    }

    /** A dip that started `secondsAgo`: out one report before, in since then. */
    async function dip(secondsAgo: number) {
        await report(NOW_MS - (secondsAgo + 1) * SEC, false)
        await report(NOW_MS - secondsAgo * SEC, true)
    }

    /** Claims fork-1 with the helper prefs (beef: rare). */
    async function claimFork(): Promise<Agent> {
        const agent = request.agent(app)
        const claim = await agent
            .post('/api/forks')
            .send({ id: 'fork-1', userName: 'Alice', foodPrefs: fullFoodPrefs() })
        expect(claim.status).toBe(200)
        return agent
    }

    /** Claims fork-1 and puts beef on it. */
    async function claimForkWithBeef(): Promise<Agent> {
        const agent = await claimFork()
        const put = await agent.put('/api/forks').send({ id: 'fork-1', food: { foodId: 'beef' } })
        expect(put.status).toBe(200)
        return agent
    }

    async function progressOf(agent: Agent): Promise<number> {
        const res = await agent.get('/api/forks').set('Accept', 'application/json')
        expect(res.status).toBe(200)
        const fork = (res.body as Fork[]).find((f) => f.id === 'fork-1') as Fork
        return fork.progress
    }

    it('ramps linearly while below the earliest estimate (beef rare: 10-20 s)', async () => {
        await dip(5)
        const agent = await claimForkWithBeef()
        expect(await progressOf(agent)).toBe(0.5)
    })

    it('holds 1.0 inside the estimated window', async () => {
        await dip(15)
        const agent = await claimForkWithBeef()
        expect(await progressOf(agent)).toBe(1)
    })

    it('flips to 2 once the latest estimate is exceeded', async () => {
        await dip(25)
        const agent = await claimForkWithBeef()
        expect(await progressOf(agent)).toBe(2)
    })

    it('counts a tag first seen in the pot as dipped since that report', async () => {
        await report(NOW_MS - 5 * SEC, true)
        const agent = await claimForkWithBeef()
        expect(await progressOf(agent)).toBe(0.5)
    })

    it('stays 0 for a tag first seen out of the pot', async () => {
        await report(NOW_MS - 5 * SEC, false)
        const agent = await claimForkWithBeef()
        expect(await progressOf(agent)).toBe(0)
    })

    it('freezes progress at the value the dip reached when the fork left the pot', async () => {
        await dip(5)
        await report(NOW_MS - 2 * SEC, false)
        const agent = await claimForkWithBeef()
        expect(await progressOf(agent)).toBe(0.3)
    })

    it('starts a fresh dip when the fork is dipped again', async () => {
        await dip(5)
        await report(NOW_MS - 2 * SEC, false)
        await report(NOW_MS - SEC, true)
        const agent = await claimForkWithBeef()
        expect(await progressOf(agent)).toBe(0.1)
    })

    it('stays 0 with no sensor data at all', async () => {
        const agent = await claimForkWithBeef()
        expect(await progressOf(agent)).toBe(0)
    })

    it('stays 0 for a claimed fork with no food on it', async () => {
        await dip(15)
        const agent = await claimFork()
        expect(await progressOf(agent)).toBe(0)
    })

    describe('food change resets the dip timeline', () => {
        /** Reports the pot sensor with a food on fork-1; `timeMs` is the device clock in ms. */
        async function reportFood(timeMs: number, inPot: boolean, foodId: string) {
            const res = await request(app)
                .post('/api/sensor/default')
                .set('Authorization', 'Bearer test-token')
                .send({ time: timeMs / SEC, temperature: 90, tags: [{ id: 1, in_pot: inPot, food_id: foodId }] })
            expect(res.status).toBe(201)
        }

        /** Puts a food on fork-1 via the holder's API. */
        async function putFood(agent: Agent, foodId: string) {
            const res = await agent.put('/api/forks').send({ id: 'fork-1', food: { foodId } })
            expect(res.status).toBe(200)
        }

        it('restarts at 0 when the sensor reports a different food on a dipping fork', async () => {
            const agent = await claimFork()
            await reportFood(NOW_MS - 60 * SEC, true, 'chicken')
            expect(await progressOf(agent)).toBeCloseTo(60 / 90, 5)

            // The swap: beef goes on while the fork stays in the pot.
            await reportFood(NOW_MS, true, 'beef')
            const swap = await agent.get('/api/forks').set('Accept', 'application/json')
            expect(swap.status).toBe(200)
            const fork = (swap.body as Fork[]).find((f) => f.id === 'fork-1') as Fork
            expect(fork.food?.foodId).toBe('beef')
            expect(fork.progress).toBe(0)

            // Duplicate reports of the same food keep ramping from the swap.
            vi.setSystemTime(new Date(NOW_MS + 5 * SEC))
            await reportFood(NOW_MS + 5 * SEC, true, 'beef')
            expect(await progressOf(agent)).toBe(0.5)

            vi.setSystemTime(new Date(NOW_MS + 15 * SEC))
            await reportFood(NOW_MS + 15 * SEC, true, 'beef')
            expect(await progressOf(agent)).toBe(1)
        })

        it('restarts at 0 when the holder PUTs a different food on a dipping fork', async () => {
            const agent = await claimFork()
            await reportFood(NOW_MS - 60 * SEC, true, 'chicken')
            await putFood(agent, 'beef')
            expect(await progressOf(agent)).toBe(0)

            vi.setSystemTime(new Date(NOW_MS + 5 * SEC))
            expect(await progressOf(agent)).toBe(0.5)
        })

        it('clears the frozen progress of the previous food when swapped out of the pot', async () => {
            const agent = await claimFork()
            await reportFood(NOW_MS - 5 * SEC, true, 'chicken')
            await report(NOW_MS - 2 * SEC, false)
            await putFood(agent, 'beef')
            expect(await progressOf(agent)).toBe(0)

            await report(NOW_MS - SEC, true)
            expect(await progressOf(agent)).toBe(0.1)
        })

        it('keeps progress when the same food is set again (duplicate request)', async () => {
            await dip(5)
            const agent = await claimForkWithBeef()
            expect(await progressOf(agent)).toBe(0.5)

            await putFood(agent, 'beef')
            expect(await progressOf(agent)).toBe(0.5)
        })
    })
})
