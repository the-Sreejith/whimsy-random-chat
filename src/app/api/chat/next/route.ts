import { NextResponse } from 'next/server';

// Import the rooms from start route (in a real app, this would be a shared module)
// For simplicity, redeclaring here
interface Room {
  id: string;
  participants: string[];
  createdAt: number;
}

// These would be imported from a shared module in a real application
declare const waitingRooms: Room[];
declare const activeRooms: Room[];
declare const messages: Record<string, any[]>;

// Remove user from room (same as in leave route)
async function removeUserFromRoom(roomId: string, userId: string): Promise<boolean> {
  console.log(`API [/next]: Removing participant ${userId} from room ${roomId}...`);
  
  // Check waiting rooms
  const waitingRoomIndex = waitingRooms.findIndex(room => room.id === roomId);
  if (waitingRoomIndex !== -1) {
    const room = waitingRooms[waitingRoomIndex];
    const userIndex = room.participants.indexOf(userId);
    
    if (userIndex !== -1) {
      room.participants.splice(userIndex, 1);
      
      // If room is empty, remove it
      if (room.participants.length === 0) {
        waitingRooms.splice(waitingRoomIndex, 1);
        // Clean up messages
        if (messages[roomId]) {
          delete messages[roomId];
        }
      }
      
      return true;
    }
  }
  
  // Check active rooms
  const activeRoomIndex = activeRooms.findIndex(room => room.id === roomId);
  if (activeRoomIndex !== -1) {
    const room = activeRooms[activeRoomIndex];
    const userIndex = room.participants.indexOf(userId);
    
    if (userIndex !== -1) {
      room.participants.splice(userIndex, 1);
      
      // If room has only one participant, move it to waiting rooms
      if (room.participants.length === 1) {
        activeRooms.splice(activeRoomIndex, 1);
        waitingRooms.push(room);
        
        // Add system message (in a real implementation, this would notify the other user)
        if (messages[roomId]) {
          messages[roomId].push({
            id: Math.random().toString(36).substring(2, 15),
            roomId,
            senderId: 'system',
            text: 'Your partner has left the chat. Waiting for a new partner...',
            isSystem: true,
            timestamp: Date.now()
          });
        }
      } else if (room.participants.length === 0) {
        // If room is empty, remove it
        activeRooms.splice(activeRoomIndex, 1);
        // Clean up messages
        if (messages[roomId]) {
          delete messages[roomId];
        }
      }
      
      return true;
    }
  }
  
  // User not found in room
  return false;
}

// Find or create room (same as in start route)
async function findOrCreateRoomForUser(userId: string) {
  console.log(`API [/next]: User ${userId} finding/creating new room.`);
  
  // First check if user is already in any room
  const userInWaiting = waitingRooms.find(room => room.participants.includes(userId));
  const userInActive = activeRooms.find(room => room.participants.includes(userId));
  
  if (userInWaiting || userInActive) {
    const existingRoom = userInWaiting || userInActive;
    console.log(`API [/next]: User ${userId} already in room ${existingRoom?.id}`);
    const otherUserId = existingRoom?.participants.find(id => id !== userId);
    
    return {
      roomId: existingRoom?.id,
      partnerId: otherUserId || null,
      status: otherUserId ? 'chatting' : 'searching',
      message: otherUserId ? 'Already chatting with a partner!' : 'Still waiting for a partner...'
    };
  }
  
  // Check for waiting rooms with space
  const availableRoom = waitingRooms.find(room => room.participants.length < 2);
  
  if (availableRoom) {
    // Join existing waiting room
    availableRoom.participants.push(userId);
    
    // Move to active rooms since it now has 2 participants
    const roomIndex = waitingRooms.indexOf(availableRoom);
    waitingRooms.splice(roomIndex, 1);
    activeRooms.push(availableRoom);
    
    const partnerId = availableRoom.participants.find(id => id !== userId);
    
    console.log(`API [/next]: User ${userId} matched in room ${availableRoom.id} with partner ${partnerId}.`);
    
    // Add system message
    if (!messages[availableRoom.id]) {
      messages[availableRoom.id] = [];
    }
    
    messages[availableRoom.id].push({
      id: Math.random().toString(36).substring(2, 15),
      roomId: availableRoom.id,
      senderId: 'system',
      text: `A new user has joined the chat.`,
      isSystem: true,
      timestamp: Date.now()
    });
    
    return {
      roomId: availableRoom.id,
      partnerId,
      status: 'chatting',
      message: 'Matched with a partner!'
    };
  }
  
  // Create a new waiting room
  const newRoom: Room = {
    id: Math.random().toString(36).substring(2, 10),
    participants: [userId],
    createdAt: Date.now()
  };
  
  waitingRooms.push(newRoom);
  console.log(`API [/next]: User ${userId} created new room ${newRoom.id} and is waiting.`);
  
  // Initialize messages for the room
  if (!messages[newRoom.id]) {
    messages[newRoom.id] = [];
  }
  
  // Add system message
  messages[newRoom.id].push({
    id: Math.random().toString(36).substring(2, 15),
    roomId: newRoom.id,
    senderId: 'system',
    text: 'Waiting for a partner to join...',
    isSystem: true,
    timestamp: Date.now()
  });
  
  return {
    roomId: newRoom.id,
    partnerId: null,
    status: 'searching',
    message: 'Waiting for a partner...'
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, currentRoomId } = body;
    
    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ message: 'User ID is required.' }, { status: 400 });
    }
    
    // 1. Leave the current room if provided
    if (currentRoomId && typeof currentRoomId === 'string') {
      console.log(`API [/next]: User ${userId} leaving current room ${currentRoomId}`);
      await removeUserFromRoom(currentRoomId, userId);
    } else {
      console.log(`API [/next]: User ${userId} has no current room to leave.`);
    }
    
    // 2. Find or create a new room
    const result = await findOrCreateRoomForUser(userId);
    return NextResponse.json(result, { status: 200 });
    
  } catch (error: any) {
    console.error("API Error [/api/chat/next]:", error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ message: 'Invalid JSON payload.' }, { status: 400 });
    }
    return NextResponse.json({ 
      message: error.message || 'Failed to find next chat.' 
    }, { status: 500 });
  }
}