// Type Definitions
import { WebSocket } from 'ws';

interface GameStake {
  charge: number;
  amount: number;
  points: number;
}

export interface PlayerInfo {
  uid: string;
  username: string;
  avatar: string;
  balance: number;
  stake: GameStake;
}

export interface GameRequest {
  user: PlayerInfo;
  opponent: PlayerInfo;
  stake: GameStake;
  timestamp: number;
  timeout: NodeJS.Timeout | null;
}

export enum Suit {
  Hearts = 'H',
  Diamonds = 'D',
  Clubs = 'C',
  Spades = 'S',
  Red = 'R',
  Black = 'B',
}

export type CardType = {
  v: number;
  s: Suit;
};

export interface GameState {
  gameId: string;
  players: Record<string, CardType[]>;
  status: string;
  userId: string;
  currentTurn: string;
  cuttingCard: CardType;
  deck: CardType[];
  ready: Set<string>;
  playedCards: CardType[];
  currentCard: CardType | null;
  chosenSuit: string | null;
  createdAt: Date;
  turnExpiresAt?: number;
  waitTimeout?: NodeJS.Timeout | null;
  moveTimeout?: NodeJS.Timeout | null;
  stake: GameStake;
  meta: {
    [uid: string]: {
      username: string;
      avatar: string;
      balance: number;
    };
  };
}

export interface PlayerData {
  ws: WebSocket & { uid: string };
  username: string;
  avatar: string;
  balance: number;
  stake: GameStake;
  uid: string;
}

export interface MoveAction {
  type: 'DRAW' | 'PLAY';
  v?: number;
  s?: string;
  count?: number;
}

export interface MoveData {
  gameId: string;
  from: string;
  to: string;
  cards: MoveAction[];
  newSuit?: string;
}

export interface WsProps {
  ws: WebSocket;
  data: MoveData;
}

export type ClientsMap = Map<string, PlayerData>;
export type PendingRequestsMap = Map<string, GameRequest>;
export type PlayerGameMap = Map<string, string>;
export type GameStatesMap = Map<string, GameState>;
