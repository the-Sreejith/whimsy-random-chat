import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

// --- Reused Helper: Remove User ---
async function removeUserFromRoom(supabase: SupabaseClient<Database>, roomId: string, userId: string) {
    console.log(`API [/leave -> removeUser]: Removing participant ${userId} from room ${roomId}...`);

    // Delete participant first
    const { error: deleteError } = await supabase
        .from('chat_participants')
        .delete()
        .eq('user_id', userId)
        .eq('room_id', roomId);

     if (deleteError) {
        console.error(`API [/leave -> removeUser]: Error removing participant ${userId} from room ${roomId}:`, deleteError);
         // Don't throw, let cleanup proceed if possible
     } else {
        console.log(`API [/leave -> removeUser]: Participant ${userId} deleted from room ${roomId}.`);
     }

    // Optional: Check if room is empty and clean up
    const { data: remaining, error: countError } = await supabase
        .from('chat_participants')
        .select('id', { count: 'exact', head: true })
        .eq('room_id', roomId);

    if (!countError && remaining?.length === 0) {
         console.log(`API [/leave -> removeUser]: Room ${roomId} is empty. Deleting room.`);
         await supabase.from('chat_messages').delete().eq('room_id', roomId);
         await supabase.from('chat_rooms').delete().eq('id', roomId);
         console.log(`API [/leave -> removeUser]: Empty room ${roomId} cleanup attempted.`);
    } else if (countError) {
         console.error(`API [/leave -> removeUser]: Error counting remaining participants in room ${roomId}:`, countError);
    }

    // Return true if delete didn't error, false otherwise (for potential different status code)
    return !deleteError;
}
// --- End Helper ---


export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { roomId, userId } = body;

        if (!roomId || !userId) {
            return NextResponse.json({ message: 'Room ID and User ID are required.' }, { status: 400 });
        }

        const supabase = createSupabaseServerClient();
        const success = await removeUserFromRoom(supabase, roomId, userId);

        // Realtime handles notifying partner via participant change subscription
        if (success) {
            return NextResponse.json({ success: true, message: 'Successfully left the chat.' }, { status: 200 });
        } else {
             // Even if delete failed (e.g., user already gone), client likely considers it success
             return NextResponse.json({ success: true, message: 'Leave request processed (user might have already left).' }, { status: 200 });
        }

    } catch (error: any) {
        console.error("API Error [/api/chat/leave]:", error);
        if (error instanceof SyntaxError) {
             return NextResponse.json({ message: 'Invalid JSON payload.' }, { status: 400 });
         }
        return NextResponse.json({ success: false, message: error.message || 'Server error leaving chat.' }, { status: 500 });
    }
}