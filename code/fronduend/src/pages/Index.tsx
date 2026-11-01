import type {Fork} from "../api/types.ts";
import {useEffect, useState} from "react";
import api from "../api/api.ts";
import logo from "../assets/images/caquelon-logo.png";

function getForkQuip(progressPct: number, inPot: boolean, isOvercooked: boolean) {
    if (isOvercooked) return "Overcooking! Pull it out now!";
    if (!inPot && progressPct <= 0) return "Chilling outside the pot";
    if (progressPct <= 0) return "Just dipped in the pot";
    if (progressPct < 30) return "Just dipped! Barely warm";
    if (progressPct < 70) return "Getting nice & sizzly...";
    if (progressPct < 100) return "Almost ready! Open wide";
    return "Done! Ready to eat";
}

function getContrastTextColor(bgColor: string): string {
    const hex = bgColor.trim().replace("#", "");
    if (!/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(hex)) {
        return "#3D2D23";
    }
    const fullHex = hex.length === 3
        ? hex.split("").map(c => c + c).join("")
        : hex;
    const r = parseInt(fullHex.slice(0, 2), 16);
    const g = parseInt(fullHex.slice(2, 4), 16);
    const b = parseInt(fullHex.slice(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.52 ? "#FFF9EF" : "#3D2D23";
}

export default function Index() {
    const [forks, setForks] = useState<Fork[]>([])
    const [myFork, setMyFork] = useState<Fork | undefined>(undefined)

    const updateForkProgress = () => {
        api.getForks().then(res => setForks(res.data))
        api.getMyFork()
            .then(res => setMyFork(res.data?.userName ? res.data : undefined))
            .catch(() => setMyFork(undefined))
    }

    useEffect(() => {
        updateForkProgress();
        const interval = setInterval(updateForkProgress, 1000);
        return () => clearInterval(interval);
    }, [])

    const activeForks = forks
        .filter(fork => fork.userName && fork.inPot)
        .sort((a, b) => b.progress - a.progress);

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
                {myFork?.userName && (
                    <p
                        className="mt-3 rounded-full border-2 border-text-main px-3 py-1 text-sm font-bold shadow-[2px_2px_0px_#3D2D23]"
                        style={{
                            backgroundColor: myFork.color || "#F08E76",
                            color: getContrastTextColor(myFork.color || "#F08E76"),
                        }}
                    >
                        {myFork.userName}
                    </p>
                )}
            </header>

            {activeForks.length === 0 ? (
                <div className="cartoon-card p-6 text-center">
                    <p className="text-xl font-bold">The pot is lonely!</p>
                    <p className="mt-1 text-sm text-text-muted">
                        {myFork
                            ? <span>Put your fork in the pot!</span>
                            : <span>No forks claimed yet. Tap <strong>Add Fork</strong>  below to join the feast!</span>
                        }
                    </p>
                </div>
            ) : (
                <div className="flex flex-col gap-4">
                    {activeForks.map(fork => {
                        const rawPct = Math.floor(fork.progress * 100);
                        const pct = Math.min(100, Math.max(0, rawPct));
                        const isOvercooked = fork.progress > 1;
                        const isDone = pct >= 100 && !isOvercooked;
                        const forkColor = fork.color || "#F08E76";
                        const badgeTextColor = isOvercooked ? "#FFF9EF" : getContrastTextColor(forkColor);

                        return (
                            <div
                                key={fork.id}
                                className={`cartoon-card relative p-4 transition-transform ${
                                    isOvercooked
                                        ? "animate-sizzle bg-primary/20"
                                        : isDone
                                            ? "animate-wiggle bg-green/20"
                                            : ""
                                }`}
                            >
                                {isOvercooked && (
                                    <div className="pointer-events-none absolute -top-3 right-6 flex gap-1.5">
                                        <span
                                            className="smoke-puff h-3 w-3 rounded-full border-2 border-text-main bg-border"/>
                                        <span
                                            className="smoke-puff-delay-1 h-4 w-4 rounded-full border-2 border-text-main bg-border"/>
                                        <span
                                            className="smoke-puff-delay-2 h-2.5 w-2.5 rounded-full border-2 border-text-main bg-border"/>
                                    </div>
                                )}

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
                                        style={{
                                            backgroundColor: isOvercooked ? "var(--color-text-main)" : forkColor,
                                            color: badgeTextColor,
                                        }}
                                    >
                                        {isOvercooked ? "OVERCOOKED" : `${pct}%`}
                                    </span>
                                </div>

                                <div
                                    className="mt-3 h-4 w-full overflow-hidden rounded-full border-2 border-text-main bg-bg">
                                    <div
                                        className={`h-full transition-all duration-1000 ease-linear ${
                                            isOvercooked ? "overcooked-bar" : ""
                                        }`}
                                        style={{
                                            width: `${pct}%`,
                                            backgroundColor: isOvercooked ? undefined : forkColor,
                                        }}
                                    />
                                </div>

                                <p className={`mt-2 text-xs font-medium ${isOvercooked ? "font-bold text-text-main" : "text-text-muted"}`}>
                                    {getForkQuip(pct, fork.inPot, isOvercooked)}
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
