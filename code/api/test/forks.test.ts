import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app'
import { fullFoodPrefs } from './helpers'
import type { Fork, Food, ForkListItem } from '../src/types'

type Agent = ReturnType<typeof request.agent>

let app: ReturnType<typeof createApp>

beforeEach(() => {
    app = createApp()
})

async function claim(agent: Agent, forkId: string, userName: string) {
    return agent.post('/api/forks').send({ id: forkId, userName, foodPrefs: fullFoodPrefs() })
}

async function setFood(agent: Agent, forkId: string, food: unknown) {
    return agent.put('/api/forks').send({ id: forkId, food })
}

describe('GET /api/forks (inPot)', () => {
    const ORIGINAL_TOKEN = process.env.SENSOR_TOKEN
    let app: ReturnType<typeof createApp>

    beforeEach(() => {
        process.env.SENSOR_TOKEN = 'test-token'
        app = createApp()
    })

    afterEach(() => {
        if (ORIGINAL_TOKEN === undefined) {
            delete process.env.SENSOR_TOKEN
        } else {
            process.env.SENSOR_TOKEN = ORIGINAL_TOKEN
        }
    })

    /** Reports the pot sensor: one tag, in or out of the pot. */
    async function report(tagId: number, inPot: boolean) {
        const res = await request(app)
            .post('/api/sensor/default')
            .set('Authorization', 'Bearer test-token')
            .send({ time: 1793443169.0806723, temperature: 90, tags: [{ id: tagId, in_pot: inPot }] })
        expect(res.status).toBe(201)
    }

    async function listForks(): Promise<ForkListItem[]> {
        const res = await request.agent(app).get('/api/forks').set('Accept', 'application/json')
        expect(res.status).toBe(200)
        return res.body as ForkListItem[]
    }

    it('marks every fork out of the pot before any sensor report', async () => {
        const forks = await listForks()
        expect(forks).toHaveLength(8)
        for (const fork of forks) {
            expect(fork.inPot).toBe(false)
        }
    })

    it('is true for the fork the sensor reports in the pot, false for the rest', async () => {
        await report(1, true)
        const inPot = (await listForks()).filter((f) => f.inPot)
        expect(inPot.map((f) => f.id)).toEqual(['fork-1'])
    })

    it('flips back to false once a later report shows the fork out', async () => {
        await report(1, true)
        await report(1, false)
        const forks = await listForks()
        expect(forks.every((f) => !f.inPot)).toBe(true)
    })

    it('covers unclaimed forks too — a fork need not be claimed to be in the pot', async () => {
        await report(3, true)
        const forks = await listForks()
        const fork3 = forks.find((f) => f.id === 'fork-3') as ForkListItem
        expect(fork3.inPot).toBe(true)
        expect(fork3.userId).toBeNull()
        expect(fork3.foodPrefs).toBeNull()
        expect(fork3.progress).toBe(0)
    })
})

