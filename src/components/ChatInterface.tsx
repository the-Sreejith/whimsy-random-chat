'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, RefreshCw, X, Search, Loader2, Video, VideoOff, PhoneOff } from 'lucide-react';
import { toast } from 'sonner';

import ChatMessage from '@/components/ChatMessage'; // Keep this
import TypingIndicator from '@/components/TypingIndicator'; // Keep this
import VideoPlayer from '@/components/VideoPlayer'; // Keep this
import { useWebRTC } from '@/hooks/useWebRTC'; // Keep this
import { useChatManager, ChatStatus } from '@/hooks/useChatManager'; // Import the new hook
import { Message, SignalingMessage } from '@/types/chat'; // Keep this

const SOCKET_SERVER_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";

// --- Child Component Props (Optional but good practice) ---
interface ChatHeaderProps {
    status: ChatStatus;
    isWebRTCActive: boolean;
    canStartVideo: boolean;
    onStartChat: () => void;
    onNextChat: () => void;
    onEndChat: () => void;
    onToggleVideo: () => void;
}

interface MessageAreaProps {
    messages: Message[];
    isPartnerTyping: boolean;
    status: ChatStatus;
}

interface ChatInputProps {
    value: string;
    onChange: (value: string) => void;
    onSend: () => void;
    onTyping: (isTyping: boolean) => void;
    disabled: boolean;
    status: ChatStatus;
}

interface VideoPanelProps {
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    isWebRTCActive: boolean;
    status: ChatStatus;
    partnerId: string | null;
}


