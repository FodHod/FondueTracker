import {FOOD_CATALOG} from './catalog'
import {logger} from './logger'
import type {Food, Fork, SensorMeasurement} from './types'

/** The single dinner this deployment hosts; dinner rooms come later. */
const DEFAULT_DINNER_ID = 'default'

/** Fixed palette for the seeded pool; fork i wears palette color (i - 1) % length. */
const FORK_COLORS = [
    '#e63946', // red
    '#ff70a6', // pink
    '#ffd166', // yellow
    '#62BB8F', // green
    '#118ab2', // blue
    '#ABA9DC', // purple
    '#BB8151', // orange
    '#3d3d3d', // graphite
]

function cloneFood(food: Food): Food {
    return {...food, prefs: food.prefs.map((pref) => ({...pref}))}
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

    /**
     * Releases the user's fork back to the pool, emptied of its food; null
     * when they hold none. The holder's standing preferences survive the
     * release — they ride only on a held fork and are re-declared at the
     * next claim anyway.
     */
    function release(userId: string): Fork | null {
        for (const fork of forks.values()) {
            if (fork.userId === userId) {
                fork.userId = null
                fork.userName = null
                fork.food = null
                fork.progress = 0
                return serialize(fork)
            }
        }
        return null
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

    return {list, get, forUser, holdsFork, assign, release, setFood, setPref}
}

/** The materialized dip state of one fork in one dinner. */
export type DipState = {
    /** The fork's status in the latest report that covered it. */
    inPot: boolean
    /** Start of the current or most recent dip (ms); null before the first insertion. */
    insertedAt: number | null
    /** End of the most recent dip (ms); null while the dip is running. */
    removedAt: number | null
    /** Broth temperature at the start of the current or most recent dip. */
    tempAtInsertC: number | null
}

export type SensorStore = ReturnType<typeof createSensorStore>

/**
 * The pot sensor's materialized state: per dinner and fork, only the dip
 * facts progress needs — when the current or last dip started, when it
 * ended, and the broth temperature it started at. Reports fold into this
 * state machine in place; no measurement history is kept. Resets with the
 * process.
 */
export function createSensorStore() {
    const dinners = new Map<string, Map<string, DipState>>()

    /** Stamps the dip boundary a status change crosses. */
    function transition(forkId: string, rec: DipState, inPot: boolean, timeMs: number, tempC: number): void {
        if (rec.inPot === inPot) {
            return
        }
        rec.inPot = inPot
        if (inPot) {
            rec.insertedAt = timeMs
            rec.removedAt = null
            rec.tempAtInsertC = tempC
            logger.info('fork dipped', {forkId, at: new Date(timeMs).toISOString()})
        } else {
            rec.removedAt = timeMs
            logger.info('fork removed', {forkId, at: new Date(timeMs).toISOString()})
        }
    }

    /** Folds one report into the dinner's state. */
    function append(dinnerId: string, measurement: SensorMeasurement): void {
        let records = dinners.get(dinnerId)
        if (!records) {
            records = new Map()
            dinners.set(dinnerId, records)
        }
        const {time, temperature, tags} = measurement

        // A tag absent from a report reads as out of the pot.
        for (const [forkId, rec] of records) {
            const tag = tags.find((t) => `fork-${t.id}` === forkId)
            transition(forkId, rec, tag ? tag.in_pot : false, time, temperature)
        }

        // A tag first seen already in the pot counts as inserted at that report.
        for (const tag of tags) {
            const forkId = `fork-${tag.id}`
            if (records.has(forkId)) {
                continue
            }
            records.set(forkId, {
                inPot: tag.in_pot,
                insertedAt: tag.in_pot ? time : null,
                removedAt: null,
                tempAtInsertC: tag.in_pot ? temperature : null,
            })
            if (tag.in_pot) {
                logger.info('fork dipped', {forkId, at: new Date(time).toISOString()})
            }
        }
    }

    /** The fork's dip state in that dinner, as a copy; null when unknown. */
    function getDipState(forkId: string, dinnerId: string): DipState | null {
        const rec = dinners.get(dinnerId)?.get(forkId)
        return rec ? {...rec} : null
    }

    /**
     * Re-baselines the fork's dip timeline: a food change must not carry the
     * old piece's cooking progress over to the new one. In the pot, the new
     * food counts as dipped since `timeMs`; out of it, the timeline clears
     * entirely. No-op for a fork the sensor has never reported.
     */
    function restartDip(forkId: string, dinnerId: string, inPot: boolean, timeMs: number, tempC?: number): void {
        const rec = dinners.get(dinnerId)?.get(forkId)
        if (!rec) {
            return
        }
        rec.inPot = inPot
        if (inPot) {
            rec.insertedAt = timeMs
            rec.removedAt = null
            rec.tempAtInsertC = tempC ?? rec.tempAtInsertC
        } else {
            rec.insertedAt = null
            rec.removedAt = null
            rec.tempAtInsertC = null
        }
        logger.info('dip re-baselined for a new food', {forkId, inPot, at: new Date(timeMs).toISOString()})
    }

    return {append, getDipState, restartDip}
}
