import { Router } from 'express'
import { FOOD_CATALOG } from '../catalog'

/** Serves the catalog of foods a guest can put on their fork. */
export function createFoodsRouter(): Router {
    const router = Router()

    router.get('/', (_req, res) => {
        res.json(FOOD_CATALOG.map((food) => ({ ...food, prefs: food.prefs.map((pref) => ({ ...pref })) })))
    })

    return router
}
