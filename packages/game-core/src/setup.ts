import { Cell, Piece, PieceRank, PlayerColor } from "./types";
import { cellKey, DEFAULT_PIECE_COUNTS, isSetupCellForPlayer } from "./rules";

const RANK_ORDER: PieceRank[] = [
  "flag",
  "bomb",
  "spy",
  "scout",
  "miner",
  "sergeant",
  "lieutenant",
  "captain",
  "major",
  "colonel",
  "general",
  "marshal"
];

export function createPlayerArmy(player: PlayerColor): Piece[] {
  const pieces: Piece[] = [];

  for (const rank of RANK_ORDER) {
    const count = DEFAULT_PIECE_COUNTS[rank];
    for (let index = 0; index < count; index += 1) {
      pieces.push({
        id: `${player}-${rank}-${index + 1}`,
        owner: player,
        rank,
        revealed: false
      });
    }
  }

  return pieces;
}

const BASE_TEMPLATE_ROWS: PieceRank[][] = [
  ["bomb", "bomb", "flag", "bomb", "bomb", "bomb", "bomb", "marshal", "general", "colonel"],
  ["colonel", "major", "major", "major", "captain", "captain", "captain", "captain", "lieutenant", "lieutenant"],
  ["lieutenant", "lieutenant", "sergeant", "sergeant", "sergeant", "sergeant", "miner", "miner", "miner", "miner"],
  ["miner", "scout", "scout", "scout", "scout", "scout", "scout", "scout", "scout", "spy"]
];

export const DEFAULT_SETUP_TEMPLATE_ID = "balanced-fortress";

export type SetupTemplate = {
  id: string;
  name: string;
  description: string;
};

type TemplateBuilder = SetupTemplate & {
  buildRows: () => PieceRank[][];
};

const TEMPLATE_BUILDERS: TemplateBuilder[] = [
  {
    id: "balanced-fortress",
    name: "Balanced Fortress",
    description: "Classic bomb-heavy backline with a steady front and strong center reserves.",
    buildRows: () => cloneRows(BASE_TEMPLATE_ROWS)
  },
  {
    id: "mirrored-fortress",
    name: "Mirrored Fortress",
    description: "The fortress layout mirrored horizontally to change attack expectations and scouting reads.",
    buildRows: () => mirrorRows(BASE_TEMPLATE_ROWS)
  },
  {
    id: "edge-flag-citadel",
    name: "Edge Flag Citadel",
    description: "Puts the flag toward the edge and dares opponents to overcommit to the middle.",
    buildRows: () =>
      withSwaps(BASE_TEMPLATE_ROWS, [
        [[0, 2], [0, 0]],
        [[0, 1], [0, 3]]
      ])
  },
  {
    id: "central-command",
    name: "Central Command",
    description: "Brings the top officers closer to the middle lanes for quicker counterattacks.",
    buildRows: () =>
      withSwaps(BASE_TEMPLATE_ROWS, [
        [[0, 7], [1, 4]],
        [[0, 8], [1, 5]],
        [[0, 9], [1, 3]]
      ])
  },
  {
    id: "scout-screen",
    name: "Scout Screen",
    description: "Pushes information gathering forward so scouts can probe lanes early and often.",
    buildRows: () =>
      withSwaps(BASE_TEMPLATE_ROWS, [
        [[3, 1], [2, 0]],
        [[3, 2], [2, 1]],
        [[3, 7], [2, 8]],
        [[3, 8], [2, 9]]
      ])
  },
  {
    id: "miner-lanes",
    name: "Miner Lanes",
    description: "Stacks miners toward the active front so bomb-clearing pressure arrives sooner.",
    buildRows: () =>
      withSwaps(BASE_TEMPLATE_ROWS, [
        [[2, 6], [3, 3]],
        [[2, 7], [3, 4]],
        [[2, 8], [3, 5]],
        [[2, 9], [3, 6]]
      ])
  },
  {
    id: "spy-ambush",
    name: "Spy Ambush",
    description: "Hides the spy closer to the center while shuffling the strongest pieces to disguise intent.",
    buildRows: () =>
      withSwaps(BASE_TEMPLATE_ROWS, [
        [[3, 9], [1, 4]],
        [[0, 7], [1, 9]]
      ])
  },
  {
    id: "split-bomb-screen",
    name: "Split Bomb Screen",
    description: "Distributes bombs across multiple files to create awkward bomb-checking routes.",
    buildRows: () =>
      withSwaps(BASE_TEMPLATE_ROWS, [
        [[0, 3], [1, 0]],
        [[0, 4], [1, 9]],
        [[0, 5], [2, 2]],
        [[0, 6], [2, 7]]
      ])
  },
  {
    id: "decoy-flag-maze",
    name: "Decoy Flag Maze",
    description: "Moves the flag off its usual lane and reshapes the backline to sell a false strong side.",
    buildRows: () =>
      withSwaps(BASE_TEMPLATE_ROWS, [
        [[0, 2], [0, 8]],
        [[0, 7], [1, 4]],
        [[0, 6], [1, 5]]
      ])
  },
  {
    id: "aggressive-center-lane",
    name: "Aggressive Center Lane",
    description: "Shifts strength toward the middle and front to contest the central files immediately.",
    buildRows: () =>
      withSwaps(BASE_TEMPLATE_ROWS, [
        [[0, 7], [2, 4]],
        [[0, 8], [2, 5]],
        [[1, 4], [3, 1]],
        [[1, 5], [3, 8]]
      ])
  }
];