// --- Main Component ---
export default function ChatInterface() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // --- System Message Handling ---
    const addSystemMessage = useCallback((text: string) => {
        // Prevent duplicate consecutive system messages
        if (messages.length > 0) {
            const lastMsg = messages[messages.length - 1];
            if (lastMsg.system && lastMsg.text === text) {
                 return;
            }
        }
        const newMessage: Message = {
            id: uuidv4(),
            text,
            sender: "system",
            timestamp: Date.now(),
            system: true,
        };
        setMessages(prev => [...prev, newMessage]);
    }, [messages]); // Dependency on messages to check the last one

    // --- Chat Manager Hook ---
    const {
        status,
        userId,
        partnerId,
        isPartnerTyping,
        connect: connectSocket,
        disconnect: disconnectSocket,
        sendMessage: sendSocketMessage,
        sendTyping: sendSocketTyping,
        sendSignal: sendSocketSignal,
    } = useChatManager({
        socketUrl: SOCKET_SERVER_URL,
        onMessageReceived: useCallback((message) => {
            setMessages(prev => [...prev, message]);
            // Focus input when message received? Optional.
            // inputRef.current?.focus();
        }, []),
        onSignalReceived: useCallback((payload) => {
             // Forward signal to WebRTC hook
             handleReceivedWebRTCSignal(payload);
        }, []), // handleReceivedWebRTCSignal will be memoized by useWebRTC
        onSystemMessage: useCallback((text) => {
            if (text === "A stranger has connected!") {
                 // Clear "Looking for..." message more reliably
                 setMessages(prev => prev.filter(msg => !(msg.system && msg.text.includes("Looking for"))));
            }
            addSystemMessage(text);
            if (text === "A stranger has connected!") {
                 inputRef.current?.focus();
            }
        }, [addSystemMessage]),
    });

    // --- WebRTC Hook ---
    const handleStreamError = useCallback((err: Error) => {
        console.error("WebRTC Stream Error:", err);
        toast.error("Video Error", {
            description: err.message || "Could not start video stream."
        });
        // Maybe add system message?
        // addSystemMessage("Video connection failed.");
    }, []);

    const handleWebRTCCallEnded = useCallback(() => {
        console.log("[ChatInterface] WebRTC call ended callback received.");
        // The useWebRTC hook manages its streams, just ensure UI reflects it.
        // No need to add message here typically, unless explicitly desired.
        // addSystemMessage("Video call ended.");
    }, []);

    const {
        localStream,
        remoteStream,
        isWebRTCActive,
        startVideoCall,
        stopVideoCall: stopWebRTCCall,
        receivedSignal: handleReceivedWebRTCSignal,
    } = useWebRTC({
        userId, // Passed from useChatManager
        partnerId, // Passed from useChatManager
        sendSignal: sendSocketSignal, // Pass the sendSignal function from useChatManager
        onStreamError: handleStreamError,
        onCallEnded: handleWebRTCCallEnded,
    });

    // --- Actions ---
    const handleStartChat = useCallback(() => {
        setMessages([]); // Clear messages immediately for UI responsiveness
        stopWebRTCCall(false); // Ensure WebRTC is stopped before connecting
        connectSocket();
    }, [connectSocket, stopWebRTCCall]);

    const handleEndChat = useCallback(() => {
        stopWebRTCCall(true); // Stop WebRTC first, notify partner if possible
        disconnectSocket(true); // Disconnect socket, notify server
        // No need to add message here, useChatManager's 'disconnect' callback handles it
    }, [disconnectSocket, stopWebRTCCall]);

    const handleNextChat = useCallback(() => {
        // Stop video first *before* disconnecting socket
        stopWebRTCCall(true);

        // Disconnect socket (notify server via 'leave' if chatting)
        disconnectSocket(true);

        // Reset local state and start connection again
        // Use a short timeout to allow state updates to settle if needed,
        // although useChatManager handles its internal state reset.
        setMessages([]); // Clear messages immediately
        // Optionally add a system message here if useChatManager doesn't cover it
        addSystemMessage("Finding a new chat partner...");
        setTimeout(() => {
            connectSocket();
        }, 100); // Small delay might help if state updates are complex

    }, [disconnectSocket, stopWebRTCCall, connectSocket, addSystemMessage]);

    const handleSendMessage = useCallback(() => {
        if (inputValue.trim() && status === "chatting") {
            const text = inputValue.trim();
            sendSocketMessage(text);
            // Add "me" message locally
            const newMessage: Message = {
                id: uuidv4(),
                text,
                sender: "me",
                timestamp: Date.now(),
            };
            setMessages(prev => [...prev, newMessage]);
            setInputValue("");
            sendSocketTyping(false); // Explicitly stop typing indicator
            inputRef.current?.focus();
        }
    }, [inputValue, status, sendSocketMessage, sendSocketTyping]);

    const handleInputChange = useCallback((value: string) => {
        setInputValue(value);
        // Debounce typing indicator logic? Or keep simple? Let's keep simple.
        // sendSocketTyping(value.length > 0); // useChatManager handles the timeout logic
    }, [sendSocketTyping]); // Remove sendSocketTyping if not called here directly

    const handleTyping = useCallback((isTyping: boolean) => {
         sendSocketTyping(isTyping);
    },[sendSocketTyping]);


    const handleToggleVideo = useCallback(() => {
        if (isWebRTCActive) {
            console.log("[ChatInterface] User stopping video call.");
            stopWebRTCCall(true); // Stop call, notify hook/partner
        } else if (status === 'chatting' && partnerId) {
            console.log("[ChatInterface] User starting video call.");
            // Optionally add a system message like "Starting video..."
            // addSystemMessage("Attempting to start video call...");
            startVideoCall();
        } else if (status !== 'chatting') {
            toast.info("Video Call Disabled", {
                description: "You must be connected to a partner to start video."
            });
        }
    }, [isWebRTCActive, status, partnerId, startVideoCall, stopWebRTCCall]);

    // --- Effects ---
    useEffect(() => {
        // Scroll to bottom on new messages or typing indicator change
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isPartnerTyping]);

    const ChatHeader = ({ status, isWebRTCActive, canStartVideo, onStartChat, onNextChat, onEndChat, onToggleVideo }: ChatHeaderProps) => {
        const renderStatusIndicator = () => {
            // ... (same logic as before)
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
            const canInteract = status === 'chatting' || status === 'waiting'; // Can end/next if waiting

            if (status === 'idle' || status === 'disconnected' || status === 'error') {
                return (
                    <Button onClick={onStartChat} size="lg" disabled={isBusy}>
                        {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                        {isBusy ? 'Connecting...' : 'Start Chatting'}
                    </Button>
                );
            }

            return (
                 <div className="flex gap-2">
                     <Button variant="outline" size="sm" onClick={onNextChat} disabled={isBusy} title="Find new partner">
                         <RefreshCw className="w-4 h-4" /> <span className="hidden sm:inline ml-2">Next</span>
                     </Button>
                     <Button variant={isWebRTCActive ? "secondary" : "outline"} size="sm" onClick={onToggleVideo} disabled={!canStartVideo} title={isWebRTCActive ? 'Stop video call' : 'Start video call'}>
                         {isWebRTCActive ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                         <span className="hidden sm:inline ml-2">{isWebRTCActive ? 'Stop Video' : 'Start Video'}</span>
                     </Button>
                     <Button variant="destructive" size="sm" onClick={onEndChat} disabled={!canInteract} title="End current chat">
                         <PhoneOff className="w-4 h-4" /> <span className="hidden sm:inline ml-2">End</span>
                     </Button>
                 </div>
            );
        };

        return (
            <div className="flex items-center justify-between px-4 py-2 border-b dark:border-gray-700 flex-wrap gap-2">
                <div className="text-sm font-medium">{renderStatusIndicator()}</div>
                <div className="flex gap-2">
                    {renderMainActionButton()}
                </div>
            </div>
        );
    };

    const MessageArea = ({ messages, isPartnerTyping, status }: MessageAreaProps) => {
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
        {status === 'connecting' && <p>Connecting...</p>}
        {status === 'waiting' && <p>Searching for partner...</p>}
             </div>
         );

        return (
            <div className="flex-grow overflow-y-auto p-4 space-y-2 relative">
                {messages.length === 0 && (status === 'idle' || status === 'disconnected' || status === 'error') ? (
                    renderWelcomeOrStatusScreen()
                ) : (
                    <>
                        {messages.map((message) => (
                            <ChatMessage key={message.id} message={message} />
                        ))}
                        {isPartnerTyping && status === "chatting" && (
                            <div className="flex justify-start sticky bottom-1 left-4"> {/* Adjusted position slightly */}
                                 <TypingIndicator />
                            </div>
                        )}
                        <div ref={messagesEndRef} style={{ height: '1px' }} />
                    </>
                )}
            </div>
        );
    };

    const ChatInput = ({ value, onChange, onSend, onTyping, disabled, status }: ChatInputProps) => {
         const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
             if (e.key === "Enter" && !e.shiftKey) {
                 e.preventDefault();
                 onSend();
             }
         };

         const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
              onChange(e.target.value);
              onTyping(e.target.value.length > 0); // Notify typing status on change
         }

        return (
            <div className="p-3 border-t dark:border-gray-700 bg-background/90 dark:bg-gray-800/90 backdrop-blur-sm sticky bottom-0">
                <div className="flex gap-2 items-center">
                    <Input
                        ref={inputRef} // Keep ref here for focus management
                        value={value}
                        onChange={handleChange}
                        onKeyDown={handleKeyDown}
                        placeholder={
                            status === "chatting" ? "Send a message..." :
                            status === "waiting" ? "Waiting for a partner..." :
                            status === "connecting" ? "Connecting..." :
                            "Click 'Start Chatting' above"
                        }
                        disabled={disabled}
                        className="flex-grow disabled:opacity-60 disabled:cursor-not-allowed"
                        aria-label="Chat message input"
                        maxLength={500}
                    />
                    <Button
                        onClick={onSend}
                        disabled={disabled || !value.trim()}
                        aria-label="Send message"
                        size="icon"
                    >
                        <Send className="w-5 h-5" />
                    </Button>
                </div>
            </div>
        );
    };

     const VideoPanel = ({ localStream, remoteStream, isWebRTCActive, status, partnerId }: VideoPanelProps) => {
         // ... (keep the JSX from the original component, passing props down)
         return (
              <div className="hidden md:flex flex-col w-1/3 bg-muted/40 dark:bg-black/30">
                  <div className="aspect-video bg-black relative overflow-hidden border-b dark:border-gray-700 group">
                      <VideoPlayer stream={remoteStream} muted={false} />
                      {!remoteStream && (
                          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground bg-black/60 text-sm">
                             {status === 'chatting' ? (partnerId ? "Partner's Video" : "Waiting for Partner") : "Offline"}
                          </div>
                      )}
                      {/* ... other overlays ... */}
                  </div>
                  <div className="aspect-video bg-black relative overflow-hidden group">
                      <VideoPlayer stream={localStream} muted={true} />
                      {!localStream && (
                          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground bg-black/60 text-sm">
                              {isWebRTCActive ? "Starting video..." : "Your Video Off"}
                          </div>
                      )}
                       {/* ... other overlays ... */}
                  </div>
              </div>
         );
     };


    // --- Render Main Component ---
    return (
        <div className="flex h-full max-h-screen overflow-hidden bg-card text-card-foreground">
            {/* Left Panel: Chat */}
            <div className="flex flex-col w-full md:w-2/3 border-r dark:border-gray-700">
                <ChatHeader
                    status={status}
                    isWebRTCActive={isWebRTCActive}
                    canStartVideo={status === 'chatting' && !!partnerId}
                    onStartChat={handleStartChat}
                    onNextChat={handleNextChat}
                    onEndChat={handleEndChat}
                    onToggleVideo={handleToggleVideo}
                />
                <MessageArea
                    messages={messages}
                    isPartnerTyping={isPartnerTyping}
                    status={status}
                />
                <ChatInput
                    value={inputValue}
                    onChange={handleInputChange}
                    onSend={handleSendMessage}
                    onTyping={handleTyping} // Pass typing handler
                    disabled={status !== "chatting"}
                    status={status}
                />
            </div>

            {/* Right Panel: Video */}
            <VideoPanel
                localStream={localStream}
                remoteStream={remoteStream}
                isWebRTCActive={isWebRTCActive}
                status={status}
                partnerId={partnerId}
            />
        </div>
    );
}
