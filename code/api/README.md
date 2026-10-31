# FondueTracker API

Express API that tracks a shared fondue dinner: who holds which fork, what food is
on it, and — by joining the forks with the pot sensor's measurement log — how done
that food is. State is in-memory (one dinner, reset on restart/redeploy); users are
identified by an opaque session cookie.

## Entities

**Fork** — one of the dinner's forks, seeded at boot (`FORK_COUNT`, default 8).

| Field      | Type                | Meaning                                           |
| ---------- | ------------------- | ------------------------------------------------- |
| `id`       | string              | Stable id, `fork-1` .. `fork-8`                   |
| `dinnerId` | string              | Always `"default"` in v1 (dinner rooms come later)|
| `food`     | Food \| null        | What is skewered; `null` = nothing on it          |
| `userName` | string \| null      | Holder's display name; `null` = unclaimed         |
| `userId`   | string \| null      | Holder's session id; `null` = unclaimed           |
| `foodPrefs`| FoodPrefChoice[] \| null | The holder's doneness choice per food; `null` = unclaimed |
| `progress` | number              | Cooking progress; `1` = safe to eat, `2` = too late |
| `color`    | string              | Fixed palette color for the UI                    |

A fork whose `userId`/`userName` are `null` is unclaimed and available.

**Food** — `{ foodId, foodName, prefs }`: one entry per food the dinner offers.

**FoodPreference** — `{ id, name }`: the doneness variants of a food
(e.g. beef: rare / medium-rare / medium / medium-well / well-done).

**FoodPrefChoice** — `{ foodId, prefId }`: a guest's chosen doneness for one
food type. Every guest declares exactly one choice per food when claiming and
can revise them later; the full set rides on their fork in every response.

**SensorMeasurement** — `{ time, temperature, tags }`: one pot-sensor report.
`time` is epoch seconds, `temperature` the pot temperature, and `tags` the
fork tags currently in the pot — `{ id, in_pot }`, the device's wire format
and the API's one snake_case exception.

**User** — has no entity of its own: the `_session` cookie (opaque UUID, HttpOnly)
is the identity. A `userId` in a request body is always ignored.

## API

All endpoints are under `/api` and issue a `_session` cookie on first contact.
Responses are JSON; errors are `{ "error": "message" }`.

### GET /api/foods

The food catalog — the single source of truth for the UI pickers and for the
validation of what can go on a fork. Its foods and preference ids mirror the
doneness tables in `src/fondue-math.ts`, so every claimable combination has
a progress model behind it.

### GET /api/forks

All forks of the dinner as a `Fork[]`, claimed or not. The fork the session
user holds (if any) comes first; the rest follow in id order. Each claimed
fork carries its holder's `foodPrefs` — the exhaustive one-choice-per-food
set, in catalog order. Unclaimed forks have `foodPrefs: null`.

This is the only endpoint that computes `progress`. For a claimed fork with
food on it, the API finds the fork tag's most recent in/out flip in the
sensor log — the moment it last entered or left the pot — and compares the
time since that flip with the estimated dipping window for the food and
the holder's chosen doneness (`src/fondue-math.ts`; the broth temperature
is hardcoded to 90 °C and does not affect the estimate yet). `progress`
ramps linearly from `0` to `1`, reaching `1.0` — done, safe to eat — at
the earliest estimated take-out moment, holds `1.0` through the rest of
the window, and flips to `2` ("too late") once the latest estimate is
exceeded. It is `0` when there is nothing to track — an unclaimed fork,
or no flip for it in the log — and the other fork responses (`POST`,
`PUT`, `/mine`) return the stored value, which is always `0`.

Known issues in the current progress model:

- The flip used as the cooking start is the most recent one even when the
  fork has left the pot: time out of the pot keeps accruing toward `2`.

### POST /api/forks

Claim a fork, declaring your doneness preference for every food:

```json
{
  "id": "fork-1",
  "userName": "Alice",
  "foodPrefs": [
    { "foodId": "beef", "prefId": "rare" },
    { "foodId": "lamb", "prefId": "medium-rare" },
    { "foodId": "veal", "prefId": "medium" },
    { "foodId": "pork", "prefId": "fully-cooked" },
    { "foodId": "chicken", "prefId": "fully-cooked" },
    { "foodId": "turkey", "prefId": "fully-cooked" }
  ]
}
```

Claims are one-shot and limited to one fork per guest:

- `404` unknown fork
- `409` the fork is already claimed (even by you), or you already hold a fork
- `400` missing `id`; `userName` missing/blank/longer than 30 characters
  (trimmed first); `foodPrefs` missing, not exactly one record per food,
  duplicated, or carrying a `prefId` outside that food's catalog preferences

`userName` is a non-unique display name and cannot be changed after claiming.

### PUT /api/forks

Update the food and/or your food preferences of a fork you hold:

```json
{
  "id": "fork-1",
  "food": { "foodId": "beef" },
  "foodPrefs": [ { "foodId": "beef", "prefId": "medium" } ]
}
```

`"food": null` clears the fork. Only `food.foodId` is read — the food is
re-hydrated from the catalog, so `foodName`/`prefs` sent by the client are
ignored. Incoming `foodPrefs` records are merged by `foodId`: send only the
foods you want to change; the others keep their stored preference. The whole
request is validated before anything is applied, so a `400` changes nothing.
Fields other than `id`, `food`, and `foodPrefs` are ignored; a PUT carrying
neither is rejected.

