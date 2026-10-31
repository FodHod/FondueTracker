# FondueTracker API

Express API that tracks a shared fondue dinner: who holds which fork and what food is
on it. State is in-memory (one dinner, reset on restart/redeploy); users are identified
by an opaque session cookie.

## Entities

**Fork** — one of the dinner's forks, seeded at boot (`FORK_COUNT`, default 8).

| Field      | Type                | Meaning                                           |
| ---------- | ------------------- | ------------------------------------------------- |
| `id`       | string              | Stable id, `fork-1` .. `fork-8`                   |
| `dinnerId` | string              | Always `"default"` in v1 (dinner rooms come later)|
| `food`     | Food \| null        | What is skewered; `null` = nothing on it          |
| `userName` | string \| null      | Holder's display name; `null` = unclaimed         |
| `userId`   | string \| null      | Holder's session id; `null` = unclaimed           |
| `progress` | number              | Reserved for doneness tracking; always `0` in v1 |
| `color`    | string              | Fixed palette color for the UI                    |

A fork whose `userId`/`userName` are `null` is unclaimed and available.

**Food** — `{ foodId, foodName, prefs }`: one entry per food the dinner offers.

**FoodPreference** — `{ id, name }`: the doneness variants of a food
(e.g. beef: rare / medium / well done).

**User** — has no entity of its own: the `_session` cookie (opaque UUID, HttpOnly)
is the identity. A `userId` in a request body is always ignored.

## API

All endpoints are under `/api` and issue a `_session` cookie on first contact.
Responses are JSON; errors are `{ "error": "message" }`.

### GET /api/foods

The food catalog — the single source of truth for the UI pickers and for the
validation of what can go on a fork.

### GET /api/forks

All forks of the dinner, claimed or not. The fork the session user holds (if
any) comes first; the rest follow in id order.

### POST /api/forks

Claim a fork:

```json
{ "id": "fork-1", "userName": "Alice" }
```

Claims are one-shot and limited to one fork per guest:

- `404` unknown fork
- `409` the fork is already claimed (even by you), or you already hold a fork
- `400` missing `id`, or `userName` missing/blank/longer than 30 characters
  (trimmed first)

`userName` is a non-unique display name and cannot be changed after claiming.

### PUT /api/forks

Set or clear the food of a fork you hold:

```json
{ "id": "fork-1", "food": { "foodId": "beef" } }
```

`"food": null` clears the fork. Only `food.foodId` is read — the food is
re-hydrated from the catalog, so `foodName`/`prefs` sent by the client are
ignored. Fields other than `id` and `food` are ignored too.

- `403` you do not hold this fork (unclaimed forks included)
- `404` unknown fork
- `400` missing `id`, malformed `food`, or unknown `foodId`

There is deliberately no release or rename endpoint in v1: a claimed fork stays
claimed until the process restarts.

## Trying it with curl

With the dev server running (`npm run dev`), the cookie jar plays the role of the
browser: `-c cookies.txt` stores the `_session` cookie on first contact and
`-b cookies.txt` sends it back on every request. The jar is your identity — a
fresh jar is a new guest, and losing it orphans your fork.

The examples assume the default port 8082; if you started the server with a
custom `PORT`, adjust the URLs. Every server process holds its own dinner
state, so a jar saved against one instance does not work against another —
the claim simply does not exist there.

```sh
# List all forks; this first request also stores your session cookie.
curl -si -c cookies.txt http://localhost:8082/api/forks

# Claim fork-1 as Alice.
curl -s -b cookies.txt -X POST http://localhost:8082/api/forks \
  -H 'Content-Type: application/json' \
  -d '{"id": "fork-1", "userName": "Alice"}'

# Put beef on your fork (only food.foodId is read).
curl -s -b cookies.txt -X PUT http://localhost:8082/api/forks \
  -H 'Content-Type: application/json' \
  -d '{"id": "fork-1", "food": {"foodId": "beef"}}'

# Take the food off again.
curl -s -b cookies.txt -X PUT http://localhost:8082/api/forks \
  -H 'Content-Type: application/json' \
  -d '{"id": "fork-1", "food": null}'

# List again — your own fork now comes first.
curl -s -b cookies.txt http://localhost:8082/api/forks

# The food catalog (no cookie needed).
curl -s http://localhost:8082/api/foods

# Without the jar you are a different guest: someone else's fork -> 409.
curl -s -X POST http://localhost:8082/api/forks \
  -H 'Content-Type: application/json' \
  -d '{"id": "fork-1", "userName": "Late"}'
```

## Development

```sh
npm install
npm run dev        # tsx watch on :8082
npm test           # vitest + supertest
npm run typecheck  # tsc --noEmit
```

Environment: `PORT` (default 8082), `FORK_COUNT` (default 8), and
`NODE_ENV=production` (adds the `Secure` attribute to the cookie — set in the
k8s deployment).

The frontend dev server proxies `/api` to this API, so cookies behave the same
in development as in production.
