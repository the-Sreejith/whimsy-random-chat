import { useState, useEffect, useCallback, useRef } from "react";
import type {
    RealtimeChannel,
    RealtimePresenceState,
    RealtimePostgresChangesPayload,
    REALTIME_SUBSCRIBE_STATES,
    SupabaseClient
} from "@supabase/supabase-js";
import type { Database } from '@/types/supabase';
import type { SignalingMessage } from "@/types/chat";

type ChatMessagePayload = Database['public']['Tables']['chat_messages']['Row'];
type ChatParticipantPayload = Database['public']['Tables']['chat_participants']['Row'];

interface PresencePayload {
    is_typing: boolean;
    user_id: string;
}

interface UseChatRealtimeProps {
    supabase: SupabaseClient<Database> | null;
    roomId: string | null;
    userId: string;
    onNewMessage: (text: string, sender: "stranger" | "system", msgId: string, timestamp: number) => void;
    onPartnerJoined: (partnerId: string) => void;
    onPartnerLeft: () => void;
    onSignalingMessage: (payload: SignalingMessage) => void;
    onSubscriptionError: (context: string, error: Error) => void;
}

export function useChatRealtime({
    supabase,
    roomId,
    userId,
    onNewMessage,
    onPartnerJoined,
    onPartnerLeft,
    onSignalingMessage,
    onSubscriptionError,
}: UseChatRealtimeProps) {
    const [isPartnerTyping, setIsPartnerTyping] = useState(false);

    const mainChannel = useRef<RealtimeChannel | null>(null);
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const cleanupSubscriptions = useCallback(async () => {
        if (!supabase) return;
        console.log("Realtime: Cleaning up subscriptions...");

        if (mainChannel.current) {
            try {
                if (['joined', 'joining'].includes(mainChannel.current.state)) {
                    await mainChannel.current.unsubscribe();
                    console.log(`Realtime: Unsubscribed from ${mainChannel.current.topic}`);
                }
            } catch (error) {
                console.error(`Realtime: Error unsubscribing from ${mainChannel.current.topic}:`, error);
            }
        }

        try {
            await supabase.removeAllChannels();
             console.log("Realtime: Removed all channels from Supabase client.");
        } catch (error) {
             console.error("Realtime: Error removing all channels:", error);
        }

        mainChannel.current = null;
        setIsPartnerTyping(false);
         if (typingTimeoutRef.current) {
             clearTimeout(typingTimeoutRef.current);
             typingTimeoutRef.current = null;
         }
        console.log("Realtime: Subscription refs cleared.");
    }, [supabase]);


    useEffect(() => {
        if (!roomId || !supabase || !userId) {
            cleanupSubscriptions();
            return;
        }

        console.log(`Realtime: Setting up main channel for Room: ${roomId}`);

        mainChannel.current = supabase.channel(`room:${roomId}`, {
            config: {
                presence: { key: userId },
                broadcast: { self: false, ack: true }
            }
        });

        const handleIncomingBroadcast = (event: { type: string, payload: any }) => {
             console.log(`Realtime: Received broadcast event '${event.type}'`);
             switch (event.type) {
                case 'video-offer':
                case 'video-answer':
                case 'ice-candidate':
                    onSignalingMessage(event.payload as SignalingMessage);
                    break;
                case 'partner_left': // Optional direct message if needed
                    // onPartnerLeft(); // Usually handled by participant changes
                    break;
                default:
                    console.warn(`Realtime: Unknown broadcast event type: ${event.type}`);
            }
        };

        mainChannel.current
            .on<ChatMessagePayload>(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}` },
                (payload) => {
                    console.log('Realtime: New message payload received:', payload.new);
                    const newMessage = payload.new as ChatMessagePayload;
                    if (newMessage && newMessage.sender_id !== userId) {
                        const senderType = newMessage.is_system ? "system" : "stranger";
                        onNewMessage(
                            newMessage.message ?? '',
                            senderType,
                            newMessage.id,
                            new Date(newMessage.created_at).getTime()
                        );
                        if (senderType === 'stranger') {
                            setIsPartnerTyping(false);
                        }
                    }
                }
            )
            .on<ChatParticipantPayload>(
                 'postgres_changes',
                 { event: '*', schema: 'public', table: 'chat_participants', filter: `room_id=eq.${roomId}` },
                 async (payload) => {
                     console.log('Realtime: Participant change payload:', payload);
                     const { count, error } = await supabase
                          .from('chat_participants')
                          .select('user_id', { count: 'exact', head: false }) // Fetch user IDs
                          .eq('room_id', roomId);

                     if (error) {
                         console.error("Realtime: Error fetching participants:", error);
                         return;
                     }

                     const participants = count || [];
                     const partner = participants.find(p => p.user_id !== userId);

                     if (payload.eventType === 'INSERT') {
                         const joinedUserId = payload.new.user_id;
                          if (joinedUserId !== userId && participants.length === 2 && partner) {
                              console.log(`Realtime: Partner (${partner.user_id}) joined room ${roomId}.`);
                              onPartnerJoined(partner.user_id);
                          }
                     } else if (payload.eventType === 'DELETE') {
                         const leftUserId = payload.old?.user_id;
                         if (leftUserId && leftUserId !== userId) {
                              console.log(`Realtime: Partner (${leftUserId}) left room ${roomId}.`);
                              onPartnerLeft();
                              setIsPartnerTyping(false);
                         }
                     }
                 }
             )
            .on('presence', { event: 'sync' }, () => {
                  const newState: RealtimePresenceState<PresencePayload> = mainChannel.current!.presenceState();
                  let partnerIsCurrentlyTyping = false;
                  for (const id in newState) {
                       if (id !== userId) {
                           const userPresence = newState[id]?.[0];
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
                   if (key !== userId) {
                       setIsPartnerTyping(false);
                   }
               })
             .on('broadcast', { event: 'signal' }, handleIncomingBroadcast) // Listen for 'signal' event
            .subscribe(async (status: REALTIME_SUBSCRIBE_STATES, err?: Error) => {
                 if (status === 'SUBSCRIBED') {
                      console.log(`Realtime: Subscribed to main channel for room ${roomId}`);
                      try {
                           await mainChannel.current?.track({ is_typing: false, user_id: userId } as PresencePayload);
                      } catch (trackError: any) {
                          console.error("Realtime: Error tracking initial presence:", trackError);
                          onSubscriptionError("Could not set up presence", trackError);
                      }
                 } else if (err) {
                      console.error(`Realtime: Main channel subscription error for ${roomId}:`, err);
                      onSubscriptionError("Could not connect to chat room", err);
                 }
            });

        return () => {
            console.log(`Realtime: Cleanup effect running for roomId ${roomId}`);
            cleanupSubscriptions();
        };
    }, [roomId, userId, supabase, cleanupSubscriptions, onNewMessage, onPartnerJoined, onPartnerLeft, onSignalingMessage, onSubscriptionError]);


     const sendTypingPresence = useCallback((isTypingUpdate: boolean) => {
        if (!mainChannel.current || mainChannel.current.state !== 'joined') return;

        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = null;
        }

        const payload: PresencePayload = { is_typing: isTypingUpdate, user_id: userId };

        if (isTypingUpdate) {
             mainChannel.current.track(payload).catch(err => console.error("Presence track error (true):", err));
        } else {
             typingTimeoutRef.current = setTimeout(() => {
                 mainChannel.current?.track(payload).catch(err => console.error("Presence track error (false):", err));
                 typingTimeoutRef.current = null;
             }, 1500);
        }
    }, [userId]);

     const sendSignalingMessage = useCallback(async (payload: SignalingMessage) => {
        if (!mainChannel.current || mainChannel.current.state !== 'joined') {
            console.error("Cannot send signal: Realtime channel not ready.");
            return;
        }
        try {
             console.log(`Realtime: Broadcasting signal event '${payload.type}'`);
             const status = await mainChannel.current.send({
                 type: 'broadcast',
                 event: 'signal', // Use a specific event name like 'signal'
                 payload: payload,
             });
             console.log("Realtime: Broadcast status:", status);
        } catch (error) {
             console.error("Realtime: Error broadcasting signal:", error);
             onSubscriptionError("Failed to send video signal", error as Error);
        }
    }, []);


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
        sendSignalingMessage,
    };
}