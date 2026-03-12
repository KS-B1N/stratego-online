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

const DEFAULT_BACKLINE_TEMPLATE: PieceRank[][] = [
  ["bomb", "bomb", "flag", "bomb", "bomb", "bomb", "bomb", "marshal", "general", "colonel"],
  ["colonel", "major", "major", "major", "captain", "captain", "captain", "captain", "lieutenant", "lieutenant"],
  ["lieutenant", "lieutenant", "sergeant", "sergeant", "sergeant", "sergeant", "miner", "miner", "miner", "miner"],
  ["miner", "scout", "scout", "scout", "scout", "scout", "scout", "scout", "scout", "spy"]
];

export function generateDefaultSetup(player: PlayerColor): Record<string, Piece> {
  const setup: Record<string, Piece> = {};
  const piecesByRank = createPiecesByRank(player);
  const templateRows = player === "blue" ? DEFAULT_BACKLINE_TEMPLATE : [...DEFAULT_BACKLINE_TEMPLATE].reverse();
  const startRow = player === "blue" ? 0 : 6;

  for (let rowOffset = 0; rowOffset < templateRows.length; rowOffset += 1) {
    const ranks = templateRows[rowOffset];
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
