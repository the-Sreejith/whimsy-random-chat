// lib/store.ts - Shared data store for the chat application

// Room structure
export interface Room {
    id: string;
    participants: string[];
    createdAt: number;
  }
  
  // Message structure
  export interface Message {
    id: string;
    roomId: string;
    senderId: string;
    text: string;
    isSystem: boolean;
    timestamp: number;
  }
  
  // Global stores
  export const waitingRooms: Room[] = [];
  export const activeRooms: Room[] = [];
  export const messages: Record<string, Message[]> = {};
  
  // Helper to generate a unique ID
  export function generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }
  
  // Check if user is in room
  export function isUserInRoom(roomId: string, userId: string): boolean {
    const room = activeRooms.find(r => r.id === roomId) || waitingRooms.find(r => r.id === roomId);
    return room ? room.participants.includes(userId) : false;
  }
  
  // Add system message to room
  export function addSystemMessage(roomId: string, text: string): void {
    if (!messages[roomId]) {
      messages[roomId] = [];
    }
    
    messages[roomId].push({
      id: generateId(),
      roomId,
      senderId: 'system',
      text,
      isSystem: true,
      timestamp: Date.now()
    });
  }