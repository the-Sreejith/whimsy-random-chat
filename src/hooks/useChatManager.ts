import { useState, useRef, useCallback, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import { Message, SignalingMessage } from '@/types/chat'; // Assuming these types exist

// Types (could be in types/chat.ts as well)
export type ChatStatus = "idle" | "connecting" | "waiting" | "chatting" | "disconnected" | "error";

interface ServerToClientEvents {
    'your-id': (id: string) => void;
    waiting: () => void;
    matched: (data: { partnerId: string }) => void;
    message: (data: { text: string }) => void;
    'partner-disconnected': () => void;
    typing: (data: { isTyping: boolean }) => void;
    signal: (payload: SignalingMessage) => void;
    'server-error': (message: string) => void;
}

interface ClientToServerEvents {
    message: (data: { text: string }) => void;
    typing: (isTyping: boolean) => void;
    signal: (payload: SignalingMessage) => void;
    leave: () => void;
}

type SocketInstance = Socket<ServerToClientEvents, ClientToServerEvents>;

interface UseChatManagerProps {
    socketUrl: string;
    onMessageReceived: (message: Message) => void;
    onSignalReceived: (payload: SignalingMessage) => void;
    onSystemMessage: (text: string) => void; // For system messages like connect/disconnect
}

interface UseChatManagerReturn {
    status: ChatStatus;
    userId: string | null;
    partnerId: string | null;
    isPartnerTyping: boolean;
    connect: () => void;
    disconnect: (notifyServer?: boolean) => void;
    sendMessage: (text: string) => void;
    sendTyping: (isTyping: boolean) => void;
    sendSignal: (payload: Omit<SignalingMessage, 'sender' | 'target'>) => void;
}

const SOCKET_CONFIG = {
    reconnection: false,
    timeout: 8000,
};

export function useChatManager({
    socketUrl,
    onMessageReceived,
    onSignalReceived,
    onSystemMessage,
}: UseChatManagerProps): UseChatManagerReturn {
    const [status, setStatus] = useState<ChatStatus>("idle");
    const [userId, setUserId] = useState<string | null>(null);
    const [partnerId, setPartnerId] = useState<string | null>(null);
    const [isPartnerTyping, setIsPartnerTyping] = useState(false);

    const socketRef = useRef<SocketInstance | null>(null);
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Stable callback references using useRef - prevents listener re-attachment issues
    const stableCallbacks = useRef({ onMessageReceived, onSignalReceived, onSystemMessage });
    useEffect(() => {
        stableCallbacks.current = { onMessageReceived, onSignalReceived, onSystemMessage };
    }, [onMessageReceived, onSignalReceived, onSystemMessage]);


    const cleanupSocket = useCallback(() => {
        console.log('[ChatManager] Cleaning up socket instance and listeners.');
        if (socketRef.current) {
            socketRef.current.removeAllListeners(); // Important: Remove all listeners
            socketRef.current.disconnect();
            socketRef.current = null;
        }
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = null;
        }
        // Reset state associated with an active connection
        setUserId(null);
        setPartnerId(null);
        setIsPartnerTyping(false);
        // Keep status as is, let calling component decide next state (or set to 'disconnected')
    }, []); // No dependencies needed

    const resetStateForNewConnection = useCallback((newStatus: ChatStatus = 'disconnected') => {
        cleanupSocket();
        setStatus(newStatus);
        // Clear messages in the main component via a system message or separate callback if needed
        // Example: stableCallbacks.current.onSystemMessage("clear_messages");
    }, [cleanupSocket]);


    const setupSocketListeners = useCallback((socket: SocketInstance) => {
        console.log('[ChatManager] Setting up listeners for socket:', socket.id);
        // Clear any previous listeners *just in case* (shouldn't be needed with cleanupSocket)
        socket.removeAllListeners();

        socket.on('connect', () => {
             console.log('[ChatManager] Socket connected:', socket.id);
             // Wait for 'your-id' before considering fully connected
        });

        socket.on('your-id', (id) => {
            console.log('[ChatManager] Received User ID:', id);
            setUserId(id);
            // Now officially "connected" and waiting for pairing or instructions
        });

        socket.on('waiting', () => {
            console.log('[ChatManager] Waiting for partner');
            setStatus('waiting');
            stableCallbacks.current.onSystemMessage("Looking for someone to chat with...");
        });

        socket.on('matched', (data) => {
            console.log('[ChatManager] Matched with partner:', data.partnerId);
            setPartnerId(data.partnerId);
            setStatus('chatting');
            stableCallbacks.current.onSystemMessage("A stranger has connected!");
        });

        socket.on('message', (data) => {
            console.log('[ChatManager] Message received');
            setIsPartnerTyping(false); // Stop typing indicator on message
            const message: Message = {
                id: uuidv4(),
                text: data.text,
                sender: 'stranger',
                timestamp: Date.now(),
            };
            stableCallbacks.current.onMessageReceived(message);
        });

        socket.on('typing', (data) => {
            setIsPartnerTyping(data.isTyping);
        });

        socket.on('signal', (payload) => {
             console.log('[ChatManager] Signal received type:', payload.type);
             // Filter out signals sent by self (should be handled by server ideally, but double-check)
             if (payload.sender !== userId) {
                 stableCallbacks.current.onSignalReceived(payload);
             } else {
                console.warn("[ChatManager] Received signal from self, ignoring.");
             }
        });

        socket.on('partner-disconnected', () => {
            console.log('[ChatManager] Partner disconnected');
            stableCallbacks.current.onSystemMessage('The stranger has disconnected.');
            setPartnerId(null); // Clear partner ID
            setIsPartnerTyping(false);
            setStatus('disconnected'); // Go to disconnected state, ready for 'next'
            // Don't disconnect the socket automatically here, wait for user action (Next/End)
            // Or maybe we *should* disconnect and force a 'start' click? Depends on desired UX.
            // For Omegle-like flow, maybe transition to 'waiting' automatically?
            // Let's stick to 'disconnected' for clarity. The main component can trigger 'connect' again.
        });

        socket.on('server-error', (message) => {
            console.error('[ChatManager] Server error:', message);
            toast.error('Server Error', { description: message });
            resetStateForNewConnection('error');
        });

        socket.on('disconnect', (reason) => {
             console.log('[ChatManager] Socket disconnected:', reason);
             // Check if the disconnect was initiated by us (via disconnect()) or external
             if (status !== 'idle' && status !== 'disconnected' && status !== 'error') {
                 // This was an unexpected disconnect
                 toast.error('Connection Lost', { description: `Disconnected: ${reason}. Please reconnect.` });
                 resetStateForNewConnection('error');
             } else {
                 // Disconnect was expected (e.g., user clicked End/Next or connect failed)
                 // State should already be handled by the action that triggered disconnect.
                 // We still need to cleanup refs etc.
                 cleanupSocket(); // Ensure cleanup happens even on expected disconnects
                 setStatus(prev => (prev === 'connecting' ? 'error' : 'disconnected')); // Ensure final state is appropriate
             }
        });

        socket.on('connect_error', (err) => {
            console.error('[ChatManager] Connection Error:', err.message);
            toast.error('Connection Failed', {
                description: `Could not connect: ${err.message}. Please try again.`
            });
             // Check if we were in the process of connecting
             if (status === 'connecting') {
                resetStateForNewConnection('error');
             }
             // If already connected and this happens (less likely with reconnection:false), treat as error too.
             else if (status !== 'idle' && status !== 'error' && status !== 'disconnected'){
                 resetStateForNewConnection('error');
             }
        });

    }, [status, userId, cleanupSocket, resetStateForNewConnection]); // Dependencies: status and userId might influence listener logic (e.g., ignoring self-signals)


    const connect = useCallback(() => {
        if (status === 'connecting' || status === 'chatting' || status === 'waiting') {
            console.warn('[ChatManager] Connect called while already connecting or active.');
            return;
        }

        console.log('[ChatManager] Attempting to connect...');
        resetStateForNewConnection('connecting'); // Reset previous state *before* connecting
        stableCallbacks.current.onSystemMessage("Connecting..."); // Notify UI

        try {
            const newSocket = io(socketUrl, SOCKET_CONFIG);
            socketRef.current = newSocket;
            setupSocketListeners(newSocket);
            // No need to call newSocket.connect() explicitly, io() does this.
        } catch (error) {
             console.error("[ChatManager] Error creating socket instance:", error);
             toast.error("Initialization Error", { description: "Failed to setup connection." });
             resetStateForNewConnection('error');
        }

    }, [status, socketUrl, setupSocketListeners, resetStateForNewConnection]); // Dependencies

    const disconnect = useCallback((notifyServer: boolean = true) => {
        console.log('[ChatManager] Disconnect requested.', { notifyServer });
        if (!socketRef.current) {
            console.log('[ChatManager] No active socket to disconnect.');
             // Ensure state is consistently reset even if socket is already gone
             resetStateForNewConnection('disconnected');
            return;
        }

        if (notifyServer && status === 'chatting') {
            socketRef.current.emit('leave');
            stableCallbacks.current.onSystemMessage("You have disconnected.");
        }

        // Set status *before* cleanup to prevent the 'disconnect' handler
        // from treating it as an unexpected event.
        setStatus('disconnected');
        cleanupSocket(); // Perform the actual disconnect and cleanup

    }, [status, cleanupSocket, resetStateForNewConnection]); // Dependencies


    const sendMessage = useCallback((text: string) => {
        if (status === 'chatting' && socketRef.current?.connected && text.trim()) {
            socketRef.current.emit('message', { text: text.trim() });
            // The UI component will handle adding the "me" message
        }
    }, [status]);

    const sendTyping = useCallback((isTyping: boolean) => {
        if (status !== 'chatting' || !socketRef.current?.connected) return;

        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = null;
        }

        socketRef.current.emit('typing', isTyping); // Send immediately

        if (isTyping) {
            // Set a timeout only if we just started typing
            typingTimeoutRef.current = setTimeout(() => {
                if (socketRef.current?.connected) {
                    socketRef.current.emit('typing', false);
                }
                typingTimeoutRef.current = null;
            }, 2500);
        }
    }, [status]);


    const sendSignal = useCallback((payload: Omit<SignalingMessage, 'sender' | 'target'>) => {
        if (status === 'chatting' && socketRef.current?.connected && partnerId && userId) {
             console.log(`[ChatManager] Sending WebRTC signal: ${payload.type}`);
            socketRef.current.emit('signal', {
                ...payload,
                sender: userId,
                target: partnerId,
            });
        } else {
            console.warn("[ChatManager] Cannot send WebRTC signal, conditions not met.", {
                connected: socketRef.current?.connected, partnerId, userId, status
            });
        }
    }, [status, partnerId, userId]);


    // Effect for component unmount cleanup
    useEffect(() => {
        return () => {
            console.log('[ChatManager] Unmounting. Cleaning up socket.');
            cleanupSocket();
        };
    }, [cleanupSocket]); // Ensure cleanup runs on unmount

    return {
        status,
        userId,
        partnerId,
        isPartnerTyping,
        connect,
        disconnect,
        sendMessage,
        sendTyping,
        sendSignal,
    };
}
