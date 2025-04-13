// hooks/useChatManager.ts

import { useState, useRef, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import { Message,ChatStatus, SignalingMessage } from '@/types/chat';
import { 
  SocketInstance,
  cleanupSocket,
  createSocketConnection,
  sendMessage as emitMessage,
  sendTyping as emitTyping,
  sendSignal as emitSignal,
  leaveChat
} from '@/lib/socket';

interface UseChatManagerProps {
  onMessageReceived: (message: Message) => void;
  onSignalReceived: (payload: SignalingMessage) => void;
  onSystemMessage: (text: string) => void;
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

export function useChatManager({
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

  const cleanupResources = useCallback(() => {
    console.log('[ChatManager] Cleaning up socket instance and listeners.');
    cleanupSocket(socketRef.current);
    socketRef.current = null;
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    
    // Reset state associated with an active connection
    setUserId(null);
    setPartnerId(null);
    setIsPartnerTyping(false);
  }, []);

  const resetStateForNewConnection = useCallback((newStatus: ChatStatus = 'disconnected') => {
    cleanupResources();
    setStatus(newStatus);
  }, [cleanupResources]);

  const connect = useCallback(() => {
    if (status === 'connecting' || status === 'chatting' || status === 'waiting') {
      console.warn('[ChatManager] Connect called while already connecting or active.');
      return;
    }

    console.log('[ChatManager] Attempting to connect...');
    resetStateForNewConnection('connecting');
    stableCallbacks.current.onSystemMessage("Connecting...");

    try {
      const socket = createSocketConnection({
        onConnect: () => {
          console.log('[ChatManager] Socket connected:', socket.id);
        },
        
        onYourId: (id) => {
          console.log('[ChatManager] Received User ID:', id);
          setUserId(id);
        },
        
        onWaiting: () => {
          console.log('[ChatManager] Waiting for partner');
          setStatus('waiting');
          stableCallbacks.current.onSystemMessage("Looking for someone to chat with...");
        },
        
        onMatched: (data) => {
          console.log('[ChatManager] Matched with partner:', data.partnerId);
          setPartnerId(data.partnerId);
          setStatus('chatting');
          stableCallbacks.current.onSystemMessage("A stranger has connected!");
        },
        
        onMessage: (data) => {
          console.log('[ChatManager] Message received');
          setIsPartnerTyping(false);
          const message: Message = {
            id: uuidv4(),
            text: data.text,
            sender: 'stranger',
            timestamp: Date.now(),
          };
          stableCallbacks.current.onMessageReceived(message);
        },
        
        onTyping: (data) => {
          setIsPartnerTyping(data.isTyping);
        },
        
        onSignal: (payload) => {
          console.log('[ChatManager] Signal received type:', payload.type);
          if (payload.sender !== userId) {
            stableCallbacks.current.onSignalReceived(payload);
          } else {
            console.warn("[ChatManager] Received signal from self, ignoring.");
          }
        },
        
        onPartnerDisconnected: () => {
          console.log('[ChatManager] Partner disconnected');
          stableCallbacks.current.onSystemMessage('The stranger has disconnected.');
          setPartnerId(null);
          setIsPartnerTyping(false);
          setStatus('disconnected');
        },
        
        onServerError: (message) => {
          console.error('[ChatManager] Server error:', message);
          toast.error('Server Error', { description: message });
          resetStateForNewConnection('error');
        },
        
        onDisconnect: (reason) => {
          console.log('[ChatManager] Socket disconnected:', reason);
          if (status !== 'idle' && status !== 'disconnected' && status !== 'error') {
            toast.error('Connection Lost', { description: `Disconnected: ${reason}. Please reconnect.` });
            resetStateForNewConnection('error');
          } else {
            cleanupResources();
            setStatus(prev => (prev === 'connecting' ? 'error' : 'disconnected'));
          }
        },
        
        onConnectError: (err) => {
          console.error('[ChatManager] Connection Error:', err.message);
          toast.error('Connection Failed', {
            description: `Could not connect: ${err.message}. Please try again.`
          });
          
          // if (status === 'connecting') {
          //   resetStateForNewConnection('error');
          // }
        }
      });
      
      socketRef.current = socket;
    } catch (error) {
      console.error("[ChatManager] Error creating socket instance:", error);
      toast.error("Initialization Error", { description: "Failed to setup connection." });
      resetStateForNewConnection('error');
    }
  }, [status, userId, resetStateForNewConnection]);

  const disconnect = useCallback((notifyServer: boolean = true) => {
    console.log('[ChatManager] Disconnect requested.', { notifyServer });
    if (!socketRef.current) {
      console.log('[ChatManager] No active socket to disconnect.');
      resetStateForNewConnection('disconnected');
      return;
    }

    if (notifyServer && status === 'chatting') {
      leaveChat(socketRef.current);
      stableCallbacks.current.onSystemMessage("You have disconnected.");
    }

    setStatus('disconnected');
    cleanupResources();
  }, [status, cleanupResources, resetStateForNewConnection]);

  const sendMessage = useCallback((text: string) => {
    if (status === 'chatting') {
      emitMessage(socketRef.current, text);
    }
  }, [status]);

  const sendTyping = useCallback((isTyping: boolean) => {
    if (status !== 'chatting' || !socketRef.current?.connected) return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    emitTyping(socketRef.current, isTyping);

    if (isTyping) {
      typingTimeoutRef.current = setTimeout(() => {
        if (socketRef.current?.connected) {
          emitTyping(socketRef.current, false);
        }
        typingTimeoutRef.current = null;
      }, 2500);
    }
  }, [status]);

  const sendSignal = useCallback((payload: Omit<SignalingMessage, 'sender' | 'target'>) => {
    if (status === 'chatting') {
      console.log(`[ChatManager] Sending WebRTC signal: ${payload.type}`);
      emitSignal(socketRef.current, payload, userId, partnerId);
    } else {
      console.warn("[ChatManager] Cannot send WebRTC signal, conditions not met.", {
        connected: socketRef.current?.connected, partnerId, userId, status
      });
    }
  }, [status, partnerId, userId]);

  useEffect(() => {
    return () => {
      console.log('[ChatManager] Unmounting. Cleaning up socket.');
      cleanupResources();
    };
  }, [cleanupResources]);

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