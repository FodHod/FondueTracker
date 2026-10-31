# How to run locally

Run `npm install` in both `code/fronduend` and `code/api` directories. The frontend dev server (vite) is configured to proxy `/api` requests to the backend.
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

You may open the dev server on the displayed URL (usually http://localhost:5173/). Notice that you can reach both the frontend routes and the API (via /api/...) from this server.