describe('POST /api/forks (claim)', () => {
    it('rejects unknown forks with 404', async () => {
        const res = await claim(request.agent(app), 'fork-999', 'Alice')
        expect(res.status).toBe(404)
        expect(typeof res.body.error).toBe('string')
    })

    it('rejects a claim without a fork id with 400', async () => {
        const res = await request.agent(app).post('/api/forks').send({ userName: 'Alice' })
        expect(res.status).toBe(400)
        expect(typeof res.body.error).toBe('string')
    })

    it('rejects a missing userName with 400', async () => {
        const res = await request.agent(app).post('/api/forks').send({ id: 'fork-1' })
        expect(res.status).toBe(400)
        expect(typeof res.body.error).toBe('string')
    })

    it('rejects blank or overlong usernames with 400', async () => {
        const agent = request.agent(app)

        const blank = await claim(agent, 'fork-1', '   ')
        expect(blank.status).toBe(400)

        const long = await claim(agent, 'fork-1', 'a'.repeat(31))
        expect(long.status).toBe(400)
    })

    it('trims the username', async () => {
        const res = await claim(request.agent(app), 'fork-1', '  Alice  ')
        expect(res.status).toBe(200)
        expect((res.body as Fork).userName).toBe('Alice')
    })

    it('rejects re-claiming your own fork with 409 and leaves the fork unchanged', async () => {
        const agent = request.agent(app)

        const first = await claim(agent, 'fork-1', 'Alice')
        expect(first.status).toBe(200)

        const again = await claim(agent, 'fork-1', 'Alicia')
        expect(again.status).toBe(409)
        expect(typeof again.body.error).toBe('string')

        const list = await agent.get('/api/forks').set('Accept', 'application/json')
        const mine = (list.body as Fork[]).find((f) => f.id === 'fork-1') as Fork
        expect(mine.userName).toBe('Alice')
    })

    it('ignores a client-supplied userId and uses the session identity', async () => {
        const agent = request.agent(app)
        const res = await agent.post('/api/forks').send({
            id: 'fork-1',
            userName: 'Alice',
            userId: 'not-my-id',
            foodPrefs: fullFoodPrefs(),
        })
        expect(res.status).toBe(200)
        const fork = res.body as Fork
        expect(fork.userId).not.toBe('not-my-id')
        expect(fork.userId).toMatch(/^[0-9a-f-]{36}$/)
    })

    it('rejects claiming a second fork while already holding one with 409', async () => {
        const agent = request.agent(app)

        const first = await claim(agent, 'fork-1', 'Alice')
        expect(first.status).toBe(200)

        const second = await claim(agent, 'fork-2', 'Alice')
        expect(second.status).toBe(409)
        expect(typeof second.body.error).toBe('string')

        const list = await agent.get('/api/forks').set('Accept', 'application/json')
        const held = (list.body as Fork[]).filter((f) => f.userId !== null)
        expect(held.map((f) => f.id)).toEqual(['fork-1'])
    })
})

describe('GET /api/forks/mine', () => {
    it('returns the fork held by the session user', async () => {
        const agent = request.agent(app)
        await claim(agent, 'fork-1', 'Alice')

        const res = await agent.get('/api/forks/mine')
        expect(res.status).toBe(200)
        const fork = res.body as Fork
        expect(fork.id).toBe('fork-1')
        expect(fork.userName).toBe('Alice')
        expect(fork.userId).toMatch(/^[0-9a-f-]{36}$/)
    })

    it('carries the food preferences declared at claim time', async () => {
        const agent = request.agent(app)
        await claim(agent, 'fork-1', 'Alice')

        const res = await agent.get('/api/forks/mine')
        const fork = res.body as Fork
        expect(fork.foodPrefs).toEqual(fullFoodPrefs())
    })

    it('rejects a session that holds no fork with 404', async () => {
        const res = await request.agent(app).get('/api/forks/mine')
        expect(res.status).toBe(404)
        expect(typeof res.body.error).toBe('string')
    })

    it('does not expose a fork held by another guest', async () => {
        const owner = request.agent(app)
        await claim(owner, 'fork-1', 'Alice')

        const stranger = request.agent(app)
        const res = await stranger.get('/api/forks/mine')
        expect(res.status).toBe(404)
    })
})

