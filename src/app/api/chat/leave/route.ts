// src/app/api/chat/leave/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// --- Adapted Service Logic ---
async function removeUserFromRoom(supabase: ReturnType<typeof createSupabaseServerClient>, roomId: string, userId: string) {
    console.log(`API [/leave]: Removing participant ${userId} from room ${roomId}...`);

    // 1. Post "disconnected" message *before* deleting participant (so they might receive it)
    // This relies on Realtime being slightly faster than the delete operation completing.
    // Targeting isn't strictly necessary if RLS prevents the leaving user seeing it after removal.
    await supabase.from('chat_messages').insert({
        room_id: roomId,
        sender_id: 'system',
        message: `${userId} has disconnected.`, // Use a generic ID or alias if desired
        is_system: true
    });

    // 2. Delete the participant
    const { error: deleteError } = await supabase
        .from('chat_participants')
        .delete()
        .eq('user_id', userId)
        .eq('room_id', roomId);

    if (deleteError) {
        console.error(`API [/leave]: Error removing participant ${userId} from room ${roomId}:`, deleteError);
        // Don't throw here, maybe the user was already gone. Log it.
        return false; // Indicate potential issue
    }
     console.log(`API [/leave]: Participant ${userId} deleted from room ${roomId}.`);

    // 3. Check if room is empty and clean up (optional but recommended)
    const { data: remaining, error: countError } = await supabase
        .from('chat_participants')
        .select('id', { count: 'exact' })
        .eq('room_id', roomId);

    if (!countError && remaining && remaining.length === 0) {
         console.log(`API [/leave]: Room ${roomId} is empty after ${userId} left. Deleting room and messages...`);
         // Best effort cleanup
         await supabase.from('chat_messages').delete().eq('room_id', roomId);
         await supabase.from('chat_rooms').delete().eq('id', roomId);
         console.log(`API [/leave]: Empty room ${roomId} cleanup attempted.`);
    } else if (countError) {
         console.error(`API [/leave]: Error counting remaining participants in room ${roomId}:`, countError);
    }

    return true; // Participant delete itself was successful or didn't error
}
// --- End Adapted Service Logic ---

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { roomId, userId } = body;

        if (!roomId || !userId) {
            return NextResponse.json({ message: 'Room ID and User ID are required.' }, { status: 400 });
        }

        const supabase = createSupabaseServerClient();
        const success = await removeUserFromRoom(supabase, roomId, userId);

        // The removal itself triggers Realtime events for participant changes.
        if (success) {
            return NextResponse.json({ success: true, message: 'Successfully left the chat.' }, { status: 200 });
        } else {
            // This might mean the delete failed, or just the cleanup check failed.
            // The user might already be gone. Return success anyway from client perspective?
             // Let's return success as the intent is likely fulfilled client-side.
             return NextResponse.json({ success: true, message: 'Leave request processed.' }, { status: 200 });
            // Or return a different status if needed:
            // return NextResponse.json({ success: false, message: 'Could not confirm leave operation or room cleanup failed.' }, { status: 500 });
        }

    } catch (error: any) {
        console.error("API Error [/api/chat/leave]:", error);
        if (error instanceof SyntaxError) {
             return NextResponse.json({ message: 'Invalid JSON payload.' }, { status: 400 });
         }
        return NextResponse.json({ success: false, message: error.message || 'Server error leaving chat.' }, { status: 500 });
    }
}