import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import type {
    RealtimeChannel,
    RealtimePresenceState,
    RealtimePostgresChangesPayload,
    REALTIME_SUBSCRIBE_STATES,
    SupabaseClient
} from "@supabase/supabase-js";
import type { Message } from "@/types/chat"; // Assuming Message type is defined here

// Define interfaces for your database table structures used in Realtime payloads
// Replace with actual column names and types from your Supabase schema
interface ChatMessagePayload {
    id: string; // Assuming UUID in DB corresponds to string
    created_at: string; // ISO timestamp string
    room_id: string;
    sender_id: string;
    message: string;
    is_system?: boolean; // Optional system flag
    target_user_id?: string | null; // Optional target user
    // Add other relevant fields from your chat_messages table
}

interface ChatParticipantPayload {
    id: number; // Or whatever the primary key type is
    room_id: string;
    user_id: string;
    joined_at: string;
    // Add other relevant fields from your chat_participants table
}

interface PresencePayload {
    is_typing: boolean;
    user_id: string;
    // Add any other presence info you track
}

interface UseChatRealtimeProps {
    supabase: SupabaseClient | null; // Allow null initially
    roomId: string | null;
    userId: string;
    onNewMessage: (text: string, sender: "stranger" | "system", msgId: string, timestamp: number) => void;
    onSystemMessage: (text: string) => void;
    onPartnerJoined: () => void;
    onPartnerLeft: () => void;
    onSubscriptionError: (context: string, error: Error) => void;
}

