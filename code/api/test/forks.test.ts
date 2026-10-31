import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app'
import { fullFoodPrefs } from './helpers'
import type { Fork, Food } from '../src/types'

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
