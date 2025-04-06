import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

// type MatchResult = Database['public']['Functions']['find_available_room']['Returns'][number];

async function findOrCreateRoomForUser(supabase: SupabaseClient<Database>, userId: string) {
    console.log(`API [/start]: User ${userId} finding/creating room.`);

    const { data: rpcResult, error: rpcError } = await supabase.rpc(
        'find_available_room',
        { requesting_user_id: userId }
    );

    if (rpcError) {
        console.error("API [/start]: Error calling find_available_room RPC:", rpcError);
        throw new Error(`Database error finding room: ${rpcError.message}`);
    }

    if (!rpcResult) {
         console.error("API [/start]: RPC returned null or undefined result.");
         throw new Error("Matchmaking service returned an unexpected result.");
    }

    // Assuming RPC returns a single object or the first element of an array
    const matchData = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;

    if (!matchData || !matchData.room_id) {
         console.error("API [/start]: RPC response missing room_id:", matchData);
         throw new Error("Matchmaking service failed to provide a room ID.");
    }

    const roomId = matchData.room_id;
    const partnerId = matchData.other_user_id; // Will be null if waiting

    if (partnerId) {
        console.log(`API [/start]: User ${userId} matched in room ${roomId} with partner ${partnerId}.`);
         // Partner should already be in the room. We were added by the RPC (or should have been).
         // Post system message indicating join (partner will get this via Realtime)
         await supabase.from('chat_messages').insert({
             room_id: roomId,
             sender_id: 'system', // Use a reserved system ID or the user's ID? Let's use system.
             message: `User ${userId.substring(0, 8)}... has joined.`,
             is_system: true
         });
        return { roomId, partnerId, status: 'chatting' as const, message: 'Matched with a partner!' };
    } else {
        console.log(`API [/start]: User ${userId} created/joined room ${roomId} and is waiting.`);
         // Add a system message for the user who is now waiting
         await supabase.from('chat_messages').insert({
             room_id: roomId,
             sender_id: 'system',
             message: 'Waiting for a partner to join...',
             is_system: true,
         });
        return { roomId, partnerId: null, status: 'searching' as const, message: 'Waiting for a partner...' };
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { userId } = body;

        if (!userId || typeof userId !== 'string') {
            return NextResponse.json({ message: 'User ID is required and must be a string.' }, { status: 400 });
        }

        const supabase = createSupabaseServerClient();
        const result = await findOrCreateRoomForUser(supabase, userId);

        return NextResponse.json(result, { status: 200 });

    } catch (error: any) {
        console.error("API Error [/api/chat/start]:", error);
        if (error instanceof SyntaxError) {
            return NextResponse.json({ message: 'Invalid JSON payload.' }, { status: 400 });
        }
        return NextResponse.json({ message: error.message || 'Failed to start chat.' }, { status: 500 });
    }
}