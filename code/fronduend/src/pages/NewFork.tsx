import * as React from "react";
import {useEffect, useState} from "react";
import type {Food, FoodPrefChoice, Fork} from "../api/types.ts";
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
    const [forks, setForks] = useState<Fork[]>([]);

    useEffect(() => {
        api.getFoods().then(res => {
            setFoods(res.data);
        })

        api.getForks().then(res => {
            setForks(res.data)
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
                placeholder={"Username"}
                required
                onChange={e => setForm(prev => ({
                    ...prev,
                    userName: e.target.value
                }))}
            />
            <h2>Food preferences</h2>
            {foods.map(food => <fieldset key={food.foodId}>
                <h3>{food.foodName}</h3>
                {food.prefs.map(pref => <label key={pref.id}>
                        <input type={"radio"} name={food.foodName} value={pref.id}/>
                        {pref.name}
                    </label>
                )}
            </fieldset>)}
            <h2>Choose fork</h2>
            {forks.map(fork => <label key={fork.id}>
                <input type={"radio"} name={"fork"} value={fork.id}/>
                {fork.id}
            </label>)}
        </form>
    </>
}