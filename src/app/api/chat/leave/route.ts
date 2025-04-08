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

// Remove user from room
async function removeUserFromRoom(roomId: string, userId: string): Promise<boolean> {
  console.log(`API [/leave]: Removing participant ${userId} from room ${roomId}...`);
  
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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { roomId, userId } = body;

    if (!roomId || !userId) {
      return NextResponse.json({ message: 'Room ID and User ID are required.' }, { status: 400 });
    }

    const success = await removeUserFromRoom(roomId, userId);
    
    if (success) {
      return NextResponse.json({ 
        success: true, 
        message: 'Successfully left the chat.' 
      }, { status: 200 });
    } else {
      // Even if not found, client may consider it success
      return NextResponse.json({ 
        success: true, 
        message: 'Leave request processed (user might have already left).' 
      }, { status: 200 });
    }

  } catch (error: any) {
    console.error("API Error [/api/chat/leave]:", error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ message: 'Invalid JSON payload.' }, { status: 400 });
    }
    return NextResponse.json({ 
      success: false, 
      message: error.message || 'Server error leaving chat.' 
    }, { status: 500 });
  }
}