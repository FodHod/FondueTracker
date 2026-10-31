import type { Food } from './types'

/**
 * The foods the dinner offers, each with the doneness preferences a guest
 * can pick. Single source of truth for GET /api/foods and for validating
 * the food a client PUTs onto a fork. The ids mirror the doneness tables in
 * src/fondue-math.ts exactly, so every claimable (foodId, prefId) pair has
 * a progress model behind it; test/fondue-math.test.ts pins that invariant.
 */
export const FOOD_CATALOG: Food[] = [
    {
        foodId: 'beef',
        foodName: 'Beef',
        prefs: [
            { id: 'rare', name: 'Rare' },
            { id: 'medium-rare', name: 'Medium rare' },
            { id: 'medium', name: 'Medium' },
            { id: 'medium-well', name: 'Medium well' },
            { id: 'well-done', name: 'Well done' },
        ],
    },
    {
        foodId: 'lamb',
        foodName: 'Lamb',
        prefs: [
            { id: 'rare', name: 'Rare' },
            { id: 'medium-rare', name: 'Medium rare' },
            { id: 'medium', name: 'Medium' },
            { id: 'medium-well', name: 'Medium well' },
            { id: 'well-done', name: 'Well done' },
        ],
    },
    {
        foodId: 'veal',
        foodName: 'Veal',
        prefs: [
            { id: 'medium', name: 'Medium' },
            { id: 'well-done', name: 'Well done' },
        ],
    },
    {
        foodId: 'pork',
        foodName: 'Pork',
        prefs: [
            { id: 'fully-cooked', name: 'Fully cooked' },
        ],
    },
    {
        foodId: 'chicken',
        foodName: 'Chicken',
        prefs: [
            { id: 'fully-cooked', name: 'Fully cooked' },
        ],
    },
    {
        foodId: 'turkey',
        foodName: 'Turkey',
        prefs: [
            { id: 'fully-cooked', name: 'Fully cooked' },
        ],
    },
]

export function findFood(foodId: string): Food | undefined {
    return FOOD_CATALOG.find((food) => food.foodId === foodId)
}

/** True when prefId is one of the food's preferences in the catalog. */
export function hasPref(foodId: string, prefId: string): boolean {
    const food = findFood(foodId)
    return food !== undefined && food.prefs.some((pref) => pref.id === prefId)
}
