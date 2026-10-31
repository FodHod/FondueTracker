import type { FoodPrefChoice } from '../src/types'

/**
 * A valid claim-time preference set: one chosen doneness per catalog food,
 * in catalog order.
 */
export function fullFoodPrefs(): FoodPrefChoice[] {
    return [
        { foodId: 'beef', prefId: 'rare' },
        { foodId: 'lamb', prefId: 'medium-rare' },
        { foodId: 'veal', prefId: 'medium' },
        { foodId: 'pork', prefId: 'fully-cooked' },
        { foodId: 'chicken', prefId: 'fully-cooked' },
        { foodId: 'turkey', prefId: 'fully-cooked' },
    ]
}
