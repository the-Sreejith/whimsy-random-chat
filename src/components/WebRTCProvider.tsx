'use client';

import React, { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react';
import { toast } from 'sonner';
import { useWebRTC } from '@/hooks/useWebRTC';
import { SignalingMessage } from '@/types/chat';

interface WebRTCContextType {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isWebRTCActive: boolean;
  startVideoCall: () => void;
  stopVideoCall: (notifyPartner?: boolean) => void;
  receivedSignal: (message: SignalingMessage) => void;
}

const WebRTCContext = createContext<WebRTCContextType | null>(null);

interface WebRTCProviderProps {
  userId: string | null;
  partnerId: string | null;
  sendSignal: (payload: Omit<SignalingMessage, 'sender' | 'target'>) => void;
  onStreamError?: (error: Error) => void;
  onCallEnded?: () => void;
  children: React.ReactNode;
}

export function WebRTCProvider({
  userId,
  partnerId,
  sendSignal,
  onStreamError = () => {},
  onCallEnded = () => {},
  children
}: WebRTCProviderProps) {
  // Stable reference to callbacks
  const sendSignalRef = useRef(sendSignal);
  const onStreamErrorRef = useRef(onStreamError);
  const onCallEndedRef = useRef(onCallEnded);
  
  // Update refs when props change
  useEffect(() => {
    sendSignalRef.current = sendSignal;
    onStreamErrorRef.current = onStreamError;
    onCallEndedRef.current = onCallEnded;
  }, [sendSignal, onStreamError, onCallEnded]);

  // Memoize the sendSignal function to prevent it from changing on renders
  const memoizedSendSignal = useCallback((payload: Omit<SignalingMessage, 'sender' | 'target'>) => {
    if (userId && partnerId) {
      console.log(`[WebRTCProvider] Forwarding signal: ${payload.type}`);
      sendSignalRef.current(payload);
    } else {
      console.warn("[WebRTCProvider] Cannot send signal, missing IDs", { userId, partnerId });
    }
  }, [userId, partnerId]);

  // Use the WebRTC hook
  const webRTC = useWebRTC({
    userId,
    partnerId,
    sendSignal: memoizedSendSignal,
    onStreamError: useCallback((err: Error) => {
      console.error("[WebRTCProvider] Stream error:", err);
      onStreamErrorRef.current(err);
    }, []),
    onCallEnded: useCallback(() => {
      console.log("[WebRTCProvider] Call ended callback");
      onCallEndedRef.current();
    }, []),
  });

  // Log when this component mounts/unmounts to help debug
  useEffect(() => {
    console.log("[WebRTCProvider] Component mounted");
    return () => {
      console.log("[WebRTCProvider] Component unmounting - this should NOT happen during call setup");
    };
  }, []);

  return (
    <WebRTCContext.Provider value={webRTC}>
      {children}
    </WebRTCContext.Provider>
  );
}

// Custom hook to use the WebRTC context
export function useWebRTCContext() {
  const context = useContext(WebRTCContext);
  if (!context) {
    throw new Error("useWebRTCContext must be used within a WebRTCProvider");
  }
  return context;
} 