import * as React from "react";
import {useEffect, useState} from "react";
import type {Food, FoodPrefChoice} from "../api/types.ts";
import api from "../api/api.ts";

type NewForkForm = {
    id: string;
    userName: string;
    foodPrefs: FoodPrefChoice[]
}

export default function NewFork() {

    const [form, setForm] = useState<NewForkForm>({
        id: "",
        userName: "",
        foodPrefs: []
    });

    const [foods, setFoods] = useState<Food[]>([]);

    useEffect(() => {
        api.getFoods().then(res => {
            setFoods(res.data);
        })
    }, [])

    const onSubmit: React.SubmitEventHandler<HTMLFormElement> = (e) => {
        e.preventDefault();
        api.postFork({
            id: form.id,
            userName: form.userName,
            foodPrefs: form.foodPrefs,
            food: undefined,
            progress: 0,
            color: "",
        }).then(console.log)
    }

    return <>
        <form onSubmit={onSubmit}>
            <input
                type={"text"}
                value={form.userName}
                required
                onChange={e => setForm(prev => ({
                    ...prev,
                    userName: e.target.value
                }))}
            />
            {foods.map(food => <div>
                <h3>{food.foodName}</h3>
                <ul>
                    {food.prefs.map(pref => <li>{pref.name}</li>)}
                </ul>
            </div>)}
        </form>
    </>
}