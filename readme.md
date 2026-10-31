# ---INSERT PROJECT NAME---

A short, clear description of what your project does and who it helps.

## The Problem

Everyday people fight with overcooked Fondue Chinoise meat or worse: get food poisoning eating an undercooked one. Aside
from health hazards and potential food waste, friendships get destroyed and Christmas is ruined for families in all
parts of Switzerland.

## Our Solution

Our solution is simple and non-intrusive. Achieving high accuracy in predicting when YOUR piece of meat is done.

## Demo

- **Live demo:** [Add link]
- **Screenshots:** Add images here

## Features

- Feature Gabel Detection
- Feature Meat Doneness Algorithm
- Feature XYZ

## Tech Stack

- **Frontend:**
    - React (Typescript)
    - Vite
    - ESLint
    - Tailwind
- **Backend:**
    - Python
    - Express Server (NodeJS, Typescript)
- **Tools/API:**
    - Raspberry PI
    - Temperature Sensor (Shelly, DS18B20)
    - PI-Camera (V3)
- **Infrastructure:**
    - Docker
    - Github Actions
    - Kubernetes

## Getting Started

### Prerequisites

- Python >=3.11
- [Any accounts, API keys, or services needed]

### Installation Local

#### Fonduend

```bash
git clone https://github.com/FodHod/FondueTracker.git
cd FondueTracker
```

Run `npm install` in both `code/fronduend` and `code/api` directories. The frontend dev server (vite) is configured to
proxy `/api` requests to the backend.
So all you need to do is launch the API server:

```bash
cd code/api
npm run dev
```

Then switch to the frontend folder and do the same:

```bash
cd code/fronduend
npm run dev
```

You may open the dev server on the displayed URL (usually http://localhost:5173/). Notice that you can reach both the
frontend routes and the API (via /api/...) from this server.

#### Beefend

Set up the venv on the pi:

```
rm -rf .venv/ (if it exists already)
uv venv --python /usr/bin/python3 --system-site-packages
uv sync
uv run main.py picam
```

For testing run

```
while true; do nc -l 8000; echo; done
```
