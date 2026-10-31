import type {Fork} from "../api/types.ts";
import {useEffect, useState} from "react";
import api from "../api/api.ts";

export default function Index() {
    const [forks, setForks] = useState<Fork[]>([])

    useEffect(() => {
        api.getForks().then(res => setForks(res.data))
    }, [])

    return <>
        <h1>Hee hee</h1>
        {forks.map(fork => fork.userName && <div key={fork.id}>
            <h2 style={{color: fork.color}}>
                {fork.userName} – {Math.floor(fork.progress * 100)}%
            </h2>
        </div>)}
    </>;
}