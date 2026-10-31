import {useEffect, useState} from "react";
import type {Food} from "../api/types.ts";
import api from "../api/api.ts";

export default function MeatSelection({select}: { select: (food: Food) => void }) {
    const [foods, setFoods] = useState<Food[]>([]);

    useEffect(() => {
        api.getFoods().then(res => {
            setFoods(res.data);
        })
    }, [])

    return foods.map(food => <label key={food.foodId}>
        <input
            type={"radio"}
            name={"food"}
            onChange={() => select(food)}
        />
        {food.foodName}
        <br/>
    </label>)
}