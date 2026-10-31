import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app'
import { fullFoodPrefs } from './helpers'
import type { Fork } from '../src/types'

type Agent = ReturnType<typeof request.agent>

let app: ReturnType<typeof createApp>

beforeEach(() => {
    app = createApp()
})

async function claim(agent: Agent, forkId: string, userName: string) {
    return agent.post('/api/forks').send({ id: forkId, userName, foodPrefs: fullFoodPrefs() })
}

async function putPrefs(agent: Agent, forkId: string, foodPrefs: unknown) {
    return agent.put('/api/forks').send({ id: forkId, foodPrefs })
}

function forkOf(body: unknown, id: string): Fork {
    return (body as Fork[]).find((f) => f.id === id) as Fork
}

describe('POST /api/forks foodPrefs validation', () => {
    it('rejects a claim without foodPrefs with 400 and does not take the fork', async () => {
        const agent = request.agent(app)

        const res = await agent.post('/api/forks').send({ id: 'fork-1', userName: 'Alice' })
        expect(res.status).toBe(400)
        expect(typeof res.body.error).toBe('string')

        const retry = await claim(agent, 'fork-1', 'Alice')
        expect(retry.status).toBe(200)
    })

    it('rejects a claim whose foodPrefs miss a food with 400', async () => {
        const res = await request.agent(app).post('/api/forks').send({
            id: 'fork-1',
            userName: 'Alice',
            foodPrefs: fullFoodPrefs().slice(0, 4),
        })
        expect(res.status).toBe(400)
    })

    it('rejects a claim with duplicate or unknown food records with 400', async () => {
        const agent = request.agent(app)

        const dup = await agent.post('/api/forks').send({
            id: 'fork-1',
            userName: 'Alice',
            foodPrefs: [...fullFoodPrefs(), { foodId: 'beef', prefId: 'medium' }],
        })
        expect(dup.status).toBe(400)

        const unknown = await agent.post('/api/forks').send({
            id: 'fork-2',
            userName: 'Alice',
            foodPrefs: [...fullFoodPrefs(), { foodId: 'stone', prefId: 'hard' }],
        })
        expect(unknown.status).toBe(400)
    })

    it('rejects a claim with a prefId outside the food prefs with 400', async () => {
        const res = await request.agent(app).post('/api/forks').send({
            id: 'fork-1',
            userName: 'Alice',
            foodPrefs: fullFoodPrefs().map((p) =>
                p.foodId === 'beef' ? { ...p, prefId: 'burnt' } : p,
            ),
        })
        expect(res.status).toBe(400)
    })

    it('rejects a claim with malformed records with 400', async () => {
        const res = await request.agent(app).post('/api/forks').send({
            id: 'fork-1',
            userName: 'Alice',
            foodPrefs: fullFoodPrefs().map((p) =>
                p.foodId === 'beef' ? { foodId: 'beef' } : p,
            ),
        })
        expect(res.status).toBe(400)
    })
})

describe('PUT /api/forks foodPrefs merge', () => {
    it('merges foodPrefs by foodId and keeps unmentioned foods', async () => {
        const agent = request.agent(app)
        await claim(agent, 'fork-1', 'Alice')

        const res = await putPrefs(agent, 'fork-1', [{ foodId: 'beef', prefId: 'well' }])
        expect(res.status).toBe(200)
        expect((res.body as Fork).foodPrefs).toEqual(
            fullFoodPrefs().map((p) => (p.foodId === 'beef' ? { ...p, prefId: 'well' } : p)),
        )
    })

    it('updates food and foodPrefs in one request', async () => {
        const agent = request.agent(app)
        await claim(agent, 'fork-1', 'Alice')

        const res = await agent.put('/api/forks').send({
            id: 'fork-1',
            food: { foodId: 'beef' },
            foodPrefs: [{ foodId: 'bread', prefId: 'golden' }],
        })
        expect(res.status).toBe(200)
        expect((res.body as Fork).food?.foodId).toBe('beef')
        expect((res.body as Fork).foodPrefs?.find((p) => p.foodId === 'bread')).toEqual({
            foodId: 'bread',
            prefId: 'golden',
        })
    })

    it('validates atomically: an invalid foodPrefs changes nothing', async () => {
        const agent = request.agent(app)
        await claim(agent, 'fork-1', 'Alice')

        const res = await agent.put('/api/forks').send({
            id: 'fork-1',
            food: { foodId: 'beef' },
            foodPrefs: [{ foodId: 'beef', prefId: 'burnt' }],
        })
        expect(res.status).toBe(400)

        const list = await agent.get('/api/forks').set('Accept', 'application/json')
        const fork = forkOf(list.body, 'fork-1')
        expect(fork.food).toBeNull()
        expect(fork.foodPrefs?.find((p) => p.foodId === 'beef')).toEqual({
            foodId: 'beef',
            prefId: 'rare',
        })
    })

    it('rejects a merge from anyone but the holder with 403', async () => {
        const owner = request.agent(app)
        await claim(owner, 'fork-1', 'Alice')

        const stranger = request.agent(app)
        const res = await putPrefs(stranger, 'fork-1', [{ foodId: 'beef', prefId: 'well' }])
        expect(res.status).toBe(403)
    })

    it('rejects duplicate foodIds in one merge with 400', async () => {
        const agent = request.agent(app)
        await claim(agent, 'fork-1', 'Alice')

        const res = await putPrefs(agent, 'fork-1', [
            { foodId: 'beef', prefId: 'well' },
            { foodId: 'beef', prefId: 'rare' },
        ])
        expect(res.status).toBe(400)
    })

    it('rejects a PUT with neither food nor foodPrefs with 400', async () => {
        const agent = request.agent(app)
        await claim(agent, 'fork-1', 'Alice')

        const res = await agent.put('/api/forks').send({ id: 'fork-1' })
        expect(res.status).toBe(400)
        expect(typeof res.body.error).toBe('string')
    })
})

describe('GET /api/forks per-fork foodPrefs', () => {
    it('carries each holder preferences on their fork and null on unclaimed forks', async () => {
        const alice = request.agent(app)
        const bob = request.agent(app)
        await claim(alice, 'fork-3', 'Alice')
        await claim(bob, 'fork-1', 'Bob')

        const res = await request(app).get('/api/forks').set('Accept', 'application/json')
        expect(Array.isArray(res.body)).toBe(true)
        const forks = res.body as Fork[]
        expect(forks.map((f) => f.id)).toEqual([
            'fork-1', 'fork-2', 'fork-3', 'fork-4', 'fork-5', 'fork-6', 'fork-7', 'fork-8',
        ])
        expect(forkOf(forks, 'fork-1').userName).toBe('Bob')
        expect(forkOf(forks, 'fork-1').foodPrefs).toEqual(fullFoodPrefs())
        expect(forkOf(forks, 'fork-3').userName).toBe('Alice')
        expect(forkOf(forks, 'fork-3').foodPrefs).toEqual(fullFoodPrefs())
        for (const fork of forks) {
            if (fork.userId === null) {
                expect(fork.foodPrefs).toBeNull()
            } else {
                expect(fork.foodPrefs).toEqual(fullFoodPrefs())
            }
        }
    })
})
