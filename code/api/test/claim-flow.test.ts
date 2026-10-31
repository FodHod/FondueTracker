import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app'
import { fullFoodPrefs } from './helpers'
import type { Fork } from '../src/types'

describe('session and claim flow', () => {
    let app: ReturnType<typeof createApp>

    beforeEach(() => {
        app = createApp()
    })

    it('issues a _session cookie and lists eight unclaimed forks on first contact', async () => {
        const res = await request(app).get('/api/forks').set('Accept', 'application/json')

        expect(res.status).toBe(200)
        expect(res.headers['cache-control']).toContain('no-store')

        const setCookie = res.headers['set-cookie']
        expect(setCookie).toBeDefined()
        const cookie = Array.isArray(setCookie) ? setCookie[0] : (setCookie as string)
        expect(cookie).toContain('_session=')
        expect(cookie).toMatch(
            /_session=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
        )
        expect(cookie).toContain('HttpOnly')
        expect(cookie).toContain('SameSite=Lax')
        expect(cookie).toContain('Path=/')
        expect(cookie).toContain('Max-Age=2592000')

        expect(Array.isArray(res.body)).toBe(true)
        const forks = res.body as Fork[]
        expect(forks).toHaveLength(8)
        expect(forks.map((f) => f.id).sort()).toEqual([
            'fork-1', 'fork-2', 'fork-3', 'fork-4',
            'fork-5', 'fork-6', 'fork-7', 'fork-8',
        ])
        expect(new Set(forks.map((f) => f.color)).size).toBe(8)
        for (const fork of forks) {
            expect(fork.dinnerId).toBe('default')
            expect(fork.userId).toBeNull()
            expect(fork.userName).toBeNull()
            expect(fork.food).toBeNull()
            expect(fork.foodPrefs).toBeNull()
            expect(fork.progress).toBe(0)
        }
    })

    it('walks fetch -> claim -> fetch, and only the same session can hold the fork', async () => {
        const user = request.agent(app)

        const before = await user.get('/api/forks').set('Accept', 'application/json')
        expect(before.status).toBe(200)
        expect((before.body as Fork[]).every((f) => f.userId === null)).toBe(true)

        const claim = await user
            .post('/api/forks')
            .send({ id: 'fork-1', userName: 'Alice', foodPrefs: fullFoodPrefs() })
        expect(claim.status).toBe(200)
        const claimed = claim.body as Fork
        expect(claimed.id).toBe('fork-1')
        expect(claimed.userName).toBe('Alice')
        expect(claimed.userId).toMatch(/^[0-9a-f-]{36}$/)

        const after = await user.get('/api/forks').set('Accept', 'application/json')
        expect(after.status).toBe(200)
        const held = (after.body as Fork[]).filter((f) => f.userId !== null)
        expect(held).toHaveLength(1)
        expect(held[0].id).toBe('fork-1')
        expect(held[0].userName).toBe('Alice')
        expect(held[0].userId).toBe(claimed.userId)
        expect(held[0].dinnerId).toBe('default')

        const prefEntries = after.body as Fork[]
        expect(prefEntries).toHaveLength(8)
        expect(held[0].foodPrefs).toEqual(fullFoodPrefs())

        const stranger = request.agent(app)
        const conflict = await stranger
            .post('/api/forks')
            .send({ id: 'fork-1', userName: 'Bob', foodPrefs: fullFoodPrefs() })
        expect(conflict.status).toBe(409)
        expect(typeof conflict.body.error).toBe('string')
    })

    it('lists the session user own fork first, then the rest by id', async () => {
        const user = request.agent(app)

        const before = await user.get('/api/forks').set('Accept', 'application/json')
        expect((before.body as Fork[]).map((f) => f.id)).toEqual([
            'fork-1', 'fork-2', 'fork-3', 'fork-4',
            'fork-5', 'fork-6', 'fork-7', 'fork-8',
        ])

        const other = request.agent(app)
        await other.post('/api/forks').send({ id: 'fork-3', userName: 'Bob', foodPrefs: fullFoodPrefs() })
        await user.post('/api/forks').send({ id: 'fork-7', userName: 'Alice', foodPrefs: fullFoodPrefs() })

        const res = await user.get('/api/forks').set('Accept', 'application/json')
        const ids = (res.body as Fork[]).map((f) => f.id)
        expect(ids).toEqual([
            'fork-7',
            'fork-1', 'fork-2', 'fork-3', 'fork-4', 'fork-5', 'fork-6', 'fork-8',
        ])
    })
})
