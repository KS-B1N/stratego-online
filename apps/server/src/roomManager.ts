import {
  applyMove,
  buildSetupFromSerialized,
  cellKey,
  ClientMessage,
  createEmptyGame,
  GameState,
  generateDefaultSetup,
  listValidMoves,
  Piece,
  PlayerColor,
  ServerMessage,
  validateSetup
} from "@stratego/game-core";
import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";

type ClientSession = {
  id: string;
  name: string;
  socket: WebSocket;
  color: PlayerColor;
  roomCode: string;
};

type Room = {
  code: string;
  game: GameState;
  clients: Partial<Record<PlayerColor, ClientSession>>;
  setupsLocked: Set<PlayerColor>;
};

function send(socket: WebSocket, message: ServerMessage): void {
  socket.send(JSON.stringify(message));
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  joinRoom(socket: WebSocket, playerName: string, requestedRoomCode?: string): ClientSession {
    const roomCode = requestedRoomCode?.toUpperCase() || randomRoomCode();
    const room = this.rooms.get(roomCode) ?? this.createRoom(roomCode);

    const color: PlayerColor = room.clients.red ? "blue" : "red";
    if (room.clients[color]) {
      throw new Error("Room is full");
    }

    const session: ClientSession = {
      id: randomUUID(),
      name: playerName,
      socket,
      color,
      roomCode
    };

    room.clients[color] = session;
    room.game.players[color] = playerName;

    send(socket, {
      type: "room_joined",
      roomCode,
      color,
      game: room.game
    });

    this.broadcastRoom(room, {
      type: "game_updated",
      game: room.game
    });

    if (!room.clients.red || !room.clients.blue) {
      send(socket, {
        type: "room_waiting",
        roomCode
      });
    }

    return session;
  }

  handleMessage(session: ClientSession, message: ClientMessage): void {
    const room = this.rooms.get(session.roomCode);
    if (!room) {
      throw new Error("Room not found");
    }

    switch (message.type) {
      case "request_moves": {
        assertPlayerControlsCell(room.game, session.color, message.from);
        if (hasActiveMoveHighlight(room.game)) {
          this.broadcastRoom(room, {
            type: "combat_highlight_cleared"
          });
        }
        send(session.socket, {
          type: "valid_moves",
          from: message.from,
          moves: listValidMoves(room.game, message.from)
        });
        return;
      }
      case "move": {
        assertPlayerControlsCell(room.game, session.color, message.move.from);
        room.game = applyMove(room.game, message.move);
        this.broadcastRoom(room, {
          type: "game_updated",
          game: room.game
        });
        return;
      }
      case "lock_setup": {
        if (room.setupsLocked.has(session.color)) {
          throw new Error("Your setup is already locked");
        }

        const submittedSetup = Object.keys(message.setup).length
          ? buildSetupFromSerialized(session.color, message.setup)
          : generateDefaultSetup(session.color);
        const errors = validateSetup(submittedSetup, session.color);
        if (errors.length > 0) {
          throw new Error(errors[0]);
        }

        room.game.board = replacePlayerSetup(room.game, session.color, submittedSetup);

        room.setupsLocked.add(session.color);
        if (room.setupsLocked.size === 2) {
          room.game.status = "active";
          this.broadcastRoom(room, {
            type: "game_updated",
            game: room.game
          });
        }
        return;
      }
      case "join_room": {
        throw new Error("Client is already in a room");
      }
      default: {
        const exhaustiveCheck: never = message;
        return exhaustiveCheck;
      }
    }
  }

  disconnect(session?: ClientSession): void {
    if (!session) {
      return;
    }

    const room = this.rooms.get(session.roomCode);
    if (!room) {
      return;
    }

    delete room.clients[session.color];
    room.game.players[session.color] = null;

    this.broadcastRoom(room, {
      type: "game_updated",
      game: room.game
    });

    if (!room.clients.red && !room.clients.blue) {
      this.rooms.delete(room.code);
    }
  }

  private createRoom(code: string): Room {
    const room: Room = {
      code,
      game: createEmptyGame(code),
      clients: {},
      setupsLocked: new Set()
    };

    this.rooms.set(code, room);
    return room;
  }

  private broadcastRoom(room: Room, message: ServerMessage): void {
    for (const client of Object.values(room.clients)) {
      client?.socket.send(JSON.stringify(message));
    }
  }
}

function randomRoomCode(): string {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

function assertPlayerControlsCell(game: GameState, player: PlayerColor, cell: { row: number; col: number }): void {
  if (game.currentTurn !== player) {
    throw new Error("It is not your turn");
  }

  const piece = game.board[cellKey(cell)];
  if (!piece) {
    throw new Error("No piece at selected cell");
  }

  if (piece.owner !== player) {
    throw new Error("You can only move your own pieces");
  }
}

function replacePlayerSetup(
  game: GameState,
  player: PlayerColor,
  setup: Record<string, Piece>
): GameState["board"] {
  const preservedEntries = Object.entries(game.board).filter(([, piece]) => piece?.owner !== player);
  return {
    ...Object.fromEntries(preservedEntries),
    ...setup
  };
}

function hasActiveMoveHighlight(game: GameState): boolean {
  return game.moveHistory.length > 0;
}
