# Stratego Online

Starter repo for an online multiplayer Stratego game with a shared TypeScript rules engine, a WebSocket server, and a lightweight browser client.

## What is here

- `packages/game-core`: board model, move rules, combat resolution, setup helpers, and socket message types.
- `apps/server`: room-based WebSocket server that lets two players join, lock setup, and make moves.
- `apps/web`: Vite-powered browser client with room join flow and clickable board interactions.

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Start the server:

```bash
npm run dev:server
```

3. Start the web app in another terminal:

```bash
npm run dev:web
```

4. Open two browser windows, join the same room, and click `Lock setup` in both clients.

## Deploy on Render

This repo is set up to deploy as a single Render web service. The Node server serves the built Vite app and also hosts the WebSocket game server on the same origin, which keeps deployment and browser testing simple.

### Option 1: Blueprint deploy

1. Push this repo to GitHub.
2. In Render, create a new Blueprint and point it at the repo.
3. Render will pick up [render.yaml](C:/Users/KoreySnodgrass/Documents/Playground/render.yaml).
4. Once the service is live, open the Render URL in two browser windows and join the same room code.

### Option 2: Manual web service

- Build command: `npm install && npm run build --workspace @stratego/web`
- Start command: `npm exec --workspace @stratego/server tsx src/index.ts`
- Health check path: `/health`

### Notes

- The frontend and WebSocket connection use the same host in production, so no extra `VITE_WS_URL` variable is required.
- The free Render tier may sleep between test sessions, so the first load can take a little longer.

## Current scope

- Uses default auto-generated starting layouts when each player locks setup.
- Supports room join, turn-taking, scout movement, bomb/miner/spy rules, combat, and flag capture.
- Keeps the code split so future features can reuse the same rules on both client and server.

## Best next milestones

1. Replace default setup with a drag-and-drop setup phase and validate it server-side.
2. Stop sending enemy ranks to the client before reveal by introducing per-player state serialization.
3. Persist rooms and reconnect sessions so a dropped connection does not kill the match.
4. Add ranked matchmaking, timers, rematches, and spectator support.
5. Add automated tests for move generation, combat edge cases, and room lifecycle behavior.
