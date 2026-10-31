import { Router } from 'express'
import { findFood } from '../catalog'
import type { ForkStore } from '../store'
import type { Food } from '../types'

const MAX_USER_NAME = 30

/**
 * The fork endpoints: list the pool, claim a fork (one-shot, one fork per
 * guest), and set or clear the food on a fork the session holds.
 */
export function createForksRouter(store: ForkStore): Router {
    const router = Router()

    router.get('/', (req, res) => {
        // The session user's own fork leads the list; the rest follow in id order.
        const forks = store.list()
        forks.sort((a, b) => {
            const own = Number(b.userId === req.userId) - Number(a.userId === req.userId)
            if (own !== 0) {
                return own
            }
            return a.id.localeCompare(b.id, undefined, { numeric: true })
        })
        res.json(forks)
    })

    router.post('/', (req, res) => {
        const forkId = req.body?.id
        if (typeof forkId !== 'string' || forkId.length === 0) {
            res.status(400).json({ error: 'fork id is required' })
            return
        }

        const rawName = req.body?.userName
        if (typeof rawName !== 'string') {
            res.status(400).json({ error: 'userName is required' })
            return
        }
        const userName = rawName.trim()
        if (userName.length === 0 || userName.length > MAX_USER_NAME) {
            res.status(400).json({ error: `userName must be 1 to ${MAX_USER_NAME} characters` })
            return
        }

        const fork = store.get(forkId)
        if (!fork) {
            res.status(404).json({ error: `unknown fork: ${forkId}` })
            return
        }
        if (fork.userId !== null) {
            res.status(409).json({ error: `fork ${forkId} is already claimed` })
            return
        }
        if (store.holdsFork(req.userId)) {
            res.status(409).json({ error: 'you already hold a fork' })
            return
        }

        const claimed = store.assign(forkId, req.userId, userName)
        if (!claimed) {
            res.status(404).json({ error: `unknown fork: ${forkId}` })
            return
        }
        res.json(claimed)
    })

    router.put('/', (req, res) => {
        const forkId = req.body?.id
        if (typeof forkId !== 'string' || forkId.length === 0) {
            res.status(400).json({ error: 'fork id is required' })
            return
        }

        const fork = store.get(forkId)
        if (!fork) {
            res.status(404).json({ error: `unknown fork: ${forkId}` })
            return
        }
        if (fork.userId !== req.userId) {
            res.status(403).json({ error: `you do not hold fork ${forkId}` })
            return
        }

        const foodBody = req.body?.food
        let food: Food | null
        if (foodBody === null) {
            food = null
        } else if (typeof foodBody === 'object' && typeof foodBody.foodId === 'string') {
            const catalogFood = findFood(foodBody.foodId)
            if (!catalogFood) {
                res.status(400).json({ error: `unknown food: ${foodBody.foodId}` })
                return
            }
            food = catalogFood
        } else {
            res.status(400).json({ error: 'food must be a catalog food or null' })
            return
        }

        const updated = store.setFood(forkId, food)
        if (!updated) {
            res.status(404).json({ error: `unknown fork: ${forkId}` })
            return
        }
        res.json(updated)
    })

    return router
}
