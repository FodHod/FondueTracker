export type Food = {
    foodId: string;
    foodName: string;
    prefs: FoodPreference[];
}

export type Fork = {
    id: string;
    food: Food;
    userName: string;
    progress: number;
    color: string;
}

type FoodPreference = {
    id: string;
    name: string;
}