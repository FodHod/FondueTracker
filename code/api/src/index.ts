import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'

const publicDir = fileURLToPath(new URL('../public', import.meta.url))
const port = Number(process.env.PORT ?? 8080)

const app = express()

// Request parsers: handlers see the same req.body for JSON and form payloads.
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Liveness endpoint for the Docker HEALTHCHECK and k8s probes.
app.get('/healthz', (_req, res) => {
  res.sendStatus(200)
})

// Example endpoint: echoes the parsed body back, whatever format it arrived in.
app.post('/api/example', (req, res) => {
  res.json({ received: req.body })
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

app.listen(port, () => {
  console.log(`FondueTracker API listening on http://localhost:${port}`)
})
