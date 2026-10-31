import { Router } from 'express'
import { FOOD_CATALOG, findFood, hasPref } from '../catalog'
import type { ForkStore } from '../store'
import type { Food, FoodPrefChoice } from '../types'

const MAX_USER_NAME = 30

/** Parses one { foodId, prefId } record; null when malformed or not in the catalog. */
function readPrefRecord(value: unknown): FoodPrefChoice | null {
    if (typeof value !== 'object' || value === null) {
        return null
    }
    const { foodId, prefId } = value as { foodId?: unknown; prefId?: unknown }
    if (typeof foodId !== 'string' || typeof prefId !== 'string') {
        return null
    }
    if (!hasPref(foodId, prefId)) {
        return null
    }
    return { foodId, prefId }
}

/**
 * The fork endpoints: list the pool (each fork carrying its holder's food
 * preferences), claim a fork (one-shot, one fork per guest, full preference
 * declaration), and update the food and/or preferences of a fork the session
 * holds.
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

        const foodPrefsBody = req.body?.foodPrefs
        if (!Array.isArray(foodPrefsBody)) {
            res.status(400).json({ error: 'foodPrefs with one preference per food is required' })
            return
        }
        const parsedPrefs = foodPrefsBody.map(readPrefRecord)
        if (parsedPrefs.some((pref) => pref === null)) {
            res.status(400).json({ error: 'foodPrefs must be { foodId, prefId } records from the catalog' })
            return
        }
        const validPrefs = parsedPrefs as FoodPrefChoice[]
        const foodIds = new Set(validPrefs.map((pref) => pref.foodId))
        if (validPrefs.length !== FOOD_CATALOG.length || FOOD_CATALOG.some((food) => !foodIds.has(food.foodId))) {
            res.status(400).json({ error: 'foodPrefs must contain exactly one preference per food' })
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

        for (const pref of validPrefs) {
            store.setPref(req.userId, pref.foodId, pref.prefId)
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

        // Validate the food change (optional) before touching anything.
        const foodBody = req.body?.food
        let food: Food | null | undefined
        if (foodBody !== undefined) {
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
        }

        // Validate the preference merge (optional) the same way.
        const foodPrefsBody = req.body?.foodPrefs
        let prefChanges: FoodPrefChoice[]
        if (foodPrefsBody !== undefined) {
            if (!Array.isArray(foodPrefsBody)) {
                res.status(400).json({ error: 'foodPrefs must be an array of { foodId, prefId } records' })
                return
            }
            const parsed = foodPrefsBody.map(readPrefRecord)
            if (parsed.some((pref) => pref === null)) {
                res.status(400).json({ error: 'foodPrefs must be { foodId, prefId } records from the catalog' })
                return
            }
            prefChanges = parsed as FoodPrefChoice[]
            const ids = new Set(prefChanges.map((pref) => pref.foodId))
            if (ids.size !== prefChanges.length) {
                res.status(400).json({ error: 'foodPrefs must not repeat a food' })
                return
            }
        } else {
            prefChanges = []
        }

        if (food === undefined && foodPrefsBody === undefined) {
            res.status(400).json({ error: 'nothing to update: send food and/or foodPrefs' })
            return
        }

        // Everything validated; apply atomically, then respond with fresh state.
        if (food !== undefined) {
            store.setFood(forkId, food)
        }
        for (const pref of prefChanges) {
            store.setPref(req.userId, pref.foodId, pref.prefId)
        }
        res.json(store.get(forkId) ?? fork)
    })

    return router
}
