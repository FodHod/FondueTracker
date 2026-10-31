import type { Food } from './types'

/**
 * The foods the dinner offers, each with the doneness preferences a guest
 * can pick. Single source of truth for GET /api/foods and for validating
 * the food a client PUTs onto a fork.
 */
export const FOOD_CATALOG: Food[] = [
    {
        foodId: 'beef',
        foodName: 'Beef',
        prefs: [
            { id: 'rare', name: 'Rare' },
            { id: 'medium', name: 'Medium' },
            { id: 'well', name: 'Well done' },
        ],
    },
    {
        foodId: 'chicken',
        foodName: 'Chicken',
        prefs: [
            { id: 'cooked', name: 'Fully cooked' },
            { id: 'crispy', name: 'Extra crispy' },
        ],
    },
    {
        foodId: 'bread',
        foodName: 'Bread',
        prefs: [
            { id: 'toasted', name: 'Lightly toasted' },
            { id: 'golden', name: 'Golden' },
            { id: 'crunchy', name: 'Crunchy' },
        ],
    },
    {
        foodId: 'mushroom',
        foodName: 'Mushroom',
        prefs: [
            { id: 'firm', name: 'Firm' },
            { id: 'soft', name: 'Soft' },
        ],
    },
    {
        foodId: 'pineapple',
        foodName: 'Pineapple',
        prefs: [
            { id: 'warm', name: 'Warm' },
            { id: 'caramelized', name: 'Caramelized' },
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