describe('PUT /api/forks (food)', () => {
    it('rejects unknown forks with 404', async () => {
        const res = await setFood(request.agent(app), 'fork-999', { foodId: 'beef' })
        expect(res.status).toBe(404)
        expect(typeof res.body.error).toBe('string')
    })

    it('rejects a PUT without a fork id with 400', async () => {
        const res = await request.agent(app).put('/api/forks').send({ food: null })
        expect(res.status).toBe(400)
        expect(typeof res.body.error).toBe('string')
    })

    it('sets food for the holder and re-hydrates it from the catalog', async () => {
        const agent = request.agent(app)
        await claim(agent, 'fork-1', 'Alice')

        const res = await setFood(agent, 'fork-1', {
            foodId: 'beef',
            foodName: 'Not From Catalog',
            prefs: [],
        })
        expect(res.status).toBe(200)
        const food = (res.body as Fork).food as Food
        expect(food.foodId).toBe('beef')
        expect(food.foodName).not.toBe('Not From Catalog')
        expect(food.foodName.length).toBeGreaterThan(0)
        expect(food.prefs.length).toBeGreaterThan(0)
        for (const pref of food.prefs) {
            expect(typeof pref.id).toBe('string')
            expect(typeof pref.name).toBe('string')
        }
    })

    it('clears food with food: null', async () => {
        const agent = request.agent(app)
        await claim(agent, 'fork-1', 'Alice')
        await setFood(agent, 'fork-1', { foodId: 'beef' })

        const res = await setFood(agent, 'fork-1', null)
        expect(res.status).toBe(200)
        expect((res.body as Fork).food).toBeNull()
    })

    it('rejects unknown foodId with 400', async () => {
        const agent = request.agent(app)
        await claim(agent, 'fork-1', 'Alice')

        const res = await setFood(agent, 'fork-1', { foodId: 'stone' })
        expect(res.status).toBe(400)
        expect(typeof res.body.error).toBe('string')
    })

    it('rejects malformed food values with 400', async () => {
        const agent = request.agent(app)
        await claim(agent, 'fork-1', 'Alice')

        const res = await setFood(agent, 'fork-1', 'beef')
        expect(res.status).toBe(400)
        expect(typeof res.body.error).toBe('string')
    })

    it('ignores fields other than id, food, and foodPrefs in the body', async () => {
        const agent = request.agent(app)
        await claim(agent, 'fork-1', 'Alice')

        const res = await agent.put('/api/forks').send({
            id: 'fork-1',
            food: { foodId: 'beef' },
            userName: 'Mallory',
            userId: 'fake',
            progress: 999,
        })
        expect(res.status).toBe(200)
        const fork = res.body as Fork
        expect(fork.userName).toBe('Alice')
        expect(fork.userId).not.toBe('fake')
        expect(fork.progress).not.toBe(999)
    })

    it('rejects anyone but the holder with 403', async () => {
        const owner = request.agent(app)
        await claim(owner, 'fork-1', 'Alice')

        const stranger = request.agent(app)
        const res = await setFood(stranger, 'fork-1', { foodId: 'beef' })
        expect(res.status).toBe(403)
        expect(typeof res.body.error).toBe('string')
    })

    it('rejects setting food while the fork is unclaimed with 403', async () => {
        const res = await setFood(request.agent(app), 'fork-3', { foodId: 'beef' })
        expect(res.status).toBe(403)
    })
})