- `403` you do not hold this fork (unclaimed forks included)
- `404` unknown fork
- `400` missing `id`, malformed `food`, unknown `foodId`, malformed or invalid
  `foodPrefs`, or an empty PUT

There is deliberately no release or rename endpoint in v1: a claimed fork stays
claimed until the process restarts.

### POST /api/sensor/:dinnerId

The device endpoint — the pot sensor reports a measurement for the dinner
named in the path (the frontend's four endpoints are unaffected):

```json
{
  "time": 1793443169.0806723,
  "temperature": 27,
  "tags": [ { "id": 7, "in_pot": true } ]
}
```

`time` and `temperature` must be numbers, `tags` an array of `{ id, in_pot }`
records (possibly empty); extra fields are ignored. The measurement is
appended to that dinner's in-memory log — `GET /api/forks` reads it to time
each fork's dips — and it resets with the process. Responds `201` with the
stored measurement.

Requests must carry `Authorization: Bearer <token>`. The expected token comes
from the `SENSOR_TOKEN` environment variable — in the cluster, mounted from
the `sensor-token` secret (`token` key; create it with
`kubectl -n fonduetracker create secret generic sensor-token
--from-literal=token=<token>`) — and is compared in constant time. With no
token configured the endpoint rejects every request (fail-closed). No session
is required: the sensor may simply ignore the `_session` cookie the API offers.

## Trying it with curl

With the dev server running (`npm run dev`), the cookie jar plays the role of the
browser: `-c cookies.txt` stores the `_session` cookie on first contact and
`-b cookies.txt` sends it back on every request. The jar is your identity — a
fresh jar is a new guest, and losing it orphans your fork. Use both together
(`-b cookies.txt -c cookies.txt`) on every call after the first: a bare `-c`
starts a new session and overwrites the jar, silently turning you into a
different guest.

The walkthrough picks the first unclaimed fork, so it works even on a dinner
with leftovers — claims are one-shot and there is no release endpoint, so a
hardcoded fork would collide with earlier runs. When no fork is free, restart
the API: the dinner is in-memory and resets with the process. Adjust the port
if your server runs elsewhere; a jar saved against one instance does not work
against another — the claim simply does not exist there.

```sh
# Pick the first unclaimed fork.
FORK=$(curl -s http://localhost:8082/api/forks \
  | jq -r '[.[] | select(.userId == null)][0].id')

# First contact: stores your session cookie in the jar.
curl -s -c cookies.txt http://localhost:8082/api/forks | jq

# Claim the fork as Alice, declaring a doneness preference for every food.
CLAIM=$(jq -nc --arg id "$FORK" '{id: $id, userName: "Alice", foodPrefs: [
  {foodId: "beef", prefId: "rare"},
  {foodId: "lamb", prefId: "medium-rare"},
  {foodId: "veal", prefId: "medium"},
  {foodId: "pork", prefId: "fully-cooked"},
  {foodId: "chicken", prefId: "fully-cooked"},
  {foodId: "turkey", prefId: "fully-cooked"}]}')
curl -s -b cookies.txt -c cookies.txt -X POST http://localhost:8082/api/forks \
  -H 'Content-Type: application/json' -d "$CLAIM" | jq

# List again — your own fork comes first, foodPrefs on every claimed fork.
curl -s -b cookies.txt -c cookies.txt http://localhost:8082/api/forks | jq

# Put beef on your fork (only food.foodId is read).
curl -s -b cookies.txt -c cookies.txt -X PUT http://localhost:8082/api/forks \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg id "$FORK" '{id: $id, food: {foodId: "beef"}}')" | jq

# Change your mind about beef doneness (merged by foodId; other foods untouched).
curl -s -b cookies.txt -c cookies.txt -X PUT http://localhost:8082/api/forks \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg id "$FORK" '{id: $id, foodPrefs: [{foodId: "beef", prefId: "medium"}]}')" | jq

# Take the food off again.
curl -s -b cookies.txt -c cookies.txt -X PUT http://localhost:8082/api/forks \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg id "$FORK" '{id: $id, food: null}')" | jq

# Show just my fork
curl -s -b cookies.txt -c cookies.txt http://localhost:8082/api/forks/mine

# The food catalog (no cookie needed).
curl -s http://localhost:8082/api/foods | jq

# Without the jar you are a different guest: someone else's fork -> 409.
curl -s -X POST http://localhost:8082/api/forks \
  -H 'Content-Type: application/json' -d "$CLAIM" | jq
```

## Development

```sh
npm install
npm run dev        # tsx watch (default port 8080)
npm test           # vitest + supertest
npm run typecheck  # tsc --noEmit
```

Environment: `PORT` (default 8080), `FORK_COUNT` (default 8), `SENSOR_TOKEN`
(the sensor endpoint's bearer token; unset = the endpoint rejects everything),
and `NODE_ENV=production` (adds the `Secure` attribute to the cookie — set in
the k8s deployment, which mounts `SENSOR_TOKEN` from the `sensor-token`
secret).

The frontend dev server proxies `/api` to this API, so cookies behave the same
in development as in production.
