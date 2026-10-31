import * as React from "react";
import {useEffect, useState} from "react";
import type {Food, FoodPrefChoice, Fork} from "../api/types.ts";
import api from "../api/api.ts";
import {useNavigate} from "react-router-dom";

type NewForkForm = {
    forkId: string;
    userName: string;
    foodPrefs: FoodPrefChoice[]
}

export default function NewFork() {
    const navigate = useNavigate();
    const [form, setForm] = useState<NewForkForm>({
        forkId: "",
        userName: "",
        foodPrefs: []
    });

    const [foods, setFoods] = useState<Food[]>([]);
    const [forks, setForks] = useState<Fork[]>([]);

    useEffect(() => {
        api.getMyFork().then(res => {
            if (res.data.userName) navigate("/");
        })

        api.getFoods().then(res => {
            setFoods(res.data);
        })

        api.getForks().then(res => {
            setForks(res.data)
        })
    }, [])

    const changeFoodPref: React.ChangeEventHandler<HTMLInputElement> = e => {
        const prefId = e.target.value;
        const foodId = e.target.name;

        setForm(prev => {
            const exists = prev.foodPrefs.some(pref => pref.foodId == foodId);

            return {
                ...prev,
                foodPrefs: exists
                    ? prev.foodPrefs.map(pref =>
                        pref.foodId == foodId ? {prefId, foodId} : pref
                    )
                    : [...prev.foodPrefs, {prefId, foodId}]
            }
        })
    }

    const onSubmit: React.SubmitEventHandler<HTMLFormElement> = (e) => {
        e.preventDefault();
        api.postFork({
            id: form.forkId,
            userName: form.userName,
            foodPrefs: form.foodPrefs,
            food: undefined,
            progress: 0,
            color: "",
        }).then(() => {
            navigate("/")
        })
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
                        <input
                            type={"radio"}
                            name={food.foodId}
                            value={pref.id}
                            onChange={changeFoodPref}
                        />
                        {pref.name}
                    </label>
                )}
            </fieldset>)}
            <h2>Choose fork</h2>
            {forks.map(fork => <label key={fork.id}>
                <input
                    type={"radio"}
                    name={"fork"}
                    value={fork.id}
                    onChange={e => setForm(prev => ({
                        ...prev,
                        forkId: e.target.value
                    }))}
                />
                {fork.id}
            </label>)}
            <input type={"submit"} value={"Choose Fork"}/>
        </form>
    </>
}