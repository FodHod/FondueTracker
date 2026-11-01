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
    food: Food | null;
    userName: string | null;
    foodPrefs: FoodPrefChoice[] | null;
    progress: number;
    color: string;
    inPot: boolean;
}
