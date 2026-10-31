import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app'
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

describe('POST /api/sensor/:dinnerId', () => {
    let app: ReturnType<typeof createApp>

    beforeEach(() => {
        app = createApp()
    })

    it('stores a measurement and echoes it with 201', async () => {
        const res = await request(app).post('/api/sensor/default').send(EXAMPLE)
        expect(res.status).toBe(201)
        expect(res.body).toEqual(EXAMPLE)
    })

    it('ignores extra fields in the payload', async () => {
        const res = await request(app)
            .post('/api/sensor/default')
            .send({ ...EXAMPLE, extra: 'ignored' })
        expect(res.status).toBe(201)
        expect(res.body).toEqual(EXAMPLE)
    })

    it('accepts an empty tags array', async () => {
        const res = await request(app)
            .post('/api/sensor/default')
            .send({ ...EXAMPLE, tags: [] })
        expect(res.status).toBe(201)
        expect(res.body.tags).toEqual([])
    })

    it('rejects a missing or non-numeric time with 400', async () => {
        const missing = await request(app)
            .post('/api/sensor/default')
            .send({ temperature: 27, tags: [] })
        expect(missing.status).toBe(400)

        const bad = await request(app)
            .post('/api/sensor/default')
            .send({ ...EXAMPLE, time: 'now' })
        expect(bad.status).toBe(400)
    })

    it('rejects a missing or non-numeric temperature with 400', async () => {
        const missing = await request(app)
            .post('/api/sensor/default')
            .send({ time: 1, tags: [] })
        expect(missing.status).toBe(400)

        const bad = await request(app)
            .post('/api/sensor/default')
            .send({ ...EXAMPLE, temperature: 'hot' })
        expect(bad.status).toBe(400)
    })

    it('rejects missing or malformed tags with 400', async () => {
        const missing = await request(app)
            .post('/api/sensor/default')
            .send({ time: 1, temperature: 27 })
        expect(missing.status).toBe(400)

        const notArray = await request(app)
            .post('/api/sensor/default')
            .send({ ...EXAMPLE, tags: 'none' })
        expect(notArray.status).toBe(400)

        const badPot = await request(app)
            .post('/api/sensor/default')
            .send({ ...EXAMPLE, tags: [{ id: 1, in_pot: 'yes' }] })
        expect(badPot.status).toBe(400)

        const badId = await request(app)
            .post('/api/sensor/default')
            .send({ ...EXAMPLE, tags: [{ id: 'one', in_pot: true }] })
        expect(badId.status).toBe(400)
    })

    it('answers with a JSON error body on 400', async () => {
        const res = await request(app).post('/api/sensor/default').send({})
        expect(res.status).toBe(400)
        expect(typeof res.body.error).toBe('string')
    })
})
