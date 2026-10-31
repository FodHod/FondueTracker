import axios from "axios";
import type {Food, Fork} from "./types.ts";

function getForks() {
    return axios.get<Fork[]>("/forks");
}

function getFoods() {
    return axios.get<Food>("/foods");
}

// TODO: was kommt hier zurück?
function postFork(fork: Fork) {
    return axios.post("/forks", fork)
}

export default {
    getForks,
    getFoods,
    postFork
}