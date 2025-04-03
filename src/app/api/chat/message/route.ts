// src/app/api/chat/message/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { roomId, userId, text } = body;

        if (!roomId || !userId || !text || typeof text !== 'string' || text.trim().length === 0) {
            return NextResponse.json({ message: 'Room ID, User ID, and non-empty message text are required.' }, { status: 400 });
        }

        const supabase = createSupabaseServerClient();

        const { error } = await supabase
            .from('chat_messages')
            .insert({
                room_id: roomId,
                sender_id: userId, // Sender is the actual user
                message: text.trim(), // Trim whitespace
                is_system: false,
            });

        if (error) {
            console.error(`API Error [/api/chat/message]: Failed to insert message for room ${roomId} by ${userId}`, error);
            return NextResponse.json({ success: false, message: 'Failed to send message.', error: error.message }, { status: 500 });
        }

        // Message insertion will trigger Supabase Realtime for connected clients
        // No need to broadcast from here.
        console.log(`API [/message]: Message from ${userId} inserted into room ${roomId}`);
        return NextResponse.json({ success: true, message: 'Message sent.' }, { status: 200 });

    } catch (error: any) {
        console.error("API Error [/api/chat/message]:", error);
        // Check if the error is due to JSON parsing
         if (error instanceof SyntaxError) {
             return NextResponse.json({ message: 'Invalid JSON payload.' }, { status: 400 });
         }
        return NextResponse.json({ success: false, message: error.message || 'Server error sending message.' }, { status: 500 });
    }
}