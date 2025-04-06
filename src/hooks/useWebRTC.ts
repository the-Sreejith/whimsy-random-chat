'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import type { SignalingMessage } from '@/types/chat';

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        // Add TURN servers here if needed for NAT traversal
    ],
};

interface UseWebRTCProps {
    userId: string | null;
    partnerId: string | null;
    sendSignal: (payload: Omit<SignalingMessage, 'sender' | 'target'>) => void;
    onStreamError?: (error: Error) => void;
}

export function useWebRTC({ userId, partnerId, sendSignal, onStreamError }: UseWebRTCProps) {
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [isWebRTCActive, setIsWebRTCActive] = useState(false);
    const peerConnection = useRef<RTCPeerConnection | null>(null);
    const isAlreadyCalling = useRef(false); // Prevent multiple offers

    const cleanupConnection = useCallback(() => {
        console.log("WebRTC: Cleaning up connection...");
        if (peerConnection.current) {
            peerConnection.current.ontrack = null;
            peerConnection.current.onicecandidate = null;
            peerConnection.current.oniceconnectionstatechange = null;
            peerConnection.current.onsignalingstatechange = null;
            peerConnection.current.close();
            peerConnection.current = null;
        }
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            setLocalStream(null);
        }
        setRemoteStream(null);
        setIsWebRTCActive(false);
        isAlreadyCalling.current = false;
    }, [localStream]);

    const initializePeerConnection = useCallback(() => {
        if (!localStream || !userId || !partnerId) return null;

        const pc = new RTCPeerConnection(ICE_SERVERS);

        pc.onicecandidate = (event) => {
            if (event.candidate && userId && partnerId) {
                console.log("WebRTC: Sending ICE candidate");
                sendSignal({
                    type: 'ice-candidate',
                    payload: { candidate: event.candidate },
                });
            }
        };

        pc.ontrack = (event) => {
            console.log("WebRTC: Received remote track");
            setRemoteStream(event.streams[0]);
        };

        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });

        pc.oniceconnectionstatechange = () => {
            console.log("WebRTC: ICE Connection State:", pc.iceConnectionState);
            if (['disconnected', 'failed', 'closed'].includes(pc.iceConnectionState)) {
                 toast.info("Video connection lost.");
                 cleanupConnection(); // Clean up if connection fails or closes
            }
        };

         pc.onsignalingstatechange = () => {
             console.log("WebRTC: Signaling State:", pc.signalingState);
         };

        return pc;
    }, [localStream, userId, partnerId, sendSignal, cleanupConnection]);

    const startVideoCall = useCallback(async () => {
        if (!userId || !partnerId || isWebRTCActive) return;
        console.log("WebRTC: Starting video call...");

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            setLocalStream(stream);
            setIsWebRTCActive(true);
            // Peer connection initialized in useEffect after localStream is set
        } catch (error: any) {
            console.error("WebRTC: Error getting user media:", error);
            toast.error("Could not access camera/microphone", { description: error.message });
            onStreamError?.(error);
            cleanupConnection();
        }
    }, [userId, partnerId, isWebRTCActive, onStreamError, cleanupConnection]);

    const stopVideoCall = useCallback(() => {
        console.log("WebRTC: Stopping video call...");
        // Optionally send a 'bye' signal if needed by the partner
        // sendSignal({ type: 'bye', payload: {} });
        cleanupConnection();
    }, [cleanupConnection]);

    // Effect to initialize PC when local stream is ready
    useEffect(() => {
        if (localStream && !peerConnection.current && isWebRTCActive && userId && partnerId) {
            console.log("WebRTC: Local stream ready, initializing PeerConnection.");
            peerConnection.current = initializePeerConnection();

            // If we are the initiator (usually determined by some logic, e.g., user ID comparison)
             // Let's assume the user with the lexicographically smaller ID initiates for simplicity
            if (userId < partnerId && !isAlreadyCalling.current) {
                 isAlreadyCalling.current = true;
                 console.log("WebRTC: Creating offer...");
                 peerConnection.current?.createOffer()
                     .then(offer => peerConnection.current?.setLocalDescription(offer))
                     .then(() => {
                         if (peerConnection.current?.localDescription) {
                              console.log("WebRTC: Sending offer");
                              sendSignal({
                                  type: 'video-offer',
                                  payload: { sdp: peerConnection.current.localDescription },
                              });
                         }
                     })
                     .catch(e => console.error("WebRTC: Error creating/sending offer:", e));
            }
        }
    }, [localStream, isWebRTCActive, userId, partnerId, initializePeerConnection, sendSignal]);


    const receivedSignal = useCallback(async (signal: SignalingMessage) => {
        if (!userId || !partnerId) return;
        console.log(`WebRTC: Received signal type: ${signal.type}`);

        // Ensure PC is initialized, especially if receiving offer before local stream is ready
         if (!peerConnection.current && signal.type !== 'video-offer') {
             // If we get an answer or candidate but have no PC, maybe start the call flow?
              console.warn("WebRTC: Received signal but PeerConnection not ready. Attempting to start.");
              // Triggering startVideoCall might be complex here due to async nature.
              // Best practice is usually to ensure local media is ready before signaling.
              // For now, just log and potentially ignore if PC isn't ready.
              if (!localStream) {
                   console.error("WebRTC: Cannot handle signal without local stream. Ignoring.");
                   return;
              }
              // Attempt to initialize if stream exists but PC doesn't
              peerConnection.current = initializePeerConnection();
              if (!peerConnection.current) {
                   console.error("WebRTC: Failed to initialize PeerConnection on demand.");
                   return;
              }
         }


        try {
            switch (signal.type) {
                case 'video-offer':
                     if (!peerConnection.current) {
                         // If receiving offer, ensure PC is initialized. Need local stream first.
                         if (!localStream) {
                             console.log("WebRTC: Offer received, requesting local media first...");
                             await startVideoCall(); // Request media, useEffect will init PC
                             // Need a way to queue the offer handling until PC is ready.
                             // This is complex. Simplified approach: Assume local media is requested quickly.
                             console.warn("WebRTC: Handling offer might be delayed until local media is approved.");
                             // Re-dispatch event after a short delay? Hacky.
                             setTimeout(() => window.dispatchEvent(new CustomEvent('webrtc-signal', { detail: signal })), 1000);
                             return; // Exit for now, let the re-dispatch handle it
                         }
                         peerConnection.current = initializePeerConnection();
                         if (!peerConnection.current) throw new Error("Failed to initialize PC for offer");
                     }
                    console.log("WebRTC: Setting remote description (offer)");
                    await peerConnection.current.setRemoteDescription(new RTCSessionDescription(signal.payload.sdp));
                    console.log("WebRTC: Creating answer...");
                    const answer = await peerConnection.current.createAnswer();
                    console.log("WebRTC: Setting local description (answer)");
                    await peerConnection.current.setLocalDescription(answer);
                    console.log("WebRTC: Sending answer");
                    sendSignal({ type: 'video-answer', payload: { sdp: answer } });
                    break;

                case 'video-answer':
                    if (peerConnection.current && peerConnection.current.signalingState !== 'stable') {
                         console.log("WebRTC: Setting remote description (answer)");
                         await peerConnection.current.setRemoteDescription(new RTCSessionDescription(signal.payload.sdp));
                    } else {
                         console.warn("WebRTC: Received answer but connection state is stable or PC doesn't exist.");
                    }
                    break;

                case 'ice-candidate':
                     if (peerConnection.current && signal.payload.candidate) {
                         try {
                             console.log("WebRTC: Adding ICE candidate");
                             await peerConnection.current.addIceCandidate(new RTCIceCandidate(signal.payload.candidate));
                         } catch (e) {
                             console.error("WebRTC: Error adding received ICE candidate", e);
                         }
                     } else {
                          console.warn("WebRTC: Received ICE candidate but PC not ready or candidate missing.");
                     }
                    break;

                default:
                    console.warn(`WebRTC: Unknown signal type received: ${signal.type}`);
            }
        } catch (error) {
            console.error("WebRTC: Error handling received signal:", error);
        }
    }, [userId, partnerId, sendSignal, initializePeerConnection, localStream, startVideoCall]);

    // Listen for custom event from useChat hook
     useEffect(() => {
         const handleSignalEvent = (event: Event) => {
             const customEvent = event as CustomEvent<SignalingMessage>;
             receivedSignal(customEvent.detail);
         };
         window.addEventListener('webrtc-signal', handleSignalEvent);
         return () => {
             window.removeEventListener('webrtc-signal', handleSignalEvent);
         };
     }, [receivedSignal]);


    // Cleanup on component unmount or when dependencies change significantly
    useEffect(() => {
        return () => {
            cleanupConnection();
        };
    }, [cleanupConnection]);

     // Stop call if partner leaves
     useEffect(() => {
         if (!partnerId && isWebRTCActive) {
             console.log("WebRTC: Partner left, stopping video call.");
             stopVideoCall();
         }
     }, [partnerId, isWebRTCActive, stopVideoCall]);

    return {
        localStream,
        remoteStream,
        isWebRTCActive,
        startVideoCall,
        stopVideoCall,
        receivedSignal, // Expose if needed externally, though custom event is used now
    };
}