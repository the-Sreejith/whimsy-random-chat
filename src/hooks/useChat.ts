'use client';

import { useState, useEffect, useCallback, useMemo } from "react";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";
import { Message, ChatStatus, SignalingMessage } from "@/types/chat";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useChatRealtime } from "./useChatRealtime";
import * as ChatApi from "./useChatApi";

export function useChat() {
    const [userId, setUserId] = useState<string>('');
    const [status, setStatus] = useState<ChatStatus>("idle");
    const [messages, setMessages] = useState<Message[]>([]);
    const [roomId, setRoomId] = useState<string | null>(null);
    const [partnerId, setPartnerId] = useState<string | null>(null);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            let id = localStorage.getItem('whimsyUserId');
            if (!id) {
                id = uuidv4();
                localStorage.setItem('whimsyUserId', id);
            }
            setUserId(id);
        }
    }, []);

    const supabase = useMemo(() => getSupabaseBrowserClient(), []);

    const addMessage = useCallback((text: string, sender: "me" | "stranger" | "system", msgId?: string, timestamp?: number) => {
        const newMessage: Message = {
            id: msgId || uuidv4(),
            text,
            sender,
            timestamp: timestamp || Date.now(),
            system: sender === "system",
        };
        setMessages((prev) => {
            if (msgId && prev.some(m => m.id === msgId)) {
                return prev;
            }
            return [...prev, newMessage].sort((a, b) => a.timestamp - b.timestamp);
        });
    }, []);

    const addSystemMessage = useCallback((text: string) => {
        addMessage(text, "system");
    }, [addMessage]);

     const handleNewMessage = useCallback((text: string, sender: "stranger" | "system", msgId: string, timestamp: number) => {
         addMessage(text, sender, msgId, timestamp);
     }, [addMessage]);

     const handlePartnerJoined = useCallback((joinedPartnerId: string) => {
         setStatus(prevStatus => {
            if (prevStatus === 'searching') {
                setPartnerId(joinedPartnerId);
                addSystemMessage("A stranger has connected!");
                return "chatting";
            }
            // If already chatting and another joins (edge case?), update partner ID
             setPartnerId(joinedPartnerId);
            return prevStatus;
         });
     }, [addSystemMessage]);

     const handlePartnerLeft = useCallback(() => {
         addSystemMessage("The stranger has disconnected.");
         setStatus("disconnected");
         setRoomId(null);
         setPartnerId(null);
     }, [addSystemMessage]);

      const handleSignalingMessage = useCallback((payload: SignalingMessage) => {
         if (payload.target !== userId) return;
         console.log("Received signaling message:", payload.type);
          // Pass to WebRTC hook via prop or context in the component
          // This requires the component (ChatInterface) to manage passing this down
          // Or use a shared context/state manager
          const event = new CustomEvent('webrtc-signal', { detail: payload });
          window.dispatchEvent(event);
     }, [userId]);

     const handleSubscriptionError = useCallback((context: string, error: Error) => {
         toast.error(`Realtime Error: ${context}`, { description: error.message });
         setStatus("disconnected");
         setRoomId(null);
         setPartnerId(null);
     }, []);

    const { isPartnerTyping, sendTypingPresence, sendSignalingMessage: sendSignalViaRealtime } = useChatRealtime({
        supabase,
        roomId,
        userId,
        onNewMessage: handleNewMessage,
        onPartnerJoined: handlePartnerJoined,
        onPartnerLeft: handlePartnerLeft,
        onSignalingMessage: handleSignalingMessage,
        onSubscriptionError: handleSubscriptionError,
    });

    const startChat = useCallback(async () => {
        if (status === 'searching' || status === 'chatting' || !userId) return;

        setStatus("searching");
        setMessages([]);
        setRoomId(null);
        setPartnerId(null);
        addSystemMessage("Looking for someone to chat with...");

        try {
            const data = await ChatApi.startChatApi(userId);
            setRoomId(data.roomId);
            setStatus(data.status);
            if (data.partnerId) {
                setPartnerId(data.partnerId);
                 if (data.status === 'chatting') {
                     addSystemMessage("Connected to a chat!");
                 }
            } else if (data.status === 'searching') {
                 addSystemMessage("Waiting for a partner...");
            }

        } catch (error: any) {
             console.error("Error starting chat:", error);
             toast.error("Failed to start chat", { description: error.message });
             setStatus("idle");
             setRoomId(null);
             setPartnerId(null);
        }
    }, [userId, status, addSystemMessage]);

    const sendMessage = useCallback(async (text: string) => {
        if (!text.trim() || !roomId || status !== 'chatting' || !userId) return;

        const localMessageId = uuidv4();
        addMessage(text, "me", localMessageId);
        sendTypingPresence(false);

        try {
            await ChatApi.sendMessageApi(roomId, userId, text);
        } catch (error: any) {
             console.error("Error sending message:", error);
             setMessages(prev => prev.filter(m => m.id !== localMessageId));
             addSystemMessage(`Error: Message failed to send.`);
             toast.error("Failed to send message", { description: error.message });
        }
    }, [roomId, userId, status, addMessage, addSystemMessage, sendTypingPresence]);

    const sendTyping = useCallback((isTypingUpdate: boolean) => {
        if (status !== 'chatting') return;
        sendTypingPresence(isTypingUpdate);
    }, [status, sendTypingPresence]);


    const nextChat = useCallback(async () => {
        if (status === 'searching' || !userId) return;

        const previousRoomId = roomId;
        setStatus("searching");
        addSystemMessage("Finding a new chat partner...");
        setRoomId(null);
        setPartnerId(null);


        try {
             const data = await ChatApi.nextChatApi(userId, previousRoomId);
             setMessages([]);
             setRoomId(data.roomId);
             setStatus(data.status);
             if (data.partnerId) {
                 setPartnerId(data.partnerId);
                  if (data.status === 'chatting') {
                     addSystemMessage("Connected to a new chat!");
                 }
             } else if (data.status === 'searching') {
                  addSystemMessage("Waiting for a partner...");
             }

        } catch (error: any) {
             console.error("Error finding next chat:", error);
             toast.error("Failed to find next chat", { description: error.message });
             setStatus("disconnected");
             addSystemMessage("Failed to find a new chat. Try starting again.");
             setRoomId(null);
             setPartnerId(null);
        }
    }, [userId, roomId, status, addSystemMessage]);

    const endChat = useCallback(async () => {
        if (!roomId || status === 'idle' || status === 'disconnected' || !userId) return;

        const previousRoomId = roomId;
        setStatus("disconnected");
        addSystemMessage("You have disconnected.");
        setRoomId(null);
        setPartnerId(null);
        sendTypingPresence(false);

        try {
            await ChatApi.leaveChatApi(previousRoomId, userId);
        } catch (error: any) {
             console.error("Error notifying backend on endChat:", error);
        }
    }, [roomId, userId, status, addSystemMessage, sendTypingPresence]);

     const sendSignalingMessage = useCallback(async (payload: Omit<SignalingMessage, 'sender'>) => {
        if (!roomId || !partnerId || !userId) return;
        const message: SignalingMessage = { ...payload, sender: userId, target: partnerId };
        await sendSignalViaRealtime(message);
     }, [roomId, partnerId, userId, sendSignalViaRealtime]);

    useEffect(() => {
        const currentRoomId = roomId;
        return () => {
             // No automatic leave on unmount for now to avoid issues with HMR etc.
             // Cleanup is handled by useChatRealtime's useEffect.
        };
    }, [userId]);


    return {
        userId,
        status,
        messages,
        roomId,
        partnerId,
        isTyping: isPartnerTyping,
        startChat,
        sendMessage,
        sendTyping,
        nextChat,
        endChat,
        sendSignalingMessage,
    };
}