// src/app/api/chat/start/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

// --- Service Logic (can be moved to a separate file) ---
async function findOrCreateRoomForUser(supabase: SupabaseClient, userId: string) {
    console.log(`API [/start]: User ${userId} finding/creating room.`);

    // Call the RPC function (ensure it's updated in Supabase!)
    const { data: potentialRooms, error: findError } = await supabase.rpc(
        'find_available_room',
        { requesting_user_id: userId }
    );

    // Log the raw response for debugging
    console.log(`API [/start]: RPC response for ${userId}: data=${JSON.stringify(potentialRooms)}, error=${JSON.stringify(findError)}`);

    if (findError) {
        // Log the specific SQL error from Supabase
        console.error("API [/start]: Error calling find_available_room RPC:", findError);
        // Provide a more specific error message if possible
        throw new Error(`Database error finding room: ${findError.message}`);
    }

    // Check if the RPC returned a valid room
    if (potentialRooms && Array.isArray(potentialRooms) && potentialRooms.length > 0) {
        const room = potentialRooms[0];
        const roomId = room.room_id;
        const partnerId = room.other_user_id;
        console.log(`API [/start]: User ${userId} found available room ${roomId} with partner ${partnerId}. Joining...`);

        // --- Attempt to JOIN the existing room ---
        const { error: joinError } = await supabase
            .from('chat_participants')
            .insert({ room_id: roomId, user_id: userId });

        if (joinError) {
            // Log join error, could be race condition or DB constraint
            console.error(`API [/start]: Error joining room ${roomId} for user ${userId}:`, joinError);
            console.warn(`API [/start]: Join failed, falling back to create for ${userId}.`);
            // Allow execution to fall through to the 'create new room' logic
        } else {
             // Successfully joined!
             console.log(`API [/start]: User ${userId} joined room ${roomId}. Inserting system message.`);
             // Post system message indicating join (partner will get this via Realtime)
             await supabase.from('chat_messages').insert({
                 room_id: roomId,
                 sender_id: 'system',
                 message: `User ${userId.substring(0, 8)}... has joined.`, // Use substring for privacy/brevity
                 is_system: true
             });
             // Return 'chatting' status as they joined an existing waiting room
            return { roomId, status: 'chatting', created: false, message: 'Joined existing chat!' };
        }
    }

    // --- If no room found OR join failed, CREATE a new room ---
    console.log(`API [/start]: No available room found or join failed for ${userId}. Creating new...`);
    const { data: newRoom, error: createError } = await supabase
        .from('chat_rooms')
        .insert({}) // Insert empty object to create a new row
        .select() // Select the newly created row
        .single(); // Expect only one row

    if (createError || !newRoom) {
        console.error("API [/start]: Error creating new room:", createError);
        throw new Error(`Database error creating room: ${createError?.message}`);
    }
    const newRoomId = newRoom.id;
    console.log(`API [/start]: Created new room ${newRoomId}. Adding participant ${userId}...`);

    // Add the user as the first participant in the new room
    const { error: firstParticipantError } = await supabase
        .from('chat_participants')
        .insert({ room_id: newRoomId, user_id: userId });

    if (firstParticipantError) {
        console.error(`API [/start]: Error adding user ${userId} to new room ${newRoomId}:`, firstParticipantError);
        // Attempt to clean up the room we just created if adding participant failed
        await supabase.from('chat_rooms').delete().eq('id', newRoomId);
        console.error(`API [/start]: Cleaned up room ${newRoomId} due to participant add failure.`);
        throw new Error(`Failed to initialize chat room: ${firstParticipantError.message}`);
    }

    console.log(`API [/start]: User ${userId} created and joined room ${newRoomId}. Waiting.`);
     // Add a system message for the user who is now waiting
     await supabase.from('chat_messages').insert({
         room_id: newRoomId,
         sender_id: 'system',
         message: 'Waiting for a partner to join...',
         is_system: true,
     });

    // Return 'searching' status as they are alone in the new room
    return { roomId: newRoomId, status: 'searching', created: true, message: 'Waiting for a partner...' };
}
// --- End Service Logic ---

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { userId } = body;

        if (!userId || typeof userId !== 'string') {
            return NextResponse.json({ message: 'User ID is required and must be a string.' }, { status: 400 });
        }

        // Create client within request scope using Anon key by default
        const supabase = createSupabaseServerClient();
        const result = await findOrCreateRoomForUser(supabase, userId);

        // Send the result back to the client
        return NextResponse.json(result, { status: 200 });

    } catch (error: any) {
        console.error("API Error [/api/chat/start]: Unhandled exception:", error);
        // Distinguish between JSON parsing errors and other errors
        if (error instanceof SyntaxError) {
            return NextResponse.json({ message: 'Invalid JSON payload.' }, { status: 400 });
        }
        // Return the specific error message from the service logic if available
        return NextResponse.json({ message: error.message || 'Failed to start chat due to server error.' }, { status: 500 });
    }
}