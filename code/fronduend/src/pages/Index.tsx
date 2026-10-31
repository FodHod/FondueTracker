import type {Food, Fork} from "../api/types.ts";
import {useEffect, useState} from "react";
import api from "../api/api.ts";
import logo from "../assets/images/caquelon-logo.png";
import MeatSelection from "../components/MeatSelection.tsx";

function getForkQuip(progressPct: number) {
    if (progressPct <= 0) return "Chilling outside the pot ";
    if (progressPct < 30) return "Just dipped! Barely warm ";
    if (progressPct < 70) return "Getting nice & sizzly... ";
    if (progressPct < 100) return "Almost ready! Open wide ";
    return "DONE!!rescue your meat NOW!";
}


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
    const activeForks = forks.filter(fork => fork.userName);

    return (
        <main className="mx-auto max-w-md px-4 pt-6 pb-8">
            <header className="mb-6 flex flex-col items-center text-center">
                <img
                    src={logo}
                    alt="Fondue Tracker"
                    className="animate-float h-36 w-auto object-contain"
                />
                <p className="mt-1 inline-block -rotate-1 rounded-full border-2 border-text-main bg-tertiary px-3 py-0.5 text-xs font-semibold shadow-[2px_2px_0px_#3D2D23]">
                    Live Caquelon Surveillance
                </p>
            </header>

            {activeForks.length === 0 ? (
                <div className="cartoon-card p-6 text-center">
                    <p className="text-xl font-bold">The pot is lonely!</p>
                    <p className="mt-1 text-sm text-text-muted">
                        No forks claimed yet. Tap <strong>Add Fork</strong> below to join the feast!
                    </p>
                </div>
            ) : (
                <div className="flex flex-col gap-4">
                    {activeForks.map(fork => {
                        const pct = Math.min(100, Math.max(0, Math.floor(fork.progress * 100)));
                        const isDone = pct >= 100;
                        const forkColor = fork.color || "var(--color-primary)";

                        return (
                            <div
                                key={fork.id}
                                className={`cartoon-card p-4 transition-transform ${
                                    isDone ? "animate-wiggle bg-tertiary/25" : ""
                                }`}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2.5">
                                        <span
                                            className="inline-block h-5 w-5 rounded-full border-2 border-text-main shadow-[1px_1px_0px_#3D2D23]"
                                            style={{backgroundColor: forkColor}}
                                        />
                                        <h2 className="text-lg font-bold leading-tight">
                                            {fork.userName}
                                        </h2>
                                    </div>
                                    <span
                                        className="rounded-full border-2 border-text-main px-2.5 py-0.5 text-sm font-bold shadow-[2px_2px_0px_#3D2D23]"
                                        style={{backgroundColor: forkColor, color: "#3D2D23"}}
                                    >
                                        {pct}%
                                    </span>
                                </div>

                                <div className="mt-3 h-4 w-full overflow-hidden rounded-full border-2 border-text-main bg-bg">
                                    <div
                                        className="h-full transition-all duration-500 ease-out"
                                        style={{
                                            width: `${pct}%`,
                                            backgroundColor: forkColor,
                                        }}
                                    />
                                </div>

                                <p className="mt-2 text-xs font-medium text-text-muted">
                                    {getForkQuip(pct)}
                                    {fork.food?.foodName ? ` • Cooking ${fork.food.foodName}` : ""}
                                </p>
                            </div>
                        );
                    })}
                </div>
            )}
        </main>
    );
}