import {
  BOARD_SIZE,
  ClientMessage,
  DEFAULT_SETUP_TEMPLATE_ID,
  GameState,
  Piece,
  PlayerColor,
  SETUP_TEMPLATES,
  ServerMessage,
  cellKey,
  generateSetupFromTemplate,
  isLake,
  isSetupCellForPlayer,
  serializeSetupPieces
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
  selectedTemplateId: string;
  localSetup: Record<string, Piece>;
  setupLocked: boolean;
  lastSeenMoveCount: number;
  transientMessage?: string;
  status: string;
};

const state: ClientState = {
  roomCode: "",
  playerName: "",
  selectedTemplateId: DEFAULT_SETUP_TEMPLATE_ID,
  localSetup: {},
  setupLocked: false,
  lastSeenMoveCount: 0,
  transientMessage: undefined,
  validMoves: [],
  status: "Join a room to start."
};

let transientMessageTimer: ReturnType<typeof setTimeout> | undefined;

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
              <label class="field">
                <span>Setup template</span>
                <select id="templateSelect">${renderTemplateOptions()}</select>
              </label>
              <div class="template-copy">${escapeHtml(getSelectedTemplate().description)}</div>
              <div class="actions">
                <button id="joinButton">Join room</button>
                <button id="lockButton" class="secondary">${state.setupLocked ? "Setup locked" : "Lock setup"}</button>
                <button id="resetButton" class="secondary">Reset template</button>
              </div>
              <div class="status">${escapeHtml(state.status)}</div>
              <div class="status">${escapeHtml(state.transientMessage ?? "")}</div>
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
            <div>Choose a template, then click pieces to swap them before locking setup.</div>
            <div>Lake cells block movement.</div>
            <div>Enemy ranks stay hidden until revealed in combat.</div>
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
  document.querySelector<HTMLButtonElement>("#resetButton")?.addEventListener("click", resetSetupTemplate);
  document.querySelector<HTMLInputElement>("#playerName")?.addEventListener("input", (event) => {
    state.playerName = (event.target as HTMLInputElement).value;
  });
  document.querySelector<HTMLInputElement>("#roomCode")?.addEventListener("input", (event) => {
    state.roomCode = (event.target as HTMLInputElement).value.toUpperCase();
  });
  document.querySelector<HTMLSelectElement>("#templateSelect")?.addEventListener("change", (event) => {
    state.selectedTemplateId = (event.target as HTMLSelectElement).value;
    if (state.color && !state.setupLocked) {
      state.localSetup = generateSetupFromTemplate(state.color, state.selectedTemplateId);
      state.selectedCell = undefined;
      state.status = `Loaded ${getSelectedTemplate().name}.`;
    }
    render();
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

  if (!state.color) {
    state.status = "Join a room first.";
    render();
    return;
  }

  if (state.setupLocked) {
    state.status = "Your setup is already locked.";
    render();
    return;
  }

  send({
    type: "lock_setup",
    setup: serializeSetupPieces(state.localSetup)
  });
  state.setupLocked = true;
  state.status = "Setup locked. Waiting for the other player.";
  render();
}

function onCellClick(key: string): void {
  if (state.game?.status === "setup") {
    handleSetupCellClick(key);
    return;
  }

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

function handleSetupCellClick(key: string): void {
  if (!state.color || state.setupLocked) {
    return;
  }

  const cell = parseKey(key);
  if (!isSetupCellForPlayer(state.color, cell)) {
    return;
  }

  const selectedKey = state.selectedCell;
  const selectedPiece = selectedKey ? state.localSetup[selectedKey] : undefined;
  const clickedPiece = state.localSetup[key];

  if (!selectedKey) {
    if (!clickedPiece) {
      return;
    }

    state.selectedCell = key;
    state.status = `Selected ${formatRank(clickedPiece.rank)} at ${key}. Click another setup cell to swap.`;
    render();
    return;
  }

  if (selectedKey === key) {
    state.selectedCell = undefined;
    state.status = "Selection cleared.";
    render();
    return;
  }

  state.localSetup = swapSetupPieces(state.localSetup, selectedKey, key);
  state.selectedCell = undefined;
  state.status = selectedPiece
    ? `Moved ${formatRank(selectedPiece.rank)} to ${key}.`
    : "Setup updated.";
  render();
}

function resetSetupTemplate(): void {
  if (!state.color) {
    state.status = "Join a room first.";
    render();
    return;
  }

  if (state.setupLocked) {
    state.status = "You already locked your setup.";
    render();
    return;
  }

  state.localSetup = generateSetupFromTemplate(state.color, state.selectedTemplateId);
  state.selectedCell = undefined;
  state.status = `Reset to ${getSelectedTemplate().name}.`;
  render();
}

function handleServerMessage(message: ServerMessage): void {
  switch (message.type) {
    case "room_joined":
      state.roomCode = message.roomCode;
      state.color = message.color;
      state.game = message.game;
      state.localSetup = generateSetupFromTemplate(message.color, state.selectedTemplateId);
      state.setupLocked = false;
      state.lastSeenMoveCount = 0;
      state.transientMessage = undefined;
      state.status = `Joined room ${message.roomCode}.`;
      break;
    case "room_waiting":
      state.status = `Waiting for an opponent in room ${message.roomCode}.`;
      break;
    case "game_updated":
      state.game = message.game;
      state.selectedCell = undefined;
      state.validMoves = [];
      if (message.game.status === "setup" && state.color) {
        state.localSetup = {
          ...extractSetupForPlayer(message.game, state.color),
          ...state.localSetup
        };
      }
      if (message.game.status === "active") {
        state.setupLocked = true;
      }
      queueTransientCombatMessage(message.game);
      state.status = describeUpdate(message.game, state.color);
      break;
    case "valid_moves":
      state.selectedCell = cellKey(message.from);
      state.validMoves = message.moves.map(cellKey);
      state.status = `Selected ${state.selectedCell}.`;
      break;
    case "error":
      state.status = message.message;
      if (state.game?.status === "setup") {
        state.setupLocked = false;
      }
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
      const piece = getDisplayPiece(key);
      const selectable = state.validMoves.includes(key);
      const selected = state.selectedCell === key;
      const setupCell = Boolean(state.color && isSetupCellForPlayer(state.color, { row, col }));

      if (isLake({ row, col })) {
        cells.push(`<div class="cell lake">Lake</div>`);
        continue;
      }

      cells.push(`
        <button
          class="cell ${piece?.owner ?? ""} ${setupCell ? "setup-cell" : ""} ${selectable ? "selectable" : ""} ${selected ? "selected" : ""}"
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
  if (state.game?.status !== "active" || isMine) {
    return `
      <span class="piece-value">${getPieceValue(piece)}</span>
      <span class="piece-icon">${getPieceIcon(piece)}</span>
      <span class="piece-name">${formatRank(piece.rank)}</span>
    `;
  }

  return `
    <span class="piece-value">?</span>
    <span class="piece-icon">?</span>
    <span class="piece-name">Hidden</span>
  `;
}

function describeTurn(game?: GameState): string {
  if (!game) {
    return "Open a room and connect two players.";
  }

  if (game.status === "finished") {
    return `Winner: ${game.winner}`;
  }

  if (game.status === "setup") {
    return "Choose a template, rearrange pieces, then lock setup.";
  }

  return `Current turn: ${game.currentTurn}`;
}

function describeUpdate(game: GameState, color?: PlayerColor): string {
  if (game.status === "finished") {
    return game.winner === color ? "You captured the flag." : "The enemy captured your flag.";
  }

  if (game.status === "setup") {
    return state.setupLocked ? "Waiting for the other player to lock a setup." : "Pick a template or swap pieces, then lock setup.";
  }

  return game.currentTurn === color ? "Your move." : "Opponent's move.";
}

function resolveSocketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}`;
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

function getDisplayPiece(key: string): Piece | undefined {
  if (state.game?.status === "setup" && state.color) {
    return state.localSetup[key];
  }

  return state.game?.board[key];
}

function swapSetupPieces(setup: Record<string, Piece>, fromKey: string, toKey: string): Record<string, Piece> {
  const nextSetup = { ...setup };
  const fromPiece = nextSetup[fromKey];
  const toPiece = nextSetup[toKey];

  if (!fromPiece) {
    return nextSetup;
  }

  nextSetup[toKey] = fromPiece;
  if (toPiece) {
    nextSetup[fromKey] = toPiece;
  } else {
    delete nextSetup[fromKey];
  }

  return nextSetup;
}

function getPieceLabel(piece: Piece): string {
  switch (piece.rank) {
    case "flag":
      return "F";
    case "bomb":
      return "B";
    case "spy":
      return "S";
    case "scout":
      return "2";
    case "miner":
      return "3";
    case "sergeant":
      return "4";
    case "lieutenant":
      return "5";
    case "captain":
      return "6";
    case "major":
      return "7";
    case "colonel":
      return "8";
    case "general":
      return "9";
    case "marshal":
      return "10";
    default:
      return "?";
  }
}

function getPieceIcon(piece: Piece): string {
  switch (piece.rank) {
    case "flag":
      return "[]";
    case "bomb":
      return "*";
    case "spy":
      return "<>";
    default:
      return getPieceLabel(piece);
  }
}

function getPieceValue(piece: Piece): string {
  switch (piece.rank) {
    case "flag":
      return "F";
    case "bomb":
      return "B";
    default:
      return getPieceLabel(piece);
  }
}

function formatRank(rank: Piece["rank"]): string {
  return rank.charAt(0).toUpperCase() + rank.slice(1);
}

function extractSetupForPlayer(game: GameState, color: PlayerColor): Record<string, Piece> {
  return Object.fromEntries(Object.entries(game.board).filter(([, piece]) => piece?.owner === color)) as Record<string, Piece>;
}

function renderTemplateOptions(): string {
  return SETUP_TEMPLATES.map((template) => {
    const selected = template.id === state.selectedTemplateId ? "selected" : "";
    return `<option value="${template.id}" ${selected}>${escapeHtml(template.name)}</option>`;
  }).join("");
}

function getSelectedTemplate(): (typeof SETUP_TEMPLATES)[number] {
  return SETUP_TEMPLATES.find((template) => template.id === state.selectedTemplateId) ?? SETUP_TEMPLATES[0];
}

function queueTransientCombatMessage(game: GameState): void {
  if (game.moveHistory.length === state.lastSeenMoveCount) {
    return;
  }

  state.lastSeenMoveCount = game.moveHistory.length;
  const lastMove = game.moveHistory.at(-1);
  if (!lastMove || lastMove.outcome.type === "moved") {
    return;
  }

  const message = describeCombatOutcome(lastMove.outcome);
  state.transientMessage = message;

  if (transientMessageTimer) {
    clearTimeout(transientMessageTimer);
  }

  transientMessageTimer = setTimeout(() => {
    state.transientMessage = undefined;
    render();
  }, 3500);
}

function describeCombatOutcome(outcome: GameState["moveHistory"][number]["outcome"]): string {
  switch (outcome.type) {
    case "captured":
      return `${formatRank(outcome.winner.rank)} defeated ${formatRank(outcome.loser.rank)}.`;
    case "trade":
      return `${formatRank(outcome.attacker.rank)} traded with ${formatRank(outcome.defender.rank)}.`;
    case "flag":
      return `${formatRank(outcome.attacker.rank)} captured the Flag.`;
    case "moved":
      return "";
    default:
      return "";
  }
}

render();
