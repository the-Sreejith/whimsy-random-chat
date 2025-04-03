'use client';

import { useState, useEffect, useCallback, useMemo } from "react";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";
import { Message, ChatStatus } from "@/types/chat";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useChatRealtime } from "./useChatRealtime";
import * as ChatApi from "./useChatApi"; // Import API functions

export function useChat() {
    const [userId] = useState<string>(() => {
        if (typeof window !== 'undefined') {
            let id = localStorage.getItem('whimsyUserId');
            if (!id) {
                id = uuidv4();
                localStorage.setItem('whimsyUserId', id);
            }
            return id;
        }
        // Fallback for environments without localStorage (SSR/testing) - might need adjustment
        return uuidv4();
    });

    const [status, setStatus] = useState<ChatStatus>("idle");
    const [messages, setMessages] = useState<Message[]>([]);
    const [roomId, setRoomId] = useState<string | null>(null);

    // Instantiate Supabase client once
    const supabase = useMemo(() => getSupabaseBrowserClient(), []);

    // --- Message Handling ---
    const addMessage = useCallback((text: string, sender: "me" | "stranger" | "system", msgId?: string, timestamp?: number) => {
        const newMessage: Message = {
            id: msgId || uuidv4(), // Use DB id if available, else generate UI id
            text,
            sender,
            timestamp: timestamp || Date.now(),
            system: sender === "system",
        };
        setMessages((prev) => {
            // Avoid adding duplicate messages if msgId is provided and already exists
            if (msgId && prev.some(m => m.id === msgId)) {
                return prev;
            }
            // Add message and sort by timestamp to ensure order
            return [...prev, newMessage].sort((a, b) => a.timestamp - b.timestamp);
        });
    }, []);

    const addSystemMessage = useCallback((text: string) => {
        addMessage(text, "system");
    }, [addMessage]);


    // --- Realtime Callbacks ---
     const handleNewMessage = useCallback((text: string, sender: "stranger" | "system", msgId: string, timestamp: number) => {
         addMessage(text, sender, msgId, timestamp);
     }, [addMessage]);

     const handlePartnerJoined = useCallback(() => {
         // Only transition from searching to chatting when partner joins
         setStatus(prevStatus => {
            if (prevStatus === 'searching') {
                addSystemMessage("A stranger has connected!");
                return "chatting";
            }
            return prevStatus; // Remain in current state otherwise
         });
     }, [addSystemMessage]);

     const handlePartnerLeft = useCallback(() => {
         addSystemMessage("The stranger has disconnected.");
         setStatus("disconnected");
         setRoomId(null); // Clear room ID, triggers realtime cleanup
     }, [addSystemMessage]);

     const handleSubscriptionError = useCallback((context: string, error: Error) => {
         toast.error(`Realtime Error: ${context}`, { description: error.message });
         // Depending on the error, might need to transition state, e.g., to disconnected
         // setStatus("disconnected");
     }, []);

    // --- Use Realtime Hook ---
    const { isPartnerTyping, sendTypingPresence } = useChatRealtime({
        supabase,
        roomId,
        userId,
        onNewMessage: handleNewMessage,
        onSystemMessage: addSystemMessage, // Pass directly if Realtime needs to add system messages
        onPartnerJoined: handlePartnerJoined,
        onPartnerLeft: handlePartnerLeft,
        onSubscriptionError: handleSubscriptionError,
    });


    // --- Chat Actions ---

    const startChat = useCallback(async () => {
        if (status === 'searching' || status === 'chatting') return;

        setStatus("searching");
        setMessages([]); // Clear messages for new chat
        setRoomId(null); // Ensure room ID is null before starting
        addSystemMessage("Looking for someone to chat with...");

        try {
            const data = await ChatApi.startChatApi(userId);
            setRoomId(data.roomId); // Triggers realtime setup
            // Status might be 'searching' or 'chatting' depending on immediate match
            setStatus(data.status);
            // System messages about connection status are now handled by Realtime callbacks

        } catch (error: any) {
             // API function already showed toast
             console.error("Error starting chat:", error);
             setStatus("idle"); // Revert to idle on failure
             setRoomId(null); // Ensure cleanup
        }
    }, [userId, status, addSystemMessage]); // Removed roomId, setRoomId deps? addSystemMessage needed.

    const sendMessage = useCallback(async (text: string) => {
        if (!text.trim() || !roomId || status !== 'chatting') return;

        // Add message locally immediately
        const localMessageId = uuidv4(); // Use a temporary local ID
        addMessage(text, "me", localMessageId);
        sendTypingPresence(false); // Stop typing immediately

        try {
            await ChatApi.sendMessageApi(roomId, userId, text);
            // Success: message is sent. Realtime handles receiver.
            // Optional: Update local message state from 'sending' to 'sent' if needed
        } catch (error: any) {
            // API function already showed toast
             console.error("Error sending message:", error);
             // Revert local message or mark as failed
             setMessages(prev => prev.filter(m => m.id !== localMessageId));
             addSystemMessage(`Error: Message failed to send.`);
        }
    }, [roomId, userId, status, addMessage, addSystemMessage, sendTypingPresence]);

    const sendTyping = useCallback((isTypingUpdate: boolean) => {
        if (status !== 'chatting') return;
        sendTypingPresence(isTypingUpdate);
    }, [status, sendTypingPresence]);


    const nextChat = useCallback(async () => {
        if (status === 'searching') return; // Avoid spamming next during search

        const previousRoomId = roomId; // Store current room ID before changing state
        setStatus("searching");
        addSystemMessage("Finding a new chat partner...");
        setRoomId(null); // This triggers cleanup of old room's Realtime subs

        try {
             const data = await ChatApi.nextChatApi(userId, previousRoomId);
             setMessages([]); // Clear messages for new chat
             setRoomId(data.roomId); // Triggers Realtime setup for new room
             setStatus(data.status);
             // System messages handled by Realtime callbacks

        } catch (error: any) {
             // API function already showed toast
             console.error("Error finding next chat:", error);
             setStatus("disconnected"); // Indicate failure state
             addSystemMessage("Failed to find a new chat. Try starting again.");
             setRoomId(null); // Ensure cleanup on error
        }
    }, [userId, roomId, status, addSystemMessage]);

    const endChat = useCallback(async () => {
        if (!roomId || status === 'idle' || status === 'disconnected') return;

        const previousRoomId = roomId;
        setStatus("disconnected");
        addSystemMessage("You have disconnected.");
        setRoomId(null); // Triggers realtime cleanup
        sendTypingPresence(false); // Ensure typing indicator is off

        try {
            // Notify backend we left (cleans up DB, notifies partner via their subs)
            await ChatApi.leaveChatApi(previousRoomId, userId);
        } catch (error: any) {
             // API function handles logging, toast might be excessive here
             console.error("Error notifying backend on endChat:", error);
        }
    }, [roomId, userId, status, addSystemMessage, sendTypingPresence]);


    // --- Cleanup Effect for component unmount ---
    // This ensures that if the component using the hook unmounts entirely,
    // we attempt a final cleanup and potentially notify the backend.
    useEffect(() => {
        const currentRoomId = roomId; // Capture roomId at the time the effect is set up
        return () => {
            console.log('Chat hook unmounting...');
            // Optional: Automatically end chat on unmount?
            // Be cautious: might trigger unintended disconnects on temporary unmounts (e.g., HMR)
            // if (currentRoomId && (status === 'chatting' || status === 'searching')) {
            //     console.log(`Chat hook unmounting: Notifying backend about leaving room ${currentRoomId}`);
            //     ChatApi.leaveChatApi(currentRoomId, userId);
            // }
             // The useChatRealtime hook handles its own internal subscription cleanup via its useEffect.
        };
        // }, [roomId, userId, status]); // Re-run if these change to capture correct state for cleanup
        // Let's simplify deps - the core issue is unmounting, not state changes within the mounted component.
    }, [userId]); // Only userId dependency seems safe for unmount cleanup logic


    return {
        status,
        messages,
        isTyping: isPartnerTyping, // Expose partner's typing status from realtime hook
        startChat,
        sendMessage,
        sendTyping,
        nextChat,
        endChat,
    };
}