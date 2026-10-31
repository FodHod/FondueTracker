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
        }).catch(() => {
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
            food: null,
            progress: 0,
            color: "",
        }).then(() => {
            navigate("/")
        })
    }

    return (
        <main className="mx-auto max-w-md px-4 pt-6 pb-8">
            <header className="mb-6 text-center">
                <span className="inline-block rotate-2 rounded-full border-2 border-text-main bg-secondary px-3 py-0.5 text-xs font-bold shadow-[2px_2px_0px_#3D2D23]">
                    New Challenger Approaches! ️
                </span>
                <h1 className="mt-2 text-3xl font-bold">Claim Your Fork 🍴</h1>
                <p className="text-sm text-text-muted">
                    Pick a weapon & tell the pot how you like your bites cooked.
                </p>
            </header>

            <form onSubmit={onSubmit} className="flex flex-col gap-5">
                <div className="cartoon-card p-4">
                    <label className="mb-1.5 block text-sm font-bold">
                        1. Who's holding this fork?
                    </label>
                    <input
                        type={"text"}
                        value={form.userName}
                        placeholder={"e.g. Sir Dips-a-Lot"}
                        required
                        className="w-full rounded-xl border-2 border-text-main bg-bg px-3.5 py-2 font-medium placeholder:text-text-muted/70 focus:bg-white focus:outline-none"
                        onChange={e => setForm(prev => ({
                            ...prev,
                            userName: e.target.value
                        }))}
                    />
                </div>

                <div className="cartoon-card p-4">
                    <h2 className="mb-1 text-base font-bold">
                        2. How crispy/melty do you like it?
                    </h2>
                    <p className="mb-3 text-xs text-text-muted">
                        Choose your doneness level for each food:
                    </p>
                    <div className="flex flex-col gap-3">
                        {foods.map(food => {
                            const selectedPref = form.foodPrefs.find(p => p.foodId === food.foodId)?.prefId;
                            return (
                                <fieldset key={food.foodId} className="rounded-xl border-2 border-border bg-bg/60 p-3">
                                    <h3 className="mb-2 text-sm font-bold">{food.foodName}</h3>
                                    <div className="flex flex-wrap gap-2">
                                        {food.prefs.map(pref => {
                                            const isSelected = selectedPref === pref.id;
                                            return (
                                                <label
                                                    key={pref.id}
                                                    className={`cursor-pointer rounded-full border-2 border-text-main px-3 py-1 text-xs font-semibold transition-all ${
                                                        isSelected
                                                            ? "bg-tertiary shadow-[2px_2px_0px_#3D2D23] -translate-y-0.5"
                                                            : "bg-white opacity-80 hover:opacity-100"
                                                    }`}
                                                >
                                                    <input
                                                        type={"radio"}
                                                        name={food.foodId}
                                                        value={pref.id}
                                                        onChange={changeFoodPref}
                                                        className="sr-only"
                                                    />
                                                    {pref.name}
                                                </label>
                                            );
                                        })}
                                    </div>
                                </fieldset>
                            );
                        })}
                    </div>
                </div>

                <div className="cartoon-card p-4">
                    <h2 className="mb-2 text-base font-bold">
                        3. Pick your fork
                    </h2>
                    <div className="grid grid-cols-2 gap-2.5">
                        {forks.map(fork => {
                            const isSelected = form.forkId === fork.id;
                            return (
                                <label
                                    key={fork.id}
                                    className={`flex cursor-pointer items-center gap-2 rounded-xl border-2 border-text-main px-3 py-2 text-sm font-semibold transition-all ${
                                        isSelected
                                            ? "bg-secondary shadow-[3px_3px_0px_#3D2D23] -translate-y-0.5"
                                            : "bg-bg hover:bg-white"
                                    }`}
                                >
                                    <input
                                        type={"radio"}
                                        name={"fork"}
                                        value={fork.id}
                                        onChange={e => setForm(prev => ({
                                            ...prev,
                                            forkId: e.target.value
                                        }))}
                                        className="sr-only"
                                    />
                                    <span
                                        className="inline-block h-4 w-4 shrink-0 rounded-full border-2 border-text-main"
                                        style={{backgroundColor: fork.color || "var(--color-primary)"}}
                                    />
                                    <span className="truncate">Fork #{fork.id}</span>
                                </label>
                            );
                        })}
                    </div>
                </div>

                <button
                    type={"submit"}
                    className="cartoon-button w-full rounded-2xl bg-primary py-3 text-lg font-bold text-text-main"
                >
                    Dive Into The Pot!
                </button>
            </form>
        </main>
    );
}
