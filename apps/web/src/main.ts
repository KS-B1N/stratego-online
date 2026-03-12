import {
  BOARD_SIZE,
  ClientMessage,
  GameState,
  Piece,
  PlayerColor,
  ServerMessage,
  cellKey,
  isLake
} from "@stratego/game-core";
import "./styles.css";

const appRoot = document.querySelector<HTMLDivElement>("#app");

if (!appRoot) {
  throw new Error("App root not found");
}

const app = appRoot;

type ClientState = {
  socket?: WebSocket;
  roomCode: string;
  playerName: string;
  color?: PlayerColor;
  game?: GameState;
  selectedCell?: string;
  validMoves: string[];
  status: string;
};

const state: ClientState = {
  roomCode: "",
  playerName: "",
  validMoves: [],
  status: "Join a room to start."
};

function render(): void {
  app.innerHTML = `
    <main class="shell">
      <section class="hero">
        <div>
          <h1>Stratego</h1>
          <p>Two-player online strategy with hidden information, room codes, and a shared rules engine.</p>
        </div>
        <div class="panel">
          <strong>${state.color ? `You are ${state.color.toUpperCase()}` : "Not connected"}</strong>
          <div>${describeTurn(state.game)}</div>
        </div>
      </section>

      <section class="layout">
        <aside class="stack">
          <div class="panel">
            <h2>Room</h2>
            <div class="stack">
              <label class="field">
                <span>Name</span>
                <input id="playerName" placeholder="Commander name" value="${escapeHtml(state.playerName)}" />
              </label>
              <label class="field">
                <span>Room code</span>
                <input id="roomCode" placeholder="Auto-generate if blank" value="${escapeHtml(state.roomCode)}" />
              </label>
              <div class="actions">
                <button id="joinButton">Join room</button>
                <button id="lockButton" class="secondary">Lock setup</button>
              </div>
              <div class="status">${escapeHtml(state.status)}</div>
            </div>
          </div>

          <div class="panel">
            <h3>Current slice</h3>
            <div class="legend">
              <div>Room: ${state.game?.id ?? "none"}</div>
              <div>Turn: ${state.game?.currentTurn ?? "-"}</div>
              <div>Status: ${state.game?.status ?? "-"}</div>
              <div>Winner: ${state.game?.winner ?? "-"}</div>
            </div>
          </div>
        </aside>

        <section class="panel board-wrap">
          <h2>Battlefield</h2>
          <div class="board">
            ${renderBoard()}
          </div>
          <div class="legend">
            <div>Lake cells block movement.</div>
            <div>Enemy ranks stay hidden until revealed in combat.</div>
            <div>Scout pieces move any distance in a straight line.</div>
          </div>
        </section>
      </section>
    </main>
  `;

  bindEvents();
}

function bindEvents(): void {
  document.querySelector<HTMLButtonElement>("#joinButton")?.addEventListener("click", joinRoom);
  document.querySelector<HTMLButtonElement>("#lockButton")?.addEventListener("click", lockSetup);
  document.querySelector<HTMLInputElement>("#playerName")?.addEventListener("input", (event) => {
    state.playerName = (event.target as HTMLInputElement).value;
  });
  document.querySelector<HTMLInputElement>("#roomCode")?.addEventListener("input", (event) => {
    state.roomCode = (event.target as HTMLInputElement).value.toUpperCase();
  });

  document.querySelectorAll<HTMLButtonElement>(".cell[data-key]").forEach((button) => {
    button.addEventListener("click", () => onCellClick(button.dataset.key ?? ""));
  });
}

function joinRoom(): void {
  if (!state.playerName.trim()) {
    state.status = "Enter a name before joining.";
    render();
    return;
  }

  if (state.socket?.readyState === WebSocket.OPEN) {
    state.socket.close();
  }

  const socket = new WebSocket(resolveSocketUrl());
  state.socket = socket;
  state.status = "Connecting...";
  render();

  socket.addEventListener("open", () => {
    send({
      type: "join_room",
      playerName: state.playerName.trim(),
      roomCode: state.roomCode.trim()
    });
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data) as ServerMessage;
    handleServerMessage(message);
  });

  socket.addEventListener("close", () => {
    state.status = "Disconnected from server.";
    render();
  });
}