export function useChatRealtime({
    supabase,
    roomId,
    userId,
    onNewMessage,
    onSystemMessage,
    onPartnerJoined,
    onPartnerLeft,
    onSubscriptionError,
}: UseChatRealtimeProps) {
    const [isPartnerTyping, setIsPartnerTyping] = useState(false);

    const messageChannel = useRef<RealtimeChannel | null>(null);
    const participantChannel = useRef<RealtimeChannel | null>(null);
    const presenceChannel = useRef<RealtimeChannel | null>(null);
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const cleanupSubscriptions = useCallback(async () => {
        if (!supabase) return;
        const channels = [messageChannel.current, participantChannel.current, presenceChannel.current];
        console.log("Realtime: Cleaning up subscriptions...");

        for (const channel of channels) {
            if (channel) {
                try {
                    if (['joined', 'joining'].includes(channel.state)) {
                        await channel.unsubscribe();
                        console.log(`Realtime: Unsubscribed from ${channel.topic}`);
                    } else {
                        console.log(`Realtime: Channel ${channel.topic} state is ${channel.state}, no need to unsubscribe.`);
                    }
                } catch (error) {
                    console.error(`Realtime: Error unsubscribing from ${channel.topic}:`, error);
                }
            }
        }

        // Remove all tracked channels for robustness (optional but good)
        try {
            await supabase.removeAllChannels();
             console.log("Realtime: Removed all channels from Supabase client.");
        } catch (error) {
             console.error("Realtime: Error removing all channels:", error);
        }

        messageChannel.current = null;
        participantChannel.current = null;
        presenceChannel.current = null;
        setIsPartnerTyping(false); // Reset typing status on cleanup
         if (typingTimeoutRef.current) { // Clear any pending typing timeout
             clearTimeout(typingTimeoutRef.current);
             typingTimeoutRef.current = null;
         }
        console.log("Realtime: Subscription refs cleared.");
    }, [supabase]);


    useEffect(() => {
        if (!roomId || !supabase) {
            cleanupSubscriptions();
            return;
        }

        console.log(`Realtime: Setting up subscriptions for Room: ${roomId}`);

        // --- Message Subscription ---
        messageChannel.current = supabase.channel(`chat_messages:${roomId}`)
            .on<ChatMessagePayload>(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}` },
                (payload: RealtimePostgresChangesPayload<ChatMessagePayload>) => {
                    console.log('Realtime: New message payload received:', payload.new);
                    const newMessage = payload.new as ChatMessagePayload;
                    if (newMessage && newMessage.sender_id !== userId) {
                         // Ignore if targeted and not for me
                         if (newMessage.target_user_id && newMessage.target_user_id !== userId) {
                             console.log(`Realtime: Ignoring targeted message ${newMessage.id} not for user ${userId}`);
                             return;
                         }
                        const senderType = newMessage.is_system ? "system" : "stranger";
                        onNewMessage(
                            newMessage.message,
                            senderType,
                            newMessage.id,
                            new Date(newMessage.created_at).getTime()
                        );
                        // If stranger sent a message, they are not typing
                        if (senderType === 'stranger') {
                            setIsPartnerTyping(false);
                        }
                    }
                }
            )
            .subscribe((status: REALTIME_SUBSCRIBE_STATES, err?: Error) => {
                 if (status === 'SUBSCRIBED') {
                      console.log(`Realtime: Subscribed to messages for room ${roomId}`);
                 } else if (err) {
                      console.error(`Realtime: Message subscription error for ${roomId}:`, err);
                      onSubscriptionError("Could not listen for new messages", err);
                 }
            });

        // --- Participant Subscription ---
        participantChannel.current = supabase.channel(`chat_participants:${roomId}`)
            .on<ChatParticipantPayload>(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'chat_participants', filter: `room_id=eq.${roomId}` },
                async (payload: RealtimePostgresChangesPayload<ChatParticipantPayload>) => {
                    console.log('Realtime: Participant change payload:', payload);

                    // Fetch count *after* event payload is processed for more accuracy
                    const { count, error } = await supabase
                         .from('chat_participants')
                         .select('*', { count: 'exact', head: true })
                         .eq('room_id', roomId);

                    if (error) {
                        console.error("Realtime: Error fetching participant count:", error);
                        return; // Or call onSubscriptionError?
                    }
                    console.log(`Realtime: Participant count for room ${roomId} is now ${count}`);

                    if (payload.eventType === 'INSERT') {
                        const joinedUserId = payload.new.user_id;
                         // Check if *another* user joined and now there are exactly 2
                         if (joinedUserId !== userId && count === 2) {
                             console.log(`Realtime: Partner (${joinedUserId}) joined room ${roomId}.`);
                             onPartnerJoined();
                         }
                    } else if (payload.eventType === 'DELETE') {
                        const leftUserId = payload.old?.user_id; // Use optional chaining
                        if (leftUserId && leftUserId !== userId) {
                             console.log(`Realtime: Partner (${leftUserId}) left room ${roomId}.`);
                             onPartnerLeft();
                             setIsPartnerTyping(false); // Partner left, they can't be typing
                             // No need to cleanup here, the main effect handles roomId changes
                        }
                    }
                }
            )
             .subscribe((status: REALTIME_SUBSCRIBE_STATES, err?: Error) => {
                 if (status === 'SUBSCRIBED') {
                      console.log(`Realtime: Subscribed to participants for room ${roomId}`);
                 } else if (err) {
                      console.error(`Realtime: Participant subscription error for ${roomId}:`, err);
                       onSubscriptionError("Could not monitor chat participants", err);
                 }
            });

         // --- Presence (Typing Indicator) Subscription ---
         presenceChannel.current = supabase.channel(`typing:${roomId}`, {
              config: {
                  presence: {
                      key: userId, // Unique key for this user's presence
                  },
              },
         });

         presenceChannel.current
              .on('presence', { event: 'sync' }, () => {
                  const newState: RealtimePresenceState<PresencePayload> = presenceChannel.current!.presenceState();
                  // console.log('Realtime: Presence sync', newState);
                  let partnerIsCurrentlyTyping = false;
                  for (const id in newState) {
                       if (id !== userId) {
                           const userPresence = newState[id]?.[0]; // Get the first presence state for the user
                           if (userPresence?.is_typing) {
                               partnerIsCurrentlyTyping = true;
                               break;
                           }
                       }
                  }
                  if (isPartnerTyping !== partnerIsCurrentlyTyping) {
                     setIsPartnerTyping(partnerIsCurrentlyTyping);
                  }
               })
               .on('presence', { event: 'leave' }, ({ key }) => {
                   // console.log('Realtime: Presence leave', key);
                   if (key !== userId) {
                       // Partner's presence record left, ensure typing is false
                       setIsPartnerTyping(false);
                   }
               })
               .subscribe(async (status: REALTIME_SUBSCRIBE_STATES, err?: Error) => {
                   if (status === 'SUBSCRIBED') {
                       console.log(`Realtime: Subscribed to presence for room ${roomId}. Tracking self.`);
                       // Track initial state (not typing)
                       try {
                            const trackStatus = await presenceChannel.current?.track({ is_typing: false, user_id: userId } as PresencePayload);
                            // console.log('Realtime: Initial presence track status:', trackStatus);
                       } catch (trackError: any) {
                           console.error("Realtime: Error tracking initial presence:", trackError);
                           onSubscriptionError("Could not set up typing indicators", trackError);
                       }
                   } else if (err) {
                      console.error(`Realtime: Presence subscription error for ${roomId}:`, err);
                       onSubscriptionError("Could not set up typing indicators", err);
                   }
               });

        // Return the cleanup function for this effect
        return () => {
            console.log(`Realtime: Cleanup effect running for roomId ${roomId}`);
            cleanupSubscriptions();
        };
    // Rerun when roomId or supabase client changes
    }, [roomId, userId, supabase, cleanupSubscriptions, onNewMessage, onSystemMessage, onPartnerJoined, onPartnerLeft, onSubscriptionError]); // Added isPartnerTyping state itself to deps? No, internal state.


     // Function to be called by the main hook to update presence
     const sendTypingPresence = useCallback((isTypingUpdate: boolean) => {
        if (!presenceChannel.current || presenceChannel.current.state !== 'joined') return;

        // Clear existing timeout if user continues typing
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = null;
        }

        const payload: PresencePayload = { is_typing: isTypingUpdate, user_id: userId };

        if (isTypingUpdate) {
             // console.log('Tracking typing: true');
             presenceChannel.current.track(payload).catch(err => console.error("Presence track error (true):", err));
        } else {
             // Debounce sending typing=false
             typingTimeoutRef.current = setTimeout(() => {
                 // console.log('Tracking typing: false (debounced)');
                 presenceChannel.current?.track(payload).catch(err => console.error("Presence track error (false):", err));
                 typingTimeoutRef.current = null;
             }, 1500); // Send 'stopped typing' after 1.5 seconds of inactivity
        }
    }, [userId]); // roomId is implicitly handled by the channel ref lifecycle

    // Cleanup timeout on unmount
     useEffect(() => {
         return () => {
             if (typingTimeoutRef.current) {
                 clearTimeout(typingTimeoutRef.current);
             }
         };
     }, []);


    return {
        isPartnerTyping,
        sendTypingPresence,
    };
}
