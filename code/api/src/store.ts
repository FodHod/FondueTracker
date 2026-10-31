import { FOOD_CATALOG } from './catalog'
import type { Fork, Food } from './types'

/** The single dinner this deployment hosts; dinner rooms come later. */
const DEFAULT_DINNER_ID = 'default'

/** Fixed palette for the seeded pool; fork i wears palette color (i - 1) % length. */
const FORK_COLORS = [
    '#e63946', // red
    '#f4a261', // orange
    '#ffd166', // yellow
    '#06d6a0', // green
    '#118ab2', // blue
    '#7b2cbf', // purple
    '#ff70a6', // pink
    '#3d3d3d', // graphite
]

function cloneFood(food: Food): Food {
    return { ...food, prefs: food.prefs.map((pref) => ({ ...pref })) }
}

export type ForkStore = ReturnType<typeof createForkStore>

/**
 * The in-memory dinner: a seeded pool of FORK_COUNT forks, who holds which,
 * what is on each fork, and every guest's standing food preferences. All
 * mutable state lives here; the session cookie carries identity only.
 */
export function createForkStore() {
    const envCount = Number.parseInt(process.env.FORK_COUNT ?? '', 10)
    const forkCount = envCount > 0 ? envCount : 8

    const forks = new Map<string, Fork>()
    for (let i = 1; i <= forkCount; i++) {
        forks.set(`fork-${i}`, {
            id: `fork-${i}`,
            dinnerId: DEFAULT_DINNER_ID,
            food: null,
            userName: null,
            userId: null,
            foodPrefs: null,
            progress: 0,
            color: FORK_COLORS[(i - 1) % FORK_COLORS.length],
        })
    }

    /** Standing food preferences per guest: userId -> foodId -> prefId. */
    const userPrefs = new Map<string, Map<string, string>>()

    /**
     * Serializes a fork for responses: a claimed fork carries its holder's
     * exhaustive preference set (one record per food, catalog order); an
     * unclaimed fork carries null.
     */
    function serialize(fork: Fork): Fork {
        const clone: Fork = {
            ...fork,
            food: fork.food ? cloneFood(fork.food) : null,
        }
        if (fork.userId === null) {
            clone.foodPrefs = null
            return clone
        }
        const prefs = userPrefs.get(fork.userId)
        clone.foodPrefs = FOOD_CATALOG.map((food) => ({
            foodId: food.foodId,
            prefId: prefs?.get(food.foodId) ?? '',
        }))
        return clone
    }

    function list(): Fork[] {
        return [...forks.values()].map(serialize)
    }

    function get(id: string): Fork | null {
        const fork = forks.get(id)
        return fork ? serialize(fork) : null
    }

    /** True when the user already holds any fork — one fork per guest. */
    function holdsFork(userId: string): boolean {
        for (const fork of forks.values()) {
            if (fork.userId === userId) {
                return true
            }
        }
        return false
    }

    /** Claims the fork for the user; null when the fork does not exist. */
    function assign(id: string, userId: string, userName: string): Fork | null {
        const fork = forks.get(id)
        if (!fork) {
            return null
        }
        fork.userId = userId
        fork.userName = userName
        return serialize(fork)
    }

    /** Sets or clears the fork's food; null when the fork does not exist. */
    function setFood(id: string, food: Food | null): Fork | null {
        const fork = forks.get(id)
        if (!fork) {
            return null
        }
        fork.food = food ? cloneFood(food) : null
        return serialize(fork)
    }

    /** Upserts the user's standing preference for one food. */
    function setPref(userId: string, foodId: string, prefId: string): void {
        let prefs = userPrefs.get(userId)
        if (!prefs) {
            prefs = new Map()
            userPrefs.set(userId, prefs)
        }
        prefs.set(foodId, prefId)
    }

    return { list, get, holdsFork, assign, setFood, setPref }
}
