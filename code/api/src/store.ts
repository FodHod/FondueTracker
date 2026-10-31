import { FOOD_CATALOG } from './catalog'
import type {Fork, Food, SensorMeasurement} from './types'

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

    /** The fork the user holds, or null when they hold none. */
    function forUser(userId: string): Fork | null {
        for (const fork of forks.values()) {
            if (fork.userId === userId) {
                return serialize(fork)
            }
        }
        return null
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

    return { list, get, forUser, holdsFork, assign, setFood, setPref }
}

function cloneMeasurement(m: SensorMeasurement): SensorMeasurement {
    return { time: m.time, temperature: m.temperature, tags: m.tags.map((tag) => ({ ...tag })) }
}

export type SensorStore = ReturnType<typeof createSensorStore>

/**
 * The in-memory sensor log: an append-only list of measurements per dinner,
 * keyed by the dinnerId in the sensor route path. Resets with the process;
 * deliberately unbounded — a dinner is hours, not weeks.
 */
export function createSensorStore() {
    const log = new Map<string, SensorMeasurement[]>()

    /**
     * Check if the specific fork is in the pot at the given measurement
     * @param measurement
     * @param forkId
     */
    function getStatusForForkId(measurement: SensorMeasurement, forkId: string): boolean {
        const forkState = measurement.tags.filter(tag => `fork-${tag.id}` === forkId);
        return forkState.length > 0 && forkState[0].in_pot;
    }

    /**
     * Get the time at which the fork flipped from in_pot=true to in_pot=false or vice-versa.
     * @param forkId The id of the fork.
     * @param dinner The id of the dinner.
     */
    function getFlipTime(forkId: string, dinner: string): { insertedInPot: boolean, flipTime: Date } | null {
        const events = log.get(dinner);
        if (!events) {
            return null;
        }

        const tagId = forkId;
        const newestStatus = getStatusForForkId(events[events.length - 1], tagId);
        for (let i = events.length - 1; i >= 0; i--) {
            const event = events[i];
            const currentStatus = getStatusForForkId(event, tagId);
            if (newestStatus !== currentStatus) {
                return { insertedInPot: newestStatus, flipTime: new Date(event.time) };
            }
        }

        return null;
    }

    /** Appends a copy of the measurement to the dinner's log. */
    function append(dinnerId: string, measurement: SensorMeasurement): void {
        const entries = log.get(dinnerId)
        if (entries) {
            entries.push(cloneMeasurement(measurement))
        } else {
            log.set(dinnerId, [cloneMeasurement(measurement)])
        }
    }

    /** The dinner's measurements, oldest first, as copies. */
    function list(dinnerId: string): SensorMeasurement[] {
        return (log.get(dinnerId) ?? []).map(cloneMeasurement)
    }

    return { append, list, getFlipTime };
}
