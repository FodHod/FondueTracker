import type {Fork} from "../api/types.ts";
import {useEffect, useState} from "react";
import api from "../api/api.ts";
import {Link} from "react-router-dom";

export default function Index() {
    const [forks, setForks] = useState<Fork[]>([])

    const updateForkProgress = () => {
        api.getForks().then(res => setForks(res.data))
    }

    useEffect(() => {
        setInterval(updateForkProgress, 1000);
    }, [])

    return <>
        <h1>Hee hee</h1>
        <Link to={"/new-fork"}>
            <button>Join dinner</button>
        </Link>
        {forks.map(fork => fork.userName && <div key={fork.id}>
            <h2 style={{color: fork.color}}>
                {fork.userName} – {Math.floor(fork.progress * 100)}%
            </h2>
        </div>)}
    </>;
}