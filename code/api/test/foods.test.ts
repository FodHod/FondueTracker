import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app'
import type { Food } from '../src/types'

describe('GET /api/foods', () => {
    it('serves the catalog with all seeded foods', async () => {
        const res = await request(createApp()).get('/api/foods').set('Accept', 'application/json')

        expect(res.status).toBe(200)
        const foods = res.body as Food[]
        expect(foods.map((f) => f.foodId).sort()).toEqual([
            'beef', 'bread', 'chicken', 'mushroom', 'pineapple',
        ])
    })

    it('gives every food at least one preference with id and name', async () => {
        const res = await request(createApp()).get('/api/foods').set('Accept', 'application/json')

        expect(res.status).toBe(200)
        for (const food of res.body as Food[]) {
            expect(food.prefs.length).toBeGreaterThan(0)
            for (const pref of food.prefs) {
                expect(pref.id.length).toBeGreaterThan(0)
                expect(pref.name.length).toBeGreaterThan(0)
            }
        }
    })
})