function lockSetup(): void {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
    state.status = "Connect to a room first.";
    render();
    return;
  }

  send({
    type: "lock_setup",
    setup: {}
  });
  state.status = "Setup locked. Waiting for the other player.";
  render();
}

function onCellClick(key: string): void {
  if (!state.game || state.game.status !== "active" || !state.color) {
    return;
  }

  if (state.validMoves.includes(key) && state.selectedCell) {
    send({
      type: "move",
      move: {
        from: parseKey(state.selectedCell),
        to: parseKey(key)
      }
    });
    state.selectedCell = undefined;
    state.validMoves = [];
    render();
    return;
  }

  const piece = state.game.board[key];
  if (piece?.owner !== state.color || state.game.currentTurn !== state.color) {
    return;
  }

  state.selectedCell = key;
  state.validMoves = [];
  send({
    type: "request_moves",
    from: parseKey(key)
  });
}

function handleServerMessage(message: ServerMessage): void {
  switch (message.type) {
    case "room_joined":
      state.roomCode = message.roomCode;
      state.color = message.color;
      state.game = message.game;
      state.status = `Joined room ${message.roomCode}.`;
      break;
    case "room_waiting":
      state.status = `Waiting for an opponent in room ${message.roomCode}.`;
      break;
    case "game_updated":
      state.game = message.game;
      state.selectedCell = undefined;
      state.validMoves = [];
      state.status = describeUpdate(message.game, state.color);
      break;
    case "valid_moves":
      state.selectedCell = cellKey(message.from);
      state.validMoves = message.moves.map(cellKey);
      state.status = `Selected ${state.selectedCell}.`;
      break;
    case "error":
      state.status = message.message;
      break;
    default: {
      const exhaustiveCheck: never = message;
      throw new Error(`Unhandled message: ${exhaustiveCheck}`);
    }
  }

  render();
}

function renderBoard(): string {
  const cells: string[] = [];

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const key = `${row},${col}`;
      const piece = state.game?.board[key];
      const selectable = state.validMoves.includes(key);
      const selected = state.selectedCell === key;

      if (isLake({ row, col })) {
        cells.push(`<div class="cell lake">Lake</div>`);
        continue;
      }

      cells.push(`
        <button
          class="cell ${piece?.owner ?? ""} ${selectable ? "selectable" : ""} ${selected ? "selected" : ""}"
          data-key="${key}"
        >
          ${piece ? renderPiece(piece) : ""}
        </button>
      `);
    }
  }

  return cells.join("");
}

function renderPiece(piece: Piece): string {
  const isMine = piece.owner === state.color;
  if (isMine || piece.revealed || state.game?.status !== "active") {
    return `<strong>${piece.rank}</strong>`;
  }

  return "<strong>Hidden</strong>";
}

function describeTurn(game?: GameState): string {
  if (!game) {
    return "Open a room and connect two players.";
  }

  if (game.status === "finished") {
    return `Winner: ${game.winner}`;
  }

  if (game.status === "setup") {
    return "Lock setup from both clients to begin.";
  }

  return `Current turn: ${game.currentTurn}`;
}

function describeUpdate(game: GameState, color?: PlayerColor): string {
  if (game.status === "finished") {
    return game.winner === color ? "You captured the flag." : "The enemy captured your flag.";
  }

  if (game.status === "setup") {
    return "Both players are joining and preparing their setups.";
  }

  return game.currentTurn === color ? "Your move." : "Opponent's move.";
}

function resolveSocketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.hostname}:3001`;
}

function send(message: ClientMessage): void {
  state.socket?.send(JSON.stringify(message));
}

function parseKey(key: string): { row: number; col: number } {
  const [row, col] = key.split(",").map(Number);
  return { row, col };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

render();
