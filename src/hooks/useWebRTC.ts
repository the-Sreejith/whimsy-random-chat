// hooks/useWebRTC.ts
import { useEffect, useRef, useState, useCallback } from 'react';
import { SignalingMessage } from '@/types/chat'; // Assuming you have this type defined
import { toast } from 'sonner';

// WebRTC configuration
const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // Add TURN servers here for production
];

interface WebRTCHookProps {
    userId: string | null;
    partnerId: string | null;
    sendSignal: (signal: Omit<SignalingMessage, 'sender' | 'target'>) => void; // Function to send signal via Socket
    onStreamError?: (error: Error) => void; // Callback for media stream errors
    onCallEnded?: () => void; // Callback when the call ends (locally or remotely signaled)
}

interface WebRTCHookReturn {
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    isWebRTCActive: boolean; // Is a WebRTC connection process active/established?
    startVideoCall: () => Promise<void>; // Function to initiate the call
    stopVideoCall: (notifyPartner?: boolean) => void; // Function to stop the call
    receivedSignal: (message: SignalingMessage) => void; // Function to process incoming signals
}

export function useWebRTC({
    userId,
    partnerId,
    sendSignal,
    onStreamError = () => {},
    onCallEnded = () => {}
}: WebRTCHookProps): WebRTCHookReturn {
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [isWebRTCActive, setIsWebRTCActive] = useState(false); // Tracks if call setup is in progress or active

    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    // Ref to track if *this* client initiated the current connection attempt.
    // Useful for debugging or handling glare, but not strictly necessary for basic flow.
    const isInitiatorRef = useRef(false);
    const pendingCandidatesRef = useRef<RTCIceCandidate[]>([]);

    // Use refs for callbacks passed as props to ensure stability inside other useCallback hooks
    const sendSignalRef = useRef(sendSignal);
    const onStreamErrorRef = useRef(onStreamError);
    const onCallEndedRef = useRef(onCallEnded);

    useEffect(() => {
        sendSignalRef.current = sendSignal;
        onStreamErrorRef.current = onStreamError;
        onCallEndedRef.current = onCallEnded;
    }, [sendSignal, onStreamError, onCallEnded]);

    // --- Cleanup Function ---
    // Now depends only on the stable onCallEndedRef
    const cleanupWebRTC = useCallback((notifyEnd = true) => {
        console.log('[WebRTC] Cleaning up WebRTC resources.', { notifyEnd });

        // Stop local media tracks
        if (localStream) {
            console.log('[WebRTC] Stopping local stream tracks.');
            localStream.getTracks().forEach(track => track.stop());
            setLocalStream(null); // Clear state
        }

        // Clear remote stream state
        setRemoteStream(null);

        // Close PeerConnection
        if (peerConnectionRef.current) {
            console.log('[WebRTC] Closing Peer Connection.');
            // Remove listeners to prevent errors after closing
            peerConnectionRef.current.onicecandidate = null;
            peerConnectionRef.current.onconnectionstatechange = null;
            peerConnectionRef.current.ontrack = null;
            peerConnectionRef.current.oniceconnectionstatechange = null;
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }

        // Reset state flags
        setIsWebRTCActive(false); // Mark connection as inactive
        isInitiatorRef.current = false; // Reset initiator status
        pendingCandidatesRef.current = []; // Clear any pending candidates

        // Notify parent component if requested
        if (notifyEnd) {
            console.log('[WebRTC] Notifying parent component call ended.');
            onCallEndedRef.current();
        }
    }, [localStream]); // Now correctly depends on localStream to stop its tracks

    // --- Stop Video Call ---
    const stopVideoCall = useCallback((notifyPartner = true) => {
        console.log('[WebRTC] stopVideoCall invoked.', { notifyPartner });
        // Optionally send a 'bye' signal 
        if (notifyPartner && peerConnectionRef.current && partnerId && userId) {
            console.log('[WebRTC] Sending call-ended signal.');
            sendSignalRef.current({ type: 'bye', payload: null });
        }
        cleanupWebRTC(true); // Always notify parent locally when stop is called
    }, [cleanupWebRTC]); // Depends on the stable cleanupWebRTC

    // --- Get Local Media Stream ---
    const getLocalMedia = useCallback(async (): Promise<MediaStream | null> => {
        try {
            console.log("[WebRTC] Requesting user media (video, audio)...");
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            console.log("[WebRTC] User media acquired.");
            setLocalStream(stream); // Update state
            // Don't set active here anymore, moved to startVideoCall
            return stream;
        } catch (err: any) {
            console.error("[WebRTC] Error getting user media:", err);
            onStreamErrorRef.current(err); // Notify parent
            cleanupWebRTC(false); // Cleanup without double notification
            return null; // Indicate failure
        }
    }, [cleanupWebRTC]); // Depends on cleanupWebRTC for error handling

    // --- Create Peer Connection ---
    const createPeerConnection = useCallback(async (stream: MediaStream): Promise<RTCPeerConnection | null> => {
        // Cleanup existing connection *before* creating a new one
        if (peerConnectionRef.current) {
            console.warn("[WebRTC] Existing peer connection found during creation. Cleaning up first.");
            cleanupWebRTC(false); // Don't notify end on implicit cleanup
        }

        try {
            console.log("[WebRTC] Creating new Peer Connection with ICE servers:", ICE_SERVERS);
            const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
            peerConnectionRef.current = pc;
    
            // Add local tracks
            stream.getTracks().forEach(track => {
                try {
                    pc.addTrack(track, stream);
                    console.log(`[WebRTC] Track added: ${track.kind}`);
                } catch (error) {
                     console.error(`[WebRTC] Error adding track ${track.kind}:`, error);
                }
            });
    
            // --- Event Handlers for the Peer Connection ---
    
            // Handle ICE Candidates
            pc.onicecandidate = (event) => {
                if (event.candidate && partnerId && userId) {
                    console.log("[WebRTC] Sending ICE candidate:", event.candidate.type, event.candidate.sdpMLineIndex);
                    sendSignalRef.current({
                        type: 'ice-candidate',
                        payload: event.candidate
                    });
                } else if (!event.candidate) {
                     console.log("[WebRTC] All local ICE candidates sent.");
                }
            };
    
            // Handle Connection State Changes
            pc.onconnectionstatechange = () => {
                const state = pc.connectionState;
                console.log("[WebRTC] Connection state changed:", state);
                switch (state) {
                    case 'connected':
                        console.log("[WebRTC] Peers connected!");
                        // Connection established
                        setIsWebRTCActive(true); // Ensure it's marked active
                        break;
                    case 'disconnected':
                        console.warn("[WebRTC] Peers disconnected. Attempting to reconnect?");
                        // Connection lost, may recover
                        break;
                    case 'failed':
                        console.error("[WebRTC] Peer connection failed.");
                        // Connection failed irrecoverably
                        stopVideoCall(false); // Cleanup and notify parent (don't notify partner)
                        break;
                    case 'closed':
                        console.log("[WebRTC] Peer connection closed.");
                        // Connection closed, likely via cleanupWebRTC
                        break;
                }
            };
    
            // Handle Incoming Tracks
            pc.ontrack = (event) => {
                console.log("[WebRTC] Track received:", event.track.kind, "Stream IDs:", event.streams.map(s => s.id));
                if (event.streams && event.streams[0]) {
                    console.log("[WebRTC] Setting remote stream from event.streams[0]");
                    setRemoteStream(event.streams[0]);
                } else {
                     // Fallback: create a new stream if needed
                     console.warn("[WebRTC] event.streams[0] not available. Creating new stream for track.");
                     const newStream = new MediaStream();
                     newStream.addTrack(event.track);
                     setRemoteStream(newStream);
                }
                setIsWebRTCActive(true); // Ensure active state is set when tracks arrive
            };
    
             // Handle ICE Connection State (more granular than connectionstatechange)
             pc.oniceconnectionstatechange = () => {
                 console.log("[WebRTC] ICE Connection State:", pc.iceConnectionState);
                 if (pc.iceConnectionState === 'failed') {
                      console.error("[WebRTC] ICE connection failed. Consider ICE restart.");
                      // Optional: Implement ICE restart logic here if needed
                      // pc.restartIce();
                 }
             };
    
            return pc;
        } catch (error) {
            console.error("[WebRTC] Error creating peer connection:", error);
            return null;
        }
    }, [userId, partnerId, cleanupWebRTC, stopVideoCall]); // Dependencies

    // Flag to prevent multiple simultaneous call starts
    const isStartingCallRef = useRef(false);

    // --- Start Video Call (Initiator) ---
    const startVideoCall = useCallback(async () => {
        if (isStartingCallRef.current) {
            console.log("[WebRTC] Call start already in progress. Ignoring duplicate request.");
            return;
        }
        
        if (!userId || !partnerId) {
            console.error("[WebRTC] Cannot start call: Missing userId or partnerId.");
            toast.error("Cannot Start Video", { description: "User or partner ID missing." });
            return;
        }
        if (isWebRTCActive) {
            console.warn("[WebRTC] startVideoCall called while already active or starting.");
            return;
        }
        if (peerConnectionRef.current) {
            console.warn("[WebRTC] startVideoCall called while a peer connection already exists. Potential state issue.");
            // Optionally clean up first? Or just proceed? Let's proceed cautiously.
        }

        try {
            // Set flag to prevent duplicate starts
            isStartingCallRef.current = true;
            
            console.log("[WebRTC] === Initiating Video Call ===");
            isInitiatorRef.current = true;
            
            // Set active state BEFORE starting the async process
            // This helps prevent unmounts during the async operations
            setIsWebRTCActive(true);
    
            const stream = await getLocalMedia();
            if (!stream) {
                setIsWebRTCActive(false); // Reset if media acquisition failed
                return; // Error handled in getLocalMedia
            }
    
            const pc = await createPeerConnection(stream);
            if (!pc) {
                setIsWebRTCActive(false); // Reset if peer connection creation failed
                return; // Error creating PC
            }
    
            console.log("[WebRTC] Creating offer...");
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            console.log("[WebRTC] Local description (offer) set.");
    
            // Send the offer to the partner
            sendSignalRef.current({ 
                type: 'video-offer', 
                payload: pc.localDescription 
            });
            console.log("[WebRTC] Offer sent.");
        } catch (err: any) {
            console.error("[WebRTC] Error creating/sending offer:", err);
            onStreamErrorRef.current(err);
            stopVideoCall(false); // Cleanup on failure
        } finally {
            // Reset flag when done (success or error)
            isStartingCallRef.current = false;
        }
    }, [userId, partnerId, isWebRTCActive, getLocalMedia, createPeerConnection, stopVideoCall]); // Dependencies

    // --- Handle Received Signaling Messages ---
    const receivedSignal = useCallback(async (message: SignalingMessage) => {
        // Ignore signals if not intended for us, or if basic IDs are missing
        if (message.sender === userId || !partnerId || !userId) {
             // console.log("[WebRTC] Ignoring signal from self or missing IDs.");
             return;
        }

        console.log("[WebRTC] <<< Received Signal:", message.type, "from:", message.sender);

        try {
            // Get or create PeerConnection. Crucial for handling offer before local start.
            let pc = peerConnectionRef.current;
            let stream = localStream; // Use existing stream if available

            // Ensure we have local media and PC when handling offer/answer
            if ((message.type === 'video-offer' || message.type === 'video-answer') && !pc) {
                 console.log("[WebRTC] PC not found for offer/answer, need to create.");
                 if (!stream) {
                     console.log("[WebRTC] Local stream needed for offer/answer handling.");
                     stream = await getLocalMedia(); // Get media first
                     if (!stream) throw new Error("Failed to get local media to handle signal.");
                 }
                 pc = await createPeerConnection(stream); // Create PC with the stream
                 if (!pc) throw new Error("Failed to create peer connection to handle signal.");
            } else if (!pc && message.type !== 'ice-candidate') {
                 // If pc is still null here for non-candidate messages, something is wrong
                 console.error("[WebRTC] PeerConnection is null while processing signal:", message.type);
                 throw new Error(`PeerConnection not available for signal type ${message.type}`);
            }


            // Process different signal types
            switch (message.type) {
                case 'video-offer':
                    if (!message.payload) throw new Error("Offer signal missing payload data.");
                    if (!pc) throw new Error("PeerConnection not ready for offer."); // Should be created above

                    console.log("[WebRTC] Processing received offer...");
                    isInitiatorRef.current = false; // We are the receiver now

                    // Set remote description (the offer)
                    await pc.setRemoteDescription(new RTCSessionDescription(message.payload));
                    console.log("[WebRTC] Remote description (offer) set.");

                    // Create answer
                    console.log("[WebRTC] Creating answer...");
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    console.log("[WebRTC] Local description (answer) set.");

                    // Send the answer back
                    sendSignalRef.current({ 
                        type: 'video-answer', 
                        payload: pc.localDescription 
                    });
                    console.log("[WebRTC] Answer sent.");

                    // Mark as active now that negotiation is underway
                    setIsWebRTCActive(true);

                    // Process any queued candidates *after* setting descriptions
                     if (pendingCandidatesRef.current.length > 0) {
                        console.log(`[WebRTC] Processing ${pendingCandidatesRef.current.length} pending candidates...`);
                        await Promise.all(pendingCandidatesRef.current.map(candidate => pc!.addIceCandidate(candidate)));
                        console.log("[WebRTC] Pending candidates processed.");
                        pendingCandidatesRef.current = [];
                    }
                    break;

                case 'video-answer':
                    if (!message.payload) throw new Error("Answer signal missing payload data.");
                    if (!pc) throw new Error("PeerConnection not ready for answer.");

                    console.log("[WebRTC] Processing received answer...");
                    if (pc.signalingState !== 'have-local-offer') {
                         console.warn(`[WebRTC] Received answer in unexpected state: ${pc.signalingState}. Ignoring?`);
                         // return; // Or handle as appropriate
                    }

                    // Set remote description (the answer)
                    await pc.setRemoteDescription(new RTCSessionDescription(message.payload));
                    console.log("[WebRTC] Remote description (answer) set.");

                    // Mark as active now that negotiation is complete from our side
                    setIsWebRTCActive(true);

                     // Process any queued candidates *after* setting descriptions
                     if (pendingCandidatesRef.current.length > 0) {
                         console.log(`[WebRTC] Processing ${pendingCandidatesRef.current.length} pending candidates...`);
                         await Promise.all(pendingCandidatesRef.current.map(candidate => pc!.addIceCandidate(candidate)));
                         console.log("[WebRTC] Pending candidates processed.");
                         pendingCandidatesRef.current = [];
                     }
                    break;

                case 'ice-candidate':
                    if (!message.payload) throw new Error("ICE signal missing payload data.");
                    if (!pc) {
                        console.warn("[WebRTC] Received ICE candidate before PeerConnection ready. Queuing.");
                        pendingCandidatesRef.current.push(new RTCIceCandidate(message.payload));
                        return; // Wait for PC creation
                    }
                    if (!pc.remoteDescription) {
                        console.log("[WebRTC] Remote description not set yet. Queuing ICE candidate.");
                        pendingCandidatesRef.current.push(new RTCIceCandidate(message.payload));
                    } else {
                        console.log("[WebRTC] Adding received ICE candidate.");
                        await pc.addIceCandidate(new RTCIceCandidate(message.payload));
                        console.log("[WebRTC] ICE candidate added.");
                    }
                    break;

                case 'bye':
                    console.log("[WebRTC] Received 'bye' signal from partner.");
                    toast.info("Partner ended the video call.");
                    stopVideoCall(false); // Stop locally, don't notify partner back
                    break;

                default:
                    console.warn("[WebRTC] Unknown signal type received:", message.type);
            }
        } catch (error: any) {
            console.error("[WebRTC] Error processing signal:", message.type, error);
            toast.error("WebRTC Signaling Error", { description: `Failed to process signal (${message.type}): ${error.message}` });
            // Consider a cleanup on critical errors
            stopVideoCall(false); // Cleanup on error
        }
    }, [userId, partnerId, localStream, createPeerConnection, getLocalMedia, stopVideoCall]); // Key dependencies


    // --- Effect for Component Unmount Cleanup ---
    useEffect(() => {
        return () => {
            console.log("[WebRTC] Hook unmounting. Cleaning up WebRTC.");
            cleanupWebRTC(false); // Cleanup without notifying parent (unmount scenario)
        };
    }, [cleanupWebRTC]); // Only depends on the stable cleanupWebRTC callback

    // Return the state and functions needed by the parent component
    return {
        localStream,
        remoteStream,
        isWebRTCActive,
        startVideoCall,
        stopVideoCall,
        receivedSignal, // Provide the handler for ChatManager to call
    };
}