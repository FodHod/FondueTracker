import type {Food, Fork} from "../api/types.ts";
import {useEffect, useState} from "react";
import api from "../api/api.ts";
import MeatSelection from "../components/MeatSelection.tsx";

export default function Index() {
    const [forks, setForks] = useState<Fork[]>([])

    const updateForkProgress = () => {
        api.getForks().then(res => setForks(res.data))
    }

    useEffect(() => {
        updateForkProgress()
        setInterval(updateForkProgress, 1000);
    }, [])

    const selectFood = (fork: Fork) => (food: Food): void => {
        api.updateFork({
            ...fork,
            food: food
        }).then(console.log)
    }

    return <>
        <h1>Hee hee</h1>
        {forks.map((fork, i) => fork.userName && <div key={fork.id}>
            <h2 style={{color: fork.color}}>
                {fork.userName} – {Math.floor(fork.progress * 100)}%
            </h2>
            {i == 0 && <MeatSelection select={selectFood(fork)}/>}
        </div>)}
    </>;
}