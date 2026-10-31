
export type FoodPreference = {
    id: string;
    name: string;
}

export type Food = {
    foodId: string;
    foodName: string;
    prefs: FoodPreference[];
}

export type FoodPrefChoice = {
    foodId: string;
    prefId: string;
}

export type Fork = {
    id: string;
    dinnerId: string;
    food: Food | null;
    userName: string | null;
    userId: string | null;
    foodPrefs: FoodPrefChoice[] | null;
    progress: number;
    color: string;
}

/**
 * A fork as listed by GET /api/forks: the stored fork plus `inPot`, the pot
 * sensor's latest word on whether the fork is currently in the pot (false
 * when the sensor has never reported the fork).
 */
export type ForkListItem = Fork & {
    inPot: boolean;
}

export type ForkState = {
    id: number;
    in_pot: boolean;
}

export type SensorMeasurement = {
    time: number;
    temperature: number;
    tags: ForkState[];
}

