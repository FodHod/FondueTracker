import axios from "axios";
import type {Food, Fork} from "./types.ts";

function getForks() {
    return axios.get<Fork[]>("/api/forks");
}

function getFoods() {
    return axios.get<Food[]>("/api/foods");
}

// TODO: was kommt hier zurück?
function postFork(fork: Fork) {
    return axios.post("/api/forks", fork);
}

function getMyFork() {
    return axios.get<Fork>("/api/forks/mine");
}

function updateFork(fork: Fork) {
    return axios.put("/api/forks", fork)
}

function leavePot() {
    return axios.post("/api/forks/leave")
}

export default {
    getForks,
    getFoods,
    postFork,
    getMyFork,
    updateFork,
    leavePot
}