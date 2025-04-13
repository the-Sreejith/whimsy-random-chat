import { Socket, io } from 'socket.io-client';
import { SignalingMessage } from '@/types/chat';

export interface ServerToClientEvents {
  'your-id': (id: string) => void;
  waiting: () => void;
  matched: (data: { partnerId: string }) => void;
  message: (data: { text: string }) => void;
  'partner-disconnected': () => void;
  typing: (data: { isTyping: boolean }) => void;
  signal: (payload: SignalingMessage) => void;
  'server-error': (message: string) => void;
}

export interface ClientToServerEvents {
  message: (data: { text: string }) => void;
  typing: (isTyping: boolean) => void;
  signal: (payload: SignalingMessage) => void;
  leave: () => void;
}

export type SocketInstance = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface SocketHandlers {
  onConnect?: () => void;
  onYourId?: (id: string) => void;
  onWaiting?: () => void;
  onMatched?: (data: { partnerId: string }) => void;
  onMessage?: (data: { text: string }) => void;
  onTyping?: (data: { isTyping: boolean }) => void;
  onSignal?: (payload: SignalingMessage) => void;
  onPartnerDisconnected?: () => void;
  onServerError?: (message: string) => void;
  onDisconnect?: (reason: string) => void;
  onConnectError?: (error: Error) => void;
}

export const SOCKET_CONFIG = {
  reconnection: false,
  timeout: 8000,
};

/**
 * Creates and configures a socket.io connection
 */
export function createSocketConnection(handlers: SocketHandlers = {}): SocketInstance {
  const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL, SOCKET_CONFIG);

  // Set up event listeners
  if (handlers.onConnect) {
    socket.on('connect', handlers.onConnect);
  }

  if (handlers.onYourId) {
    socket.on('your-id', handlers.onYourId);
  }

  if (handlers.onWaiting) {
    socket.on('waiting', handlers.onWaiting);
  }

  if (handlers.onMatched) {
    socket.on('matched', handlers.onMatched);
  }

  if (handlers.onMessage) {
    socket.on('message', handlers.onMessage);
  }

  if (handlers.onTyping) {
    socket.on('typing', handlers.onTyping);
  }

  if (handlers.onSignal) {
    socket.on('signal', handlers.onSignal);
  }

  if (handlers.onPartnerDisconnected) {
    socket.on('partner-disconnected', handlers.onPartnerDisconnected);
  }

  if (handlers.onServerError) {
    socket.on('server-error', handlers.onServerError);
  }

  if (handlers.onDisconnect) {
    socket.on('disconnect', handlers.onDisconnect);
  }

  if (handlers.onConnectError) {
    socket.on('connect_error', handlers.onConnectError);
  }

  return socket;
}

/**
 * Cleans up a socket instance by removing all listeners and disconnecting
 */
export function cleanupSocket(socket: SocketInstance | null): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }
}

/**
 * Send a chat message
 */
export function sendMessage(socket: SocketInstance | null, text: string): void {
  if (socket?.connected && text.trim()) {
    socket.emit('message', { text: text.trim() });
  }
}

/**
 * Send typing indicator
 */
export function sendTyping(socket: SocketInstance | null, isTyping: boolean): void {
  if (socket?.connected) {
    socket.emit('typing', isTyping);
  }
}

/**
 * Send WebRTC signaling message
 */
export function sendSignal(
  socket: SocketInstance | null, 
  payload: Omit<SignalingMessage, 'sender' | 'target'>,
  userId: string | null,
  partnerId: string | null
): void {
  if (socket?.connected && userId && partnerId) {
    socket.emit('signal', {
      ...payload,
      sender: userId,
      target: partnerId,
    });
  }
}

/**
 * Notify server that user is leaving the chat
 */
export function leaveChat(socket: SocketInstance | null): void {
  if (socket?.connected) {
    socket.emit('leave');
  }
}