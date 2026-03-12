import { Cell, GameState, Move, PlayerColor } from "./types";

export type ClientMessage =
  | {
      type: "join_room";
      roomCode: string;
      playerName: string;
    }
  | {
      type: "lock_setup";
      setup: Record<string, string>;
    }
  | {
      type: "move";
      move: Move;
    }
  | {
      type: "request_moves";
      from: Cell;
    };

export type ServerMessage =
  | {
      type: "room_joined";
      roomCode: string;
      color: PlayerColor;
      game: GameState;
    }
  | {
      type: "room_waiting";
      roomCode: string;
    }
  | {
      type: "game_updated";
      game: GameState;
    }
  | {
      type: "valid_moves";
      from: Cell;
      moves: Cell[];
    }
  | {
      type: "error";
      message: string;
    };
