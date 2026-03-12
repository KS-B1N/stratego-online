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

export function generateDefaultSetup(player: PlayerColor): Record<string, Piece> {
  const army = createPlayerArmy(player);
  const setup: Record<string, Piece> = {};
  let pieceIndex = 0;

  for (let row = 0; row < 10; row += 1) {
    for (let col = 0; col < 10; col += 1) {
      const cell: Cell = { row, col };
      if (!isSetupCellForPlayer(player, cell)) {
        continue;
      }

      const piece = army[pieceIndex];
      if (!piece) {
        return setup;
      }

      setup[cellKey(cell)] = piece;
      pieceIndex += 1;
    }
  }

  return setup;
}