export const SETUP_TEMPLATES: SetupTemplate[] = TEMPLATE_BUILDERS.map(({ id, name, description }) => ({
  id,
  name,
  description
}));

export function generateDefaultSetup(player: PlayerColor): Record<string, Piece> {
  return generateSetupFromTemplate(player, DEFAULT_SETUP_TEMPLATE_ID);
}

export function generateSetupFromTemplate(player: PlayerColor, templateId: string): Record<string, Piece> {
  const setup: Record<string, Piece> = {};
  const piecesByRank = createPiecesByRank(player);
  const templateRows = getTemplateRows(templateId);
  const orientedRows = player === "blue" ? templateRows : [...templateRows].reverse();
  const startRow = player === "blue" ? 0 : 6;

  for (let rowOffset = 0; rowOffset < orientedRows.length; rowOffset += 1) {
    const ranks = orientedRows[rowOffset];
    for (let col = 0; col < ranks.length; col += 1) {
      const rank = ranks[col];
      const piece = piecesByRank[rank].shift();
      if (!piece) {
        throw new Error(`Default template is missing a ${rank} for ${player}`);
      }

      setup[cellKey({ row: startRow + rowOffset, col })] = piece;
    }
  }

  return setup;
}

export function serializeSetupPieces(setup: Record<string, Piece>): Record<string, string> {
  return Object.fromEntries(Object.entries(setup).map(([cell, piece]) => [cell, piece.id]));
}

export function buildSetupFromSerialized(player: PlayerColor, serializedSetup: Record<string, string>): Record<string, Piece> {
  const piecesById = new Map(createPlayerArmy(player).map((piece) => [piece.id, piece]));
  const setup: Record<string, Piece> = {};
  const usedPieceIds = new Set<string>();

  for (const [key, pieceId] of Object.entries(serializedSetup)) {
    const [row, col] = key.split(",").map(Number);
    const cell: Cell = { row, col };

    if (!isSetupCellForPlayer(player, cell)) {
      throw new Error(`Invalid setup cell ${key} for ${player}`);
    }

    const piece = piecesById.get(pieceId);
    if (!piece) {
      throw new Error(`Unknown piece id ${pieceId}`);
    }

    if (usedPieceIds.has(pieceId)) {
      throw new Error(`Duplicate piece id ${pieceId}`);
    }

    usedPieceIds.add(pieceId);
    setup[key] = piece;
  }

  return setup;
}

function createPiecesByRank(player: PlayerColor): Record<PieceRank, Piece[]> {
  const grouped = Object.fromEntries(
    (Object.keys(DEFAULT_PIECE_COUNTS) as PieceRank[]).map((rank) => [rank, [] as Piece[]])
  ) as Record<PieceRank, Piece[]>;

  for (const piece of createPlayerArmy(player)) {
    grouped[piece.rank].push(piece);
  }

  return grouped;
}

function getTemplateRows(templateId: string): PieceRank[][] {
  const template = TEMPLATE_BUILDERS.find((candidate) => candidate.id === templateId) ?? TEMPLATE_BUILDERS[0];
  return template.buildRows();
}

function cloneRows(rows: PieceRank[][]): PieceRank[][] {
  return rows.map((row) => [...row]);
}

function mirrorRows(rows: PieceRank[][]): PieceRank[][] {
  return cloneRows(rows).map((row) => [...row].reverse());
}

function withSwaps(
  rows: PieceRank[][],
  swaps: Array<[[number, number], [number, number]]>
): PieceRank[][] {
  const nextRows = cloneRows(rows);

  for (const [from, to] of swaps) {
    const [fromRow, fromCol] = from;
    const [toRow, toCol] = to;
    const source = nextRows[fromRow][fromCol];
    nextRows[fromRow][fromCol] = nextRows[toRow][toCol];
    nextRows[toRow][toCol] = source;
  }

  return nextRows;
}
