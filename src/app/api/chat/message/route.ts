import { NextResponse } from 'next/server';

// Message structure
interface Message {
  id: string;
  roomId: string;
  senderId: string;
  text: string;
  isSystem: boolean;
  timestamp: number;
}

// Global store for messages
const messages: Record<string, Message[]> = {};

// Helper to generate a unique ID
function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

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

// Check if user is in room
function isUserInRoom(roomId: string, userId: string): boolean {
  // In a real implementation, you'd use the actual shared variables
  const room = activeRooms.find(r => r.id === roomId) || waitingRooms.find(r => r.id === roomId);
  return room ? room.participants.includes(userId) : false;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { roomId, userId, text } = body;

    if (!roomId || !userId || !text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ message: 'Room ID, User ID, and non-empty message text are required.' }, { status: 400 });
    }

    // Check if user is in the room (simplified validation)
    if (!isUserInRoom(roomId, userId)) {
      return NextResponse.json({ 
        success: false, 
        message: 'Permission denied. You might not be in this room anymore.' 
      }, { status: 403 });
    }

    // Create new message
    const newMessage: Message = {
      id: generateId(),
      roomId,
      senderId: userId,
      text: text.trim(),
      isSystem: false,
      timestamp: Date.now()
    };

    // Initialize messages array for room if not exists
    if (!messages[roomId]) {
      messages[roomId] = [];
    }

    // Add message to store
    messages[roomId].push(newMessage);
    
    console.log(`API [/message]: Message from ${userId} added to room ${roomId}`);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Message sent.',
      messageId: newMessage.id
    }, { status: 200 });

  } catch (error: any) {
    console.error("API Error [/api/chat/message]:", error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ message: 'Invalid JSON payload.' }, { status: 400 });
    }
    return NextResponse.json({ 
      success: false, 
      message: error.message || 'Server error sending message.' 
    }, { status: 500 });
  }
}

// Add an endpoint to fetch messages for a room
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const roomId = url.searchParams.get('roomId');
    const userId = url.searchParams.get('userId');

    if (!roomId || !userId) {
      return NextResponse.json({ 
        success: false, 
        message: 'Room ID and User ID are required.' 
      }, { status: 400 });
    }

    // Check if user is in the room
    if (!isUserInRoom(roomId, userId)) {
      return NextResponse.json({ 
        success: false, 
        message: 'Permission denied. You might not be in this room.' 
      }, { status: 403 });
    }

    // Return messages for the room
    return NextResponse.json({ 
      success: true, 
      messages: messages[roomId] || [] 
    }, { status: 200 });
    
  } catch (error: any) {
    console.error("API Error [/api/chat/message GET]:", error);
    return NextResponse.json({ 
      success: false, 
      message: error.message || 'Server error fetching messages.' 
    }, { status: 500 });
  }
}