import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

// type MatchResult = Database['public']['Functions']['find_available_room']['Returns'][number];

// --- Helper: Remove User ---
async function removeUserFromRoom(supabase: SupabaseClient<Database>, roomId: string, userId: string) {
    console.log(`API [/next -> removeUser]: Removing participant ${userId} from room ${roomId}...`);

    // Send system message *before* deleting participant
    // Use `broadcast` via Realtime channel instead? Or just let participant change handle it?
    // Let's rely on participant change for partner notification for simplicity.
    // await supabase.from('chat_messages').insert({
    //     room_id: roomId,
    //     sender_id: 'system',
    //     message: `User ${userId.substring(0, 8)}... has left.`,
    //     is_system: true
    // });

    const { error: deleteError } = await supabase
        .from('chat_participants')
        .delete()
        .eq('user_id', userId)
        .eq('room_id', roomId);

    if (deleteError) {
        console.error(`API [/next -> removeUser]: Error removing participant ${userId} from room ${roomId}:`, deleteError);
        // Don't throw, maybe user was already gone or RLS prevented (which is ok if they left)
    } else {
        console.log(`API [/next -> removeUser]: Participant ${userId} deleted from room ${roomId}.`);
    }

    // Optional: Check if room is empty and clean up
    const { data: remaining, error: countError } = await supabase
        .from('chat_participants')
        .select('id', { count: 'exact', head: true })
        .eq('room_id', roomId);

    if (!countError && remaining?.length === 0) {
         console.log(`API [/next -> removeUser]: Room ${roomId} is empty. Deleting room.`);
         // Best effort cleanup
         await supabase.from('chat_messages').delete().eq('room_id', roomId); // Delete messages first due to FK
         await supabase.from('chat_rooms').delete().eq('id', roomId);
         console.log(`API [/next -> removeUser]: Empty room ${roomId} cleanup attempted.`);
    } else if (countError) {
         console.error(`API [/next -> removeUser]: Error counting remaining participants in room ${roomId}:`, countError);
    }
}

// --- Helper: Find/Create (same as /start) ---
async function findOrCreateRoomForUser(supabase: SupabaseClient<Database>, userId: string) {
     console.log(`API [/next -> findOrCreate]: User ${userId} finding/creating room.`);
     const { data: rpcResult, error: rpcError } = await supabase.rpc(
         'find_available_room',
         { requesting_user_id: userId }
     );

     if (rpcError) throw new Error(`Database error finding room: ${rpcError.message}`);
     if (!rpcResult) throw new Error("Matchmaking service returned an unexpected result.");

     const matchData = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
     if (!matchData || !matchData.room_id) throw new Error("Matchmaking service failed to provide a room ID.");

     const roomId = matchData.room_id;
     const partnerId = matchData.other_user_id;

     if (partnerId) {
         console.log(`API [/next -> findOrCreate]: User ${userId} matched in NEW room ${roomId} with partner ${partnerId}.`);
           await supabase.from('chat_messages').insert({
             room_id: roomId,
             sender_id: 'system',
             message: `User ${userId.substring(0, 8)}... has joined.`,
             is_system: true
         });
         return { roomId, partnerId, status: 'chatting' as const, message: 'Matched with a partner!' };
     } else {
         console.log(`API [/next -> findOrCreate]: User ${userId} created/joined NEW room ${roomId} and is waiting.`);
          await supabase.from('chat_messages').insert({
             room_id: roomId,
             sender_id: 'system',
             message: 'Waiting for a partner to join...',
             is_system: true,
         });
         return { roomId, partnerId: null, status: 'searching' as const, message: 'Waiting for a partner...' };
     }
}
// --- End Helpers ---

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { userId, currentRoomId } = body;

        if (!userId || typeof userId !== 'string') {
            return NextResponse.json({ message: 'User ID is required.' }, { status: 400 });
        }

        const supabase = createSupabaseServerClient();

        // 1. Leave the current room if provided
        if (currentRoomId && typeof currentRoomId === 'string') {
            console.log(`API [/next]: User ${userId} leaving current room ${currentRoomId}`);
            await removeUserFromRoom(supabase, currentRoomId, userId);
        } else {
             console.log(`API [/next]: User ${userId} has no current room to leave.`);
        }

        // 2. Find or create a new room
        console.log(`API [/next]: User ${userId} finding/creating new room...`);
        const result = await findOrCreateRoomForUser(supabase, userId);

        return NextResponse.json(result, { status: 200 });

    } catch (error: any) {
        console.error("API Error [/api/chat/next]:", error);
         if (error instanceof SyntaxError) {
             return NextResponse.json({ message: 'Invalid JSON payload.' }, { status: 400 });
         }
        return NextResponse.json({ message: error.message || 'Failed to find next chat.' }, { status: 500 });
    }
}