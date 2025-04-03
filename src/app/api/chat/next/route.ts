// src/app/api/chat/next/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// --- Reuse Adapted Service Logic from 'start' and 'leave' ---

// This function is defined in ./leave/route.ts (or move to a shared service file)
async function removeUserFromRoom(supabase: ReturnType<typeof createSupabaseServerClient>, roomId: string, userId: string) {
    // ... (same logic as in leave/route.ts) ...
     console.log(`API [/next]: Removing participant ${userId} from room ${roomId} as part of 'next'...`);
     await supabase.from('chat_messages').insert({
         room_id: roomId,
         sender_id: 'system',
         message: `${userId} has left to find a new chat.`,
         is_system: true
     });
     const { error: deleteError } = await supabase
        .from('chat_participants')
        .delete()
        .eq('user_id', userId)
        .eq('room_id', roomId);
     if (deleteError) { /* handle/log error */ }
     // Optional: Check and delete empty room
     // ...
     return true;
}

// This function is defined in ./start/route.ts (or move to a shared service file)
async function findOrCreateRoomForUser(supabase: ReturnType<typeof createSupabaseServerClient>, userId: string) {
    // ... (same logic as in start/route.ts) ...
     console.log(`API [/next]: User ${userId} finding/creating NEW room...`);
     // ... (RPC call, join/create logic) ...
     // Return { roomId, status, created, message }
}
// --- End Reused Logic ---


export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { userId, currentRoomId } = body; // Expect currentRoomId

        if (!userId) {
            return NextResponse.json({ message: 'User ID is required.' }, { status: 400 });
        }

        const supabase = createSupabaseServerClient();

        // 1. Leave the current room if provided
        if (currentRoomId) {
            console.log(`API [/next]: User ${userId} leaving current room ${currentRoomId}`);
            await removeUserFromRoom(supabase, currentRoomId, userId);
            // Realtime events handle notifying the old partner
        } else {
             console.log(`API [/next]: User ${userId} has no current room to leave.`);
        }

        // 2. Find or create a new room
        console.log(`API [/next]: User ${userId} finding/creating new room...`);
        const result = await findOrCreateRoomForUser(supabase, userId);

        // Result contains { roomId, status, created, message }
        return NextResponse.json(result, { status: 200 });


    } catch (error: any) {
        console.error("API Error [/api/chat/next]:", error);
         if (error instanceof SyntaxError) {
             return NextResponse.json({ message: 'Invalid JSON payload.' }, { status: 400 });
         }
        return NextResponse.json({ message: error.message || 'Failed to find next chat.' }, { status: 500 });
    }
}