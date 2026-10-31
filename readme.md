# Fond(of)u(e)

Enjoy your Fondue Chinoise without worrying about cooking times! Our smart cooking assistant combines camera
recognition, temperature monitoring and individual cooking timers to help everyone get their meat PERFECT. While the
technology takes care of the details, you can focus on what really matters: enjoying a great meal together!

## The Problem

Everyday people fight with overcooked Fondue Chinoise meat or worse: get food poisoning eating an undercooked one. Aside
from health hazards and potential food waste, friendships get destroyed and Christmas is ruined for families in all
parts of Switzerland.

## Our Solution

Our solution is simple and non-intrusive. Achieving high accuracy in predicting when YOUR piece of meat is done.

## Demo

- **Live demo:** [https://fonduetracker.rovner.ch/](Link)

## Features

- Gabel Detection
- Meat Doneness Algorithm
- Non-intrusive Progress Display

## Tech Stack

- **Frontend:** aka Fonduend
    - React (Typescript)
    - Vite
    - ESLint
    - Tailwind
- **Backend:** aka Beefend
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
