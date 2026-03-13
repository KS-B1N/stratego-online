import {
  BOARD_SIZE,
  Cell,
  GameState,
  LAKE_CELLS,
  Move,
  Outcome,
  Piece,
  PieceRank,
  PlayerColor
} from "./types";

const RANK_STRENGTH: Record<Exclude<PieceRank, "flag" | "bomb" | "spy">, number> = {
  scout: 2,
  miner: 3,
  sergeant: 4,
  lieutenant: 5,
  captain: 6,
  major: 7,
  colonel: 8,
  general: 9,
  marshal: 10
};

export const DEFAULT_PIECE_COUNTS: Record<PieceRank, number> = {
  flag: 1,
  bomb: 6,
  spy: 1,
  scout: 8,
  miner: 5,
  sergeant: 4,
  lieutenant: 4,
  captain: 4,
  major: 3,
  colonel: 2,
  general: 1,
  marshal: 1
};

export function cellKey(cell: Cell): string {
  return `${cell.row},${cell.col}`;
}

export function isInsideBoard(cell: Cell): boolean {
  return cell.row >= 0 && cell.row < BOARD_SIZE && cell.col >= 0 && cell.col < BOARD_SIZE;
}

export function isLake(cell: Cell): boolean {
  return LAKE_CELLS.has(cellKey(cell));
}

export function canPieceMove(piece: Piece): boolean {
  return piece.rank !== "flag" && piece.rank !== "bomb";
}

export function createEmptyGame(id: string): GameState {
  return {
    id,
    board: {},
    currentTurn: "red",
    status: "setup",
    players: {
      red: null,
      blue: null
    },
    moveHistory: []
  };
}

export function isSetupCellForPlayer(player: PlayerColor, cell: Cell): boolean {
  if (!isInsideBoard(cell) || isLake(cell)) {
    return false;
  }

  return player === "red" ? cell.row >= 6 : cell.row <= 3;
}

export function validateSetup(board: Record<string, Piece | undefined>, player: PlayerColor): string[] {
  const errors: string[] = [];
  const counts = new Map<PieceRank, number>();

  for (const [key, piece] of Object.entries(board)) {
    if (!piece || piece.owner !== player) {
      continue;
    }

    const [row, col] = key.split(",").map(Number);
    if (!isSetupCellForPlayer(player, { row, col })) {
      errors.push(`${player} piece ${piece.id} is outside its setup zone`);
    }

    counts.set(piece.rank, (counts.get(piece.rank) ?? 0) + 1);
  }

  for (const [rank, expectedCount] of Object.entries(DEFAULT_PIECE_COUNTS) as Array<[PieceRank, number]>) {
    const actualCount = counts.get(rank) ?? 0;
    if (actualCount !== expectedCount) {
      errors.push(`${player} must place ${expectedCount} ${rank} piece(s); found ${actualCount}`);
    }
  }

  return errors;
}

export function listValidMoves(game: GameState, from: Cell): Cell[] {
  const piece = game.board[cellKey(from)];
  if (!piece || !canPieceMove(piece) || piece.owner !== game.currentTurn) {
    return [];
  }

  const directions = [
    { row: -1, col: 0 },
    { row: 1, col: 0 },
    { row: 0, col: -1 },
    { row: 0, col: 1 }
  ];

  const moves: Cell[] = [];

  for (const direction of directions) {
    let next = {
      row: from.row + direction.row,
      col: from.col + direction.col
    };

    while (isInsideBoard(next) && !isLake(next)) {
      const occupant = game.board[cellKey(next)];

      if (!occupant) {
        moves.push(next);
      } else {
        if (occupant.owner !== piece.owner) {
          moves.push(next);
        }
        break;
      }

      if (piece.rank !== "scout") {
        break;
      }

      next = {
        row: next.row + direction.row,
        col: next.col + direction.col
      };
    }
  }

  return moves;
}

export function isMoveLegal(game: GameState, move: Move): boolean {
  return listValidMoves(game, move.from).some((candidate) => candidate.row === move.to.row && candidate.col === move.to.col);
}

function compareRanks(attacker: Piece, defender: Piece): Outcome {
  if (defender.rank === "flag") {
    return {
      type: "flag",
      winner: attacker.owner,
      capturedFlag: { ...defender, revealed: true },
      attacker: { ...attacker, revealed: true }
    };
  }

  if (defender.rank === "bomb") {
    if (attacker.rank === "miner") {
      return {
        type: "captured",
        winner: { ...attacker, revealed: true },
        loser: { ...defender, revealed: true }
      };
    }

    return {
      type: "captured",
      winner: { ...defender, revealed: true },
      loser: { ...attacker, revealed: true }
    };
  }

  if (attacker.rank === "spy" && defender.rank === "marshal") {
    return {
      type: "captured",
      winner: { ...attacker, revealed: true },
      loser: { ...defender, revealed: true }
    };
  }

  if (attacker.rank === "spy") {
    return {
      type: "captured",
      winner: { ...defender, revealed: true },
      loser: { ...attacker, revealed: true }
    };
  }

  const attackerStrength = RANK_STRENGTH[attacker.rank as Exclude<PieceRank, "flag" | "bomb" | "spy">];
  const defenderStrength = RANK_STRENGTH[defender.rank as Exclude<PieceRank, "flag" | "bomb" | "spy">];

  if (attackerStrength === defenderStrength) {
    return {
      type: "trade",
      attacker: { ...attacker, revealed: true },
      defender: { ...defender, revealed: true }
    };
  }

  return attackerStrength > defenderStrength
    ? {
        type: "captured",
        winner: { ...attacker, revealed: true },
        loser: { ...defender, revealed: true }
      }
    : {
        type: "captured",
        winner: { ...defender, revealed: true },
        loser: { ...attacker, revealed: true }
      };
}

export function applyMove(game: GameState, move: Move): GameState {
  if (game.status !== "active") {
    throw new Error("Game is not active");
  }

  if (!isMoveLegal(game, move)) {
    throw new Error("Illegal move");
  }

  const fromKey = cellKey(move.from);
  const toKey = cellKey(move.to);
  const attacker = game.board[fromKey];
  const defender = game.board[toKey];

  if (!attacker) {
    throw new Error("No piece at move origin");
  }

  const nextBoard = { ...game.board };
  delete nextBoard[fromKey];

  let outcome: Outcome;

  if (!defender) {
    nextBoard[toKey] = attacker;
    outcome = { type: "moved" };
  } else {
    outcome = compareRanks(attacker, defender);

    if (outcome.type === "captured") {
      nextBoard[toKey] = outcome.winner;
    }

    if (outcome.type === "trade") {
      delete nextBoard[toKey];
    }

    if (outcome.type === "flag") {
      nextBoard[toKey] = outcome.attacker;
    }
  }

  const winner = outcome.type === "flag" ? outcome.winner : undefined;

  return {
    ...game,
    board: nextBoard,
    currentTurn: game.currentTurn === "red" ? "blue" : "red",
    status: winner ? "finished" : game.status,
    winner,
    moveHistory: [...game.moveHistory, { ...move, outcome }]
  };
}
