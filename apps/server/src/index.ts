import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { ClientMessage } from "@stratego/game-core";
import { WebSocketServer } from "ws";
import { RoomManager } from "./roomManager.js";

const port = Number(process.env.PORT ?? 3001);
const webDistDir = join(process.cwd(), "apps", "web", "dist");

const server = createServer((request, response) => {
  const url = request.url ?? "/";

  if (url === "/health") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: true, service: "stratego-server" }));
    return;
  }

  const safePath = normalize(url === "/" ? "index.html" : url.replace(/^\//, ""));
  if (safePath.startsWith("..")) {
    response.writeHead(403, { "Content-Type": "text/plain" });
    response.end("Forbidden");
    return;
  }

  const requestedFile = join(webDistDir, safePath);
  const filePath = existsSync(requestedFile) ? requestedFile : join(webDistDir, "index.html");

  if (!existsSync(filePath)) {
    response.writeHead(503, { "Content-Type": "text/plain" });
    response.end("Web client is not built yet. Run the web build before starting the server.");
    return;
  }

  response.writeHead(200, { "Content-Type": getContentType(filePath) });
  createReadStream(filePath).pipe(response);
});

const wss = new WebSocketServer({ server });
const rooms = new RoomManager();

wss.on("connection", (socket) => {
  let session: ReturnType<RoomManager["joinRoom"]> | undefined;

  socket.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString()) as ClientMessage;

      if (message.type === "join_room") {
        session = rooms.joinRoom(socket, message.playerName, message.roomCode);
        return;
      }

      if (!session) {
        socket.send(JSON.stringify({ type: "error", message: "Join a room first" }));
        return;
      }

      rooms.handleMessage(session, message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown server error";
      socket.send(JSON.stringify({ type: "error", message }));
    }
  });

  socket.on("close", () => {
    rooms.disconnect(session);
  });
});

server.listen(port, () => {
  console.log(`Stratego server listening on http://localhost:${port}`);
});

function getContentType(filePath: string): string {
  switch (extname(filePath)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}
