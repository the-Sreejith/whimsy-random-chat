// components/ChatInterface.tsx
'use client';

import React, { useState, useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, RefreshCw, X, Search, Loader2, Video, VideoOff, PhoneOff } from "lucide-react";
import ChatMessage from "@/components/ChatMessage";
import TypingIndicator from "@/components/TypingIndicator";
import VideoPlayer from "@/components/VideoPlayer";
import { useWebRTC } from "@/hooks/useWebRTC";
import { Message, SignalingMessage } from "@/types/chat";
import { toast } from "sonner";

// Define types
type ChatStatus = "idle" | "connecting" | "waiting" | "chatting" | "disconnected" | "error";

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

const SOCKET_SERVER_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";

export default function ChatInterface() {
    // State
    const [status, setStatus] = useState<ChatStatus>("idle");
    const [messages, setMessages] = useState<Message[]>([]);
    const [userId, setUserId] = useState<string | null>(null);
    const [partnerId, setPartnerId] = useState<string | null>(null);
    const [isPartnerTyping, setIsPartnerTyping] = useState(false);
    const [inputValue, setInputValue] = useState("");

    // Refs
    const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // --- Utility Functions ---
    const addMessage = useCallback((text: string, sender: "me" | "stranger" | "system") => {
        const newMessage: Message = {
            id: uuidv4(),
            text,
            sender,
            timestamp: Date.now(),
            system: sender === "system",
        };
        setMessages(prev => {
            // Prevent duplicate system messages if needed
            if (sender === 'system') {
                const lastMsg = prev[prev.length - 1];
                if (lastMsg?.system && lastMsg.text === text) {
                    return prev;
                }
            }
            return [...prev, newMessage];
        });
    }, []);

    // --- WebRTC Integration ---
    const sendSignalViaSocket = useCallback((signalData: Omit<SignalingMessage, 'sender' | 'target'>) => {
        if (socketRef.current?.connected && partnerId && userId && status === 'chatting') {
            console.log(`[Socket] Sending WebRTC signal: ${signalData.type}`);
            socketRef.current.emit("signal", {
                ...signalData,
                sender: userId,
                target: partnerId,
            });
        } else {
            console.warn("[Socket] Cannot send WebRTC signal, conditions not met.", {
                connected: socketRef.current?.connected, partnerId, userId, status
            });
        }
    }, [userId, partnerId, status]); // Depends on state vars

    const handleStreamError = useCallback((err: Error) => {
        console.error("WebRTC Stream Error:", err);
        toast.error("Video Error", {
            description: err.message || "Could not start video stream."
        });
        // Optionally stop the call attempt visually if needed
    }, []);

    const handleWebRTCCallEnded = useCallback(() => {
        console.log("[ChatInterface] WebRTC call ended callback received.");
        // No need to call stopWebRTCCall again, just update UI state if necessary
        // The hook already sets its internal state
    }, []);

    const {
        localStream,
        remoteStream,
        isWebRTCActive,
        startVideoCall,
        stopVideoCall: stopWebRTCCall,
        receivedSignal: handleReceivedWebRTCSignal,
    } = useWebRTC({
        userId,
        partnerId,
        sendSignal: sendSignalViaSocket,
        onStreamError: handleStreamError,
        onCallEnded: handleWebRTCCallEnded,
    });

    // --- Reset Function ---
    const resetChatState = useCallback((newStatus: ChatStatus = "disconnected") => {
        console.log(`Resetting chat state. New status: ${newStatus}`);
        // Stop WebRTC *before* clearing partnerId etc.
        if (isWebRTCActive) {
            stopWebRTCCall(false); // Stop WebRTC but don't trigger its internal onCallEnded notification again if caused by reset
        }

        setStatus(newStatus);
        setMessages(prev => newStatus === 'idle' ? [] : prev); // Keep messages on disconnect unless going fully idle
        setPartnerId(null);
        setIsPartnerTyping(false);
        setInputValue("");
        // Keep userId if we might reconnect quickly? Or clear it? Let's clear it on full disconnect/error.
        if (newStatus === 'disconnected' || newStatus === 'error' || newStatus === 'idle') {
             setUserId(null);
        }

        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = null;
        }
    }, [isWebRTCActive, stopWebRTCCall]); // Add stopWebRTCCall dependency


    // --- Socket Connection Logic ---

    // Function to setup listeners (only called once socket is confirmed connected)
    const setupSocketListeners = useCallback((socket: Socket<ServerToClientEvents, ClientToServerEvents>) => {
        console.log("[Socket] Setting up event listeners");

        // Remove existing listeners first to prevent duplicates if re-called
        socket.off("waiting");
        socket.off("matched");
        socket.off("message");
        socket.off("typing");
        socket.off("signal");
        socket.off("partner-disconnected");
        socket.off("server-error");
        socket.off("disconnect"); // Re-add disconnect here for handling during active chat

        // Add listeners
        socket.on("waiting", () => {
            console.log("[Socket] Event: waiting");
            setStatus("waiting");
            addMessage("Looking for someone to chat with...", "system");
        });

        socket.on("matched", ({ partnerId: newPartnerId }) => {
            console.log("[Socket] Event: matched with", newPartnerId);
            setPartnerId(newPartnerId);
            setStatus("chatting");
            addMessage("A stranger has connected!", "system");
             // Remove "Looking for..." message
             setMessages(prev => prev.filter(msg => !(msg.system && msg.text === "Looking for someone to chat with...")));
             inputRef.current?.focus();
        });

        socket.on("message", ({ text }) => {
            console.log("[Socket] Event: message received");
            addMessage(text, "stranger");
            setIsPartnerTyping(false); // Stop typing indicator on message receive
        });

        socket.on("typing", ({ isTyping }) => {
            // console.log("[Socket] Event: typing", isTyping); // Can be noisy
            setIsPartnerTyping(isTyping);
        });

        socket.on("signal", (payload) => {
             console.log("[Socket] Event: signal received type:", payload.type);
             if (payload.sender !== userId) {
                 handleReceivedWebRTCSignal(payload);
             } else {
                 console.warn("[Socket] Received signal from self, ignoring.");
             }
        });

        socket.on("partner-disconnected", () => {
            console.log("[Socket] Event: partner-disconnected");
            addMessage("The stranger has disconnected.", "system");
            resetChatState("disconnected"); // Reset state, keeps messages
            // Note: socket itself might still be connected to the server here
        });

        socket.on("server-error", (message) => {
            console.error("[Socket] Event: server-error", message);
            toast.error("Server Error", { description: message });
            resetChatState("error");
            socket.disconnect(); // Disconnect on server error
        });

        socket.on("disconnect", (reason) => {
            console.log("[Socket] Event: disconnect", reason);
            // Avoid resetting state if we initiated the disconnect (e.g., End Chat)
            if (status !== 'idle' && status !== 'disconnected' && status !== 'error') {
                if (reason === "io server disconnect") {
                     toast.error("Disconnected", { description: "Kicked by server." });
                     resetChatState("error");
                } else if (reason === "io client disconnect") {
                     console.log("[Socket] Disconnected by client action.");
                     // State should already be handled by handleEndChat/handleNextChat
                     // resetChatState("disconnected"); // Or reset here if needed
                } else {
                     toast.error("Connection Lost", { description: `Disconnected: ${reason}. Please reconnect.` });
                     resetChatState("error"); // Treat unexpected disconnects as errors
                }
            }
            socketRef.current = null; // Clear ref on disconnect
             setUserId(null); // Clear user ID on any disconnect
        });

    }, [addMessage, resetChatState, userId, handleReceivedWebRTCSignal, status]); // Added status dependency

    // Effect to cleanup socket on component unmount
    useEffect(() => {
        return () => {
            if (socketRef.current) {
                console.log("[ChatInterface] Unmounting component, disconnecting socket.");
                socketRef.current.disconnect();
                socketRef.current = null;
            }
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }
        };
    }, []);


    // --- User Actions ---
    const handleStartChat = useCallback(() => {
        // Prevent starting if already connecting/chatting
        if (status === 'connecting' || status === 'waiting' || status === 'chatting') {
            console.warn("Start chat called while already active/connecting.");
            return;
        }

        // Disconnect existing socket if any (e.g., after an error state)
        if (socketRef.current) {
            console.log("[Socket] Disconnecting existing socket before starting new chat.");
            socketRef.current.disconnect();
            socketRef.current = null;
        }

        console.log("[Socket] Attempting to connect to", SOCKET_SERVER_URL);
        setStatus('connecting');
        setMessages([]); // Clear messages for new chat session
        setPartnerId(null); // Ensure partnerId is null
        setIsPartnerTyping(false); // Ensure typing is false
        stopWebRTCCall(false); // Ensure WebRTC is stopped

        const newSocket = io(SOCKET_SERVER_URL, {
            reconnection: false, // Disable auto-reconnection, handle manually if needed
            timeout: 8000,      // Increase timeout slightly
        });
        socketRef.current = newSocket; // Store the instance

        // Setup temporary listeners for initial connection phase
        newSocket.once("connect", () => {
            console.log("[Socket] Connected successfully! Socket ID:", newSocket.id);
            // Don't set status to 'waiting' here, wait for 'your-id' then 'waiting' from server
        });

        newSocket.once("your-id", (id) => {
             console.log("[Socket] Received ID:", id);
             setUserId(id);
             // Now that we have an ID and are connected, setup the main listeners
             setupSocketListeners(newSocket);
             // Server should send 'waiting' next if pairing doesn't happen instantly
        });

        newSocket.once("connect_error", (err) => {
            console.error("[Socket] Connection Error:", err);
            toast.error("Connection Failed", {
                description: `Could not connect: ${err.message}. Please try again.`
            });
            resetChatState("error");
            socketRef.current = null; // Clear ref on error
        });

        // Explicitly connect (though io() does this, it clarifies intent)
        // newSocket.connect(); // Generally not needed as io() initiates connection

    }, [status, resetChatState, setupSocketListeners, stopWebRTCCall]); // Add dependencies

    const handleSendMessage = () => {
        if (inputValue.trim() && status === "chatting" && socketRef.current?.connected) {
            const text = inputValue.trim();
            socketRef.current.emit("message", { text });
            addMessage(text, "me");
            setInputValue("");
            handleSendTyping(false); // Stop typing indicator after sending
        }
    };

    const handleSendTyping = useCallback((isTyping: boolean) => {
        if (status !== 'chatting' || !socketRef.current?.connected) return;

        // Clear existing timeout if any
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = null;
        }

        if (isTyping) {
            // Send typing=true immediately
            socketRef.current.emit("typing", true);
            // Set a timeout to send typing=false later
            typingTimeoutRef.current = setTimeout(() => {
                if (socketRef.current?.connected) {
                    socketRef.current.emit("typing", false);
                }
                typingTimeoutRef.current = null;
            }, 2500); // Send false after 2.5 seconds of inactivity
        } else {
            // Send typing=false immediately if input cleared or message sent
            socketRef.current.emit("typing", false);
        }
    }, [status]); // Only depends on status

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setInputValue(newValue);
        handleSendTyping(newValue.length > 0);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    const handleEndChat = useCallback(() => {
        if (socketRef.current) {
            console.log("[ChatInterface] User ending chat.");
            addMessage("You have disconnected.", "system");
            socketRef.current.emit("leave"); // Notify server
            socketRef.current.disconnect(); // Close connection
            socketRef.current = null;
        }
        resetChatState("disconnected"); // Reset UI state
    }, [addMessage, resetChatState]); // Add dependencies

    const handleNextChat = useCallback(() => {
        console.log("[ChatInterface] Requesting next chat.");
        // First, end the current chat/connection cleanly
        if (socketRef.current) {
            if (status === 'chatting') {
                 addMessage("Finding a new chat partner...", "system"); // Add message before disconnect
                 socketRef.current.emit("leave");
            }
            socketRef.current.disconnect();
            socketRef.current = null;
        }
        // Reset state but keep status as 'idle' briefly before reconnecting
        resetChatState('idle');

        // Start a new chat connection attempt
        // Use setTimeout to ensure state updates settle before starting again
        setTimeout(handleStartChat, 100); // Small delay

    }, [status, addMessage, resetChatState, handleStartChat]); // Add dependencies

    const handleToggleVideo = useCallback(() => {
        if (isWebRTCActive) {
            console.log("[ChatInterface] User stopping video call.");
            stopWebRTCCall(true); // Stop call, notify hook
        } else if (status === 'chatting' && partnerId) {
            console.log("[ChatInterface] User starting video call.");
            startVideoCall();
        } else if (status !== 'chatting') {
            toast.info("Video Call Disabled", {
                description: "You must be connected to a partner to start video."
            });
        }
    }, [isWebRTCActive, status, partnerId, startVideoCall, stopWebRTCCall]); // Add dependencies

    // --- UI Effects ---
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isPartnerTyping]); // Scroll on new messages or typing indicator change

    // --- UI Components --- (Mostly unchanged, minor adjustments)
    const renderStatusIndicator = () => {
        switch (status) {
            case "idle": return <span className="text-muted-foreground flex items-center"><X className="w-4 h-4 mr-2 text-gray-500" />Idle</span>;
            case "connecting": return <span className="flex items-center text-blue-500"><Loader2 className="w-4 h-4 mr-2 animate-spin" />Connecting...</span>;
            case "waiting": return <span className="flex items-center text-amber-500"><Loader2 className="w-4 h-4 mr-2 animate-spin" />Searching...</span>;
            case "chatting": return (
                <span className="flex items-center text-green-500">
                    <span className="relative flex h-3 w-3 mr-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                    </span>Connected
                </span>
            );
            case "disconnected": return <span className="text-orange-600 flex items-center"><PhoneOff className="w-4 h-4 mr-2" />Disconnected</span>;
            case "error": return <span className="text-destructive flex items-center"><X className="w-4 h-4 mr-2" />Error</span>;
            default: return <span className="text-muted-foreground flex items-center"><X className="w-4 h-4 mr-2 text-gray-500" />Unknown</span>;
        }
    };

    const renderMainActionButton = () => {
        const isBusy = status === 'connecting' || status === 'waiting';

        if (status === 'idle' || status === 'disconnected' || status === 'error') {
            return (
                <Button onClick={handleStartChat} size="lg" disabled={isBusy}>
                    {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                    {isBusy ? 'Connecting...' : 'Start Chatting'}
                </Button>
            );
        }

        // If connecting, waiting, or chatting
        return (
            <div className="flex gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNextChat}
                    disabled={isBusy || !socketRef.current} // Disable if connecting/waiting or socket gone
                    className="flex items-center"
                    title="Find new partner"
                >
                    <RefreshCw className="w-4 h-4" /> <span className="hidden sm:inline ml-2">Next</span>
                </Button>
                <Button
                    variant={isWebRTCActive ? "secondary" : "outline"}
                    size="sm"
                    onClick={handleToggleVideo}
                    disabled={status !== 'chatting' || !partnerId} // Must be chatting with a partner
                    className="flex items-center"
                    title={isWebRTCActive ? 'Stop video call' : 'Start video call'}
                >
                    {isWebRTCActive ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                    <span className="hidden sm:inline ml-2">{isWebRTCActive ? 'Stop Video' : 'Start Video'}</span>
                </Button>
                <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleEndChat}
                    disabled={!socketRef.current && status !== 'chatting' && status !== 'waiting'} // Disable if fully idle/disconnected
                    className="flex items-center"
                    title="End current chat"
                >
                    <PhoneOff className="w-4 h-4" /> <span className="hidden sm:inline ml-2">End</span>
                </Button>
            </div>
        );
    };

    const renderWelcomeOrStatusScreen = () => (
        <div className="flex flex-col items-center justify-center h-full text-center p-4">
            {status === 'idle' && (
                <>
                    <div className="text-3xl font-bold bg-gradient-to-r from-indigo-500 to-purple-600 dark:from-indigo-400 dark:to-purple-500 bg-clip-text text-transparent pb-2 animate-fade-in">
                        Welcome to WhimsyChat
                    </div>
                    <p className="text-muted-foreground mb-6 max-w-md animate-slide-in">
                        Click "Start Chatting" to connect with a random stranger.
                    </p>
                </>
            )}
             {status === 'disconnected' &&
                 <p className="mt-4 text-lg text-orange-600 animate-fade-in">
                     Chat ended. Start a new one?
                 </p>
             }
             {status === 'error' &&
                 <p className="mt-4 text-lg text-destructive animate-fade-in">
                     Connection error. Please try starting again.
                 </p>
             }
            {/* Placeholder for connecting/waiting messages if desired */}
            {/* {status === 'connecting' && <p>Connecting...</p>} */}
            {/* {status === 'waiting' && <p>Searching for partner...</p>} */}
        </div>
    );

    return (
        <div className="flex h-full max-h-screen overflow-hidden bg-card text-card-foreground">
            {/* Left Panel: Chat */}
            <div className="flex flex-col w-full md:w-2/3 border-r dark:border-gray-700">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-2 border-b dark:border-gray-700 flex-wrap gap-2">
                    <div className="text-sm font-medium">{renderStatusIndicator()}</div>
                    <div className="flex gap-2">
                        {renderMainActionButton()}
                    </div>
                </div>

                {/* Message Area */}
                <div className="flex-grow overflow-y-auto p-4 space-y-2 relative">
                    {messages.length === 0 && (status === 'idle' || status === 'disconnected' || status === 'error') ? (
                        renderWelcomeOrStatusScreen()
                    ) : (
                        <>
                            {messages.map((message) => (
                                <ChatMessage key={message.id} message={message} />
                            ))}
                            {isPartnerTyping && status === "chatting" && (
                                <div className="flex justify-start sticky bottom-0 left-0">
                                     {/* Position typing indicator relative to messages */}
                                     <TypingIndicator />
                                </div>
                            )}
                            <div ref={messagesEndRef} style={{ height: '1px' }} /> {/* Scroll target */}
                        </>
                    )}
                </div>


                {/* Input Area */}
                <div className="p-3 border-t dark:border-gray-700 bg-background/90 dark:bg-gray-800/90 backdrop-blur-sm sticky bottom-0">
                    <div className="flex gap-2 items-center">
                        <Input
                            ref={inputRef}
                            value={inputValue}
                            onChange={handleInputChange}
                            onKeyDown={handleKeyDown}
                            placeholder={
                                status === "chatting"
                                    ? "Send a message..."
                                    : status === "waiting"
                                    ? "Waiting for a partner..."
                                    : status === "connecting"
                                    ? "Connecting..."
                                    : "Click 'Start Chatting' above"
                            }
                            disabled={status !== "chatting"}
                            className="flex-grow disabled:opacity-60 disabled:cursor-not-allowed"
                            aria-label="Chat message input"
                            maxLength={500} // Add max length
                        />
                        <Button
                            onClick={handleSendMessage}
                            disabled={status !== "chatting" || !inputValue.trim()}
                            aria-label="Send message"
                            size="icon"
                        >
                            <Send className="w-5 h-5" />
                        </Button>
                    </div>
                </div>
            </div>

             {/* Right Panel: Video */}
             <div className="hidden md:flex flex-col w-1/3 bg-muted/40 dark:bg-black/30">
                 <div className="aspect-video bg-black relative overflow-hidden border-b dark:border-gray-700 group">
                     <VideoPlayer stream={remoteStream} muted={false} />
                     {!remoteStream && (
                         <div className="absolute inset-0 flex items-center justify-center text-muted-foreground bg-black/60 text-sm">
                            {status === 'chatting' ? (partnerId ? "Partner's Video" : "Waiting for Partner") : "Offline"}
                         </div>
                     )}
                     <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">Partner</div>
                 </div>
                 <div className="aspect-video bg-black relative overflow-hidden group">
                     <VideoPlayer stream={localStream} muted={true} />
                     {!localStream && (
                         <div className="absolute inset-0 flex items-center justify-center text-muted-foreground bg-black/60 text-sm">
                             {isWebRTCActive ? "Starting video..." : "Your Video Off"}
                         </div>
                     )}
                      {localStream && (
                          <div className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">You (Muted)</div>
                      )}
                     <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">You</div>
                 </div>
                 {/* Optional: Add video controls here */}
             </div>
        </div>
    );
}