describe('POST /api/forks/leave', () => {
    it('releases the held fork back to the pool and clears its food', async () => {
        const agent = request.agent(app)
        await claim(agent, 'fork-1', 'Alice')
        await setFood(agent, 'fork-1', { foodId: 'beef' })

        const res = await agent.post('/api/forks/leave')
        expect(res.status).toBe(200)
        const fork = res.body as Fork
        expect(fork.id).toBe('fork-1')
        expect(fork.userId).toBeNull()
        expect(fork.userName).toBeNull()
        expect(fork.food).toBeNull()
        expect(fork.foodPrefs).toBeNull()
        expect(fork.progress).toBe(0)

        const list = await agent.get('/api/forks').set('Accept', 'application/json')
        const released = (list.body as Fork[]).find((f) => f.id === 'fork-1') as Fork
        expect(released.userId).toBeNull()
        expect(released.userName).toBeNull()
        expect(released.food).toBeNull()
        expect(released.foodPrefs).toBeNull()
    })

    it('succeeds with 200 and a null body when the session holds no fork', async () => {
        const res = await request.agent(app).post('/api/forks/leave')
        expect(res.status).toBe(200)
        expect(res.body).toBeNull()
    })

    it('is idempotent: leaving twice still returns 200', async () => {
        const agent = request.agent(app)
        await claim(agent, 'fork-1', 'Alice')

        const first = await agent.post('/api/forks/leave')
        expect(first.status).toBe(200)
        const again = await agent.post('/api/forks/leave')
        expect(again.status).toBe(200)
        expect(again.body).toBeNull()
    })

    it('lets the same guest claim another fork afterwards', async () => {
        const agent = request.agent(app)
        await claim(agent, 'fork-1', 'Alice')
        expect((await agent.post('/api/forks/leave')).status).toBe(200)

        const reclaim = await claim(agent, 'fork-2', 'Alice')
        expect(reclaim.status).toBe(200)
        expect((reclaim.body as Fork).id).toBe('fork-2')
    })

    it('frees the fork for another guest to claim', async () => {
        const alice = request.agent(app)
        await claim(alice, 'fork-1', 'Alice')
        expect((await alice.post('/api/forks/leave')).status).toBe(200)

        const bob = request.agent(app)
        const res = await claim(bob, 'fork-1', 'Bob')
        expect(res.status).toBe(200)
        expect((res.body as Fork).userName).toBe('Bob')
    })

    it('leaves the forks of other guests untouched', async () => {
        const alice = request.agent(app)
        const bob = request.agent(app)
        await claim(alice, 'fork-1', 'Alice')
        await claim(bob, 'fork-2', 'Bob')

        expect((await alice.post('/api/forks/leave')).status).toBe(200)

        const mine = await bob.get('/api/forks/mine')
        expect(mine.status).toBe(200)
        expect((mine.body as Fork).id).toBe('fork-2')
        expect((mine.body as Fork).userName).toBe('Bob')
    })
})

describe('POST /api/forks/leave (dip re-baseline)', () => {
    const ORIGINAL_TOKEN = process.env.SENSOR_TOKEN
    let app: ReturnType<typeof createApp>

    // The faked "now" every dip is backdated against.
    const NOW_MS = new Date('2026-01-01T12:00:00Z').getTime()
    const SEC = 1000

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

    async function progressOf(agent: Agent): Promise<number> {
        const res = await agent.get('/api/forks').set('Accept', 'application/json')
        expect(res.status).toBe(200)
        const fork = (res.body as ForkListItem[]).find((f) => f.id === 'fork-1') as ForkListItem
        return fork.progress
    }

    it('takes the fork out of the pot and starts the next dip on a fresh clock', async () => {
        // A dip that started 5 s ago: beef rare (10-20 s window) is half done.
        await report(NOW_MS - (5 + 1) * SEC, false)
        await report(NOW_MS - 5 * SEC, true)

        const agent = request.agent(app)
        await claim(agent, 'fork-1', 'Alice')
        await setFood(agent, 'fork-1', { foodId: 'beef' })
        expect(await progressOf(agent)).toBe(0.5)

        const leave = await agent.post('/api/forks/leave')
        expect(leave.status).toBe(200)

        // Re-baselined: the fork reads as out of the pot and back in the pool empty.
        const list = await agent.get('/api/forks').set('Accept', 'application/json')
        const fork = (list.body as ForkListItem[]).find((f) => f.id === 'fork-1') as ForkListItem
        expect(fork.inPot).toBe(false)
        expect(fork.userId).toBeNull()
        expect(fork.food).toBeNull()
        expect(fork.progress).toBe(0)

        // The sensor reports the fork in the pot again: the dip restarts at that
        // report, so the next holder's food inherits none of the old cooking time.
        await report(NOW_MS, true)
        await claim(agent, 'fork-1', 'Alice')
        await setFood(agent, 'fork-1', { foodId: 'beef' })
        expect(await progressOf(agent)).toBe(0)
    })
})
