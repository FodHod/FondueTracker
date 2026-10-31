import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import morgan from 'morgan'
import { sessionMiddleware } from './session'
import { createForkStore, createSensorStore } from './store'
import { createForksRouter } from './routes/forks'
import { createFoodsRouter } from './routes/foods'
import { createSensorRouter } from './routes/sensor'

const publicDir = fileURLToPath(new URL('../public', import.meta.url))

export function createApp() {
    const app = express()

    // Request logging: terse colored lines in dev, combined format in prod.
    // Off by default (too noisy); set REQUEST_LOGS=1 to switch it on. Health
    // probes are skipped so the Docker HEALTHCHECK does not spam.
    if (process.env.REQUEST_LOGS === '1') {
        app.use(
            morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
                skip: (req) => req.path === '/healthz',
            }),
        )
    }

    // Request parsers: handlers see the same req.body for JSON and form payloads.
    app.use(express.json())
    app.use(express.urlencoded({ extended: true }))

    // Session identity cookie + API response headers for every /api route.
    app.use('/api', sessionMiddleware)

    // The dinner: a freshly seeded pool of forks and the food catalog.
    const store = createForkStore()
    const sensorStore = createSensorStore();
    app.use('/api/forks', createForksRouter(store, sensorStore));
    app.use('/api/foods', createFoodsRouter())

    // The pot sensor's report endpoint, keyed by the dinnerId in its path.
    // The bearer token comes from the environment; unset means fail-closed.
    app.use('/api/sensor', createSensorRouter(sensorStore, process.env.SENSOR_TOKEN))

    // Liveness endpoint for the Docker HEALTHCHECK and k8s probes.
    app.get('/healthz', (_req, res) => {
        res.sendStatus(200)
    })

    // Static files from the copied frontend bundle (JS, CSS, images).
    app.use(express.static(publicDir))

    // SPA fallback: unknown GET paths that want HTML get index.html so the
    // client-side router can pick them up. Everything else falls through to 404.
    app.use((req, res, next) => {
        if (req.method === 'GET' && req.headers.accept?.includes('text/html')) {
            return res.sendFile(path.join(publicDir, 'index.html'))
        }
        next()
    })

    return app
}
