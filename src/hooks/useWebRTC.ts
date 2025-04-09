// hooks/useWebRTC.ts
import { useEffect, useRef, useState, useCallback } from 'react';
import { SignalingMessage } from '@/types/chat';
import { toast } from 'sonner'; // Added for potential error display

// WebRTC configuration
const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // Add TURN servers in production for reliable NAT traversal
];

interface WebRTCHookProps {
    userId: string | null;
    partnerId: string | null;
    sendSignal: (signal: Omit<SignalingMessage, 'sender' | 'target'>) => void;
    onStreamError?: (error: Error) => void;
    onCallEnded?: () => void; // Callback when call ends locally or due to connection failure
}

interface WebRTCHookReturn {
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    isWebRTCActive: boolean;
    startVideoCall: () => Promise<void>;
    stopVideoCall: (notify?: boolean) => void; // Added notify flag
    receivedSignal: (message: SignalingMessage) => void;
}

export function useWebRTC({
    userId,
    partnerId,
    sendSignal,
    onStreamError = () => { },
    onCallEnded = () => { }
}: WebRTCHookProps): WebRTCHookReturn {
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [isWebRTCActive, setIsWebRTCActive] = useState(false);

    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const isInitiatorRef = useRef(false);
    const pendingCandidatesRef = useRef<RTCIceCandidate[]>([]);

    // Stable reference for sendSignal
    const sendSignalRef = useRef(sendSignal);
    useEffect(() => {
        sendSignalRef.current = sendSignal;
    }, [sendSignal]);

    // Function to cleanup WebRTC resources
    const cleanupWebRTC = useCallback((notifyEnd = true) => {
        console.log('[WebRTC] Cleaning up WebRTC resources.');

        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            setLocalStream(null);
        }
        setRemoteStream(null);

        if (peerConnectionRef.current) {
            // Remove listeners before closing
            peerConnectionRef.current.onicecandidate = null;
            peerConnectionRef.current.onconnectionstatechange = null;
            peerConnectionRef.current.ontrack = null;
            peerConnectionRef.current.oniceconnectionstatechange = null;
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }

        setIsWebRTCActive(false);
        isInitiatorRef.current = false;
        pendingCandidatesRef.current = [];

        if (notifyEnd) {
            onCallEnded(); // Notify parent component
        }
    }, [localStream, onCallEnded]); // Added onCallEnded dependency

    // Stop video call function
    const stopVideoCall = useCallback((notify = true) => {
        console.log('[WebRTC] stopVideoCall invoked.');
        cleanupWebRTC(notify);
        // Optionally send a signal to the partner that the call ended?
        // sendSignalRef.current({ type: 'call-ended' });
    }, [cleanupWebRTC]);


    // Helper to create a new RTCPeerConnection
    const createPeerConnection = useCallback(() => {
        // Cleanup existing connection first
        if (peerConnectionRef.current) {
            console.warn("[WebRTC] Existing peer connection found during creation. Cleaning up first.");
            cleanupWebRTC(false); // Don't notify end on implicit cleanup
        }

        console.log("[WebRTC] Creating new Peer Connection");
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        peerConnectionRef.current = pc;

        pc.onicecandidate = (event) => {
            if (event.candidate && partnerId && userId) { // Check partnerId/userId again
                console.log("[WebRTC] Sending ICE candidate");
                sendSignalRef.current({
                    type: 'ice-candidate',
                    candidate: event.candidate,
                });
            }
        };

        pc.onconnectionstatechange = () => {
            const state = pc.connectionState;
            console.log("[WebRTC] Connection state changed:", state);
            if (state === 'failed' || state === 'disconnected' || state === 'closed') {
                console.warn(`[WebRTC] Peer connection state is ${state}. Cleaning up.`);
                // Don't call stopVideoCall directly to avoid loops if called from stopVideoCall
                cleanupWebRTC(true); // Notify parent on failure/disconnect
            }
        };

        pc.ontrack = (event) => {
            console.log("[WebRTC] Track received:", event.track.kind);
            if (event.streams && event.streams[0]) {
                console.log("[WebRTC] Setting remote stream");
                setRemoteStream(event.streams[0]);
            } else {
                 // Sometimes streams[0] isn't available, try adding track to a new stream
                 if (!remoteStream) {
                    const newStream = new MediaStream();
                    newStream.addTrack(event.track);
                    setRemoteStream(newStream);
                    console.log("[WebRTC] Created new remote stream for track");
                 } else {
                    remoteStream.addTrack(event.track);
                    console.log("[WebRTC] Added track to existing remote stream");
                 }
            }
        };

        pc.oniceconnectionstatechange = () => {
            console.log("[WebRTC] ICE Connection State:", pc.iceConnectionState);
            if (pc.iceConnectionState === 'failed') {
                 console.error("[WebRTC] ICE connection failed. Restarting ICE?");
                 // pc.restartIce(); // Consider ICE restart strategy if needed
            }
        };

        return pc;
    }, [userId, partnerId, cleanupWebRTC]); // Added dependencies


    // Handle received signaling messages
    const receivedSignal = useCallback(async (message: SignalingMessage) => {
        if (message.sender === userId || !partnerId) {
             // console.log("[WebRTC] Ignoring signal from self or when no partner.");
             return;
        }

        console.log("[WebRTC] Received signal:", message.type, "from:", message.sender);

        // Ensure peer connection exists, create if not (e.g., receiving offer before starting call)
        const pc = peerConnectionRef.current ?? createPeerConnection();
        if (!pc) {
            console.error("[WebRTC] Failed to get/create peer connection for signal:", message.type);
            return;
        }

        try {
            switch (message.type) {
                case 'offer':
                    if (!message.offer) throw new Error("Offer signal missing offer data");
                    console.log("[WebRTC] Processing offer...");

                    // Ensure we have a local stream *before* setting remote description and creating answer
                    // This might involve calling getUserMedia if not already active
                     let stream = localStream;
                     if (!stream && isWebRTCActive) { // Check isWebRTCActive flag
                         console.log("[WebRTC] Getting local stream for answering offer...");
                         try {
                             stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                             setLocalStream(stream); // Set state if successful
                             stream.getTracks().forEach(track => {
                                 // Avoid adding tracks multiple times if connection already exists
                                 if (!pc.getSenders().find(sender => sender.track === track)) {
                                     pc.addTrack(track, stream!);
                                 }
                             });
                         } catch (err: any) {
                              console.error("[WebRTC] Error getting media for answer:", err);
                              onStreamError(err);
                              // Maybe send an error signal back?
                              cleanupWebRTC(true); // Cleanup if we can't get media
                              return;
                         }
                     } else if (stream) {
                          // Ensure tracks are added if somehow missed
                          stream.getTracks().forEach(track => {
                                if (!pc.getSenders().find(sender => sender.track === track)) {
                                    pc.addTrack(track, stream!);
                                }
                            });
                     }


                    await pc.setRemoteDescription(new RTCSessionDescription(message.offer));
                    console.log("[WebRTC] Remote description (offer) set.");

                    console.log("[WebRTC] Creating answer...");
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    console.log("[WebRTC] Local description (answer) set.");

                    sendSignalRef.current({ type: 'answer', answer: pc.localDescription });
                    console.log("[WebRTC] Answer sent.");

                    // Process pending candidates after setting descriptions
                    console.log(`[WebRTC] Processing ${pendingCandidatesRef.current.length} pending candidates...`);
                    pendingCandidatesRef.current.forEach(candidate => {
                        pc.addIceCandidate(candidate).catch(err =>
                            console.error("[WebRTC] Error adding queued ICE candidate:", err)
                        );
                    });
                    pendingCandidatesRef.current = [];
                    break;

                case 'answer':
                    if (!message.answer) throw new Error("Answer signal missing answer data");
                    console.log("[WebRTC] Processing answer...");
                    if (pc.signalingState !== 'have-local-offer') {
                         console.warn(`[WebRTC] Received answer in unexpected state: ${pc.signalingState}`);
                         // Potentially ignore or handle error
                         return;
                    }
                    await pc.setRemoteDescription(new RTCSessionDescription(message.answer));
                    console.log("[WebRTC] Remote description (answer) set.");

                    // Process pending candidates after setting descriptions
                    console.log(`[WebRTC] Processing ${pendingCandidatesRef.current.length} pending candidates...`);
                    pendingCandidatesRef.current.forEach(candidate => {
                        pc.addIceCandidate(candidate).catch(err =>
                            console.error("[WebRTC] Error adding queued ICE candidate:", err)
                        );
                    });
                    pendingCandidatesRef.current = [];
                    break;

                case 'ice-candidate':
                    if (!message.candidate) throw new Error("ICE signal missing candidate data");
                    console.log("[WebRTC] Processing ICE candidate...");
                    const candidate = new RTCIceCandidate(message.candidate);

                    if (!pc.remoteDescription) {
                        console.log("[WebRTC] Remote description not set, queuing ICE candidate.");
                        pendingCandidatesRef.current.push(candidate);
                    } else {
                        await pc.addIceCandidate(candidate);
                        console.log("[WebRTC] ICE candidate added.");
                    }
                    break;

                // case 'call-ended': // Example if you implement this signal
                //     console.log("[WebRTC] Received call-ended signal from partner.");
                //     cleanupWebRTC(true); // Cleanup but notify parent it was partner initiated
                //     break;

                default:
                    console.warn("[WebRTC] Unknown signal type received:", message.type);
            }
        } catch (error: any) {
            console.error("[WebRTC] Error processing signal:", message.type, error);
            toast.error("WebRTC Error", { description: `Failed to process signal: ${error.message}` });
            // Consider cleanup on critical signal processing errors
            cleanupWebRTC(true);
        }
    }, [userId, partnerId, createPeerConnection, localStream, onStreamError, isWebRTCActive, cleanupWebRTC]); // Added dependencies


    // Start video call
    const startVideoCall = useCallback(async () => {
        if (!userId || !partnerId) {
            console.error("[WebRTC] Cannot start call: Missing userId or partnerId.");
            toast.error("WebRTC Error", { description: "Cannot start video call. User or partner ID missing." });
            return;
        }
        if (isWebRTCActive) {
            console.warn("[WebRTC] startVideoCall called while already active.");
            return;
        }

        console.log("[WebRTC] Attempting to start video call...");
        isInitiatorRef.current = true; // Assume initiator role
        const pc = createPeerConnection(); // Create connection first

        try {
            console.log("[WebRTC] Requesting user media...");
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            console.log("[WebRTC] User media acquired.");
            setLocalStream(stream);
            setIsWebRTCActive(true); // Set active *after* getting stream

            stream.getTracks().forEach(track => {
                 // Check if track already added (might happen with quick restarts)
                if (!pc.getSenders().find(sender => sender.track === track)) {
                    pc.addTrack(track, stream);
                    console.log(`[WebRTC] Track added: ${track.kind}`);
                }
            });


            console.log("[WebRTC] Creating offer...");
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            console.log("[WebRTC] Local description (offer) set.");

            sendSignalRef.current({ type: 'offer', offer: pc.localDescription });
            console.log("[WebRTC] Offer sent.");

        } catch (err: any) {
            console.error("[WebRTC] Error starting video call:", err);
            onStreamError(err);
            toast.error("Video Error", { description: `Could not start video: ${err.message}` });
            stopVideoCall(false); // Cleanup without notifying (already handled by error callback)
        }
    }, [userId, partnerId, isWebRTCActive, createPeerConnection, onStreamError, stopVideoCall]); // Added dependencies


    // Effect for component unmount cleanup
    useEffect(() => {
        return () => {
            console.log("[WebRTC] Hook unmounting. Cleaning up...");
            cleanupWebRTC(false); // Don't notify parent on unmount cleanup
        };
    }, [cleanupWebRTC]); // Only depends on cleanupWebRTC

    return {
        localStream,
        remoteStream,
        isWebRTCActive,
        startVideoCall,
        stopVideoCall,
        receivedSignal,
    };
}