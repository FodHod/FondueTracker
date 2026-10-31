import type { FoodPrefChoice } from '../src/types'

/**
 * A valid claim-time preference set: one chosen doneness per catalog food,
 * in catalog order.
 */
export function fullFoodPrefs(): FoodPrefChoice[] {
    return [
        { foodId: 'beef', prefId: 'rare' },
        { foodId: 'chicken', prefId: 'cooked' },
        { foodId: 'bread', prefId: 'toasted' },
        { foodId: 'mushroom', prefId: 'firm' },
        { foodId: 'pineapple', prefId: 'warm' },
    ]
}
