export const BOARD_SIZE = 10;
export const LAKE_CELLS = new Set([
  "4,2",
  "4,3",
  "5,2",
  "5,3",
  "4,6",
  "4,7",
  "5,6",
  "5,7"
]);

export type PlayerColor = "red" | "blue";

export type PieceRank =
  | "flag"
  | "bomb"
  | "spy"
  | "scout"
  | "miner"
  | "sergeant"
  | "lieutenant"
  | "captain"
  | "major"
  | "colonel"
  | "general"
  | "marshal";

export type Cell = {
  row: number;
  col: number;
};

export type Piece = {
  id: string;
  owner: PlayerColor;
  rank: PieceRank;
  revealed: boolean;
};

export type Move = {
  from: Cell;
  to: Cell;
};

export type SetupMap = Record<string, Piece>;

export type BoardMap = Record<string, Piece | undefined>;

export type Outcome =
  | {
      type: "moved";
    }
  | {
      type: "captured";
      winner: Piece;
      loser: Piece;
    }
  | {
      type: "trade";
      attacker: Piece;
      defender: Piece;
    }
  | {
      type: "flag";
      winner: PlayerColor;
      capturedFlag: Piece;
      attacker: Piece;
    };

export type GameStatus = "setup" | "active" | "finished";

export type GameState = {
  id: string;
  board: BoardMap;
  currentTurn: PlayerColor;
  status: GameStatus;
  winner?: PlayerColor;
  players: Record<PlayerColor, string | null>;
  moveHistory: Array<Move & { outcome: Outcome }>;
};
