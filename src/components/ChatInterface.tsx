'use client'; //chatInterface.tsx

import React, { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, RefreshCw, X, Search, Loader2, Video, VideoOff, PhoneOff } from 'lucide-react';
import { toast } from 'sonner';

import ChatMessage from '@/components/ChatMessage';
import TypingIndicator from '@/components/TypingIndicator';
import VideoPlayer from '@/components/VideoPlayer';
import { WebRTCProvider, useWebRTCContext } from '@/components/WebRTCProvider';
import { useChatManager } from '@/hooks/useChatManager';
import { Message, ChatStatus, SignalingMessage } from '@/types/chat';

// =============== UTILITY FUNCTIONS ===============
function debounce<T extends (...args: any[]) => any>(fn: T, ms = 300) {
    let timeoutId: ReturnType<typeof setTimeout>;
    return function(this: any, ...args: Parameters<T>) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), ms);
    };
}

// =============== CUSTOM HOOKS ===============
// Hook for managing messages
function useMessageManager() {
    const [messages, setMessages] = useState<Message[]>([]);
    
    const addSystemMessage = useCallback((text: string) => {
        // Prevent duplicate consecutive system messages
        if (text) {
            setMessages(prev => {
                if (prev.length > 0) {
                    const lastMsg = prev[prev.length - 1];
                    if (lastMsg.system && lastMsg.text === text) {
                        return prev;
                    }
                }
                
                const newMessage: Message = {
                    id: uuidv4(),
                    text,
                    sender: "system",
                    timestamp: Date.now(),
                    system: true,
                };
                return [...prev, newMessage];
            });
        }
    }, []);

    const addUserMessage = useCallback((text: string) => {
        const newMessage: Message = {
            id: uuidv4(),
            text,
            sender: "me",
            timestamp: Date.now(),
        };
        setMessages(prev => [...prev, newMessage]);
    }, []);
    
    const addPartnerMessage = useCallback((message: Message) => {
        setMessages(prev => [...prev, message]);
    }, []);

    const clearMessages = useCallback(() => {
        setMessages([]);
    }, []);
    
    const filterLookingMessages = useCallback(() => {
        setMessages(prev => prev.filter(msg => !(msg.system && msg.text.includes("Looking for"))));
    }, []);

    return {
        messages,
        addSystemMessage,
        addUserMessage,
        addPartnerMessage,
        clearMessages,
        filterLookingMessages
    };
}

// Hook for managing input state
function useInputManager() {
    const [inputValue, setInputValue] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    
    const clearInput = useCallback(() => {
        setInputValue("");
    }, []);
    
    const focusInput = useCallback(() => {
        setTimeout(() => {
            inputRef.current?.focus();
        }, 0);
    }, []);
    
    return {
        inputValue,
        setInputValue,
        inputRef,
        clearInput,
        focusInput
    };
}

// =============== COMPONENT INTERFACES ===============
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
    messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

interface ChatInputProps {
    value: string;
    onChange: (value: string) => void;
    onSend: () => void;
    onTyping: (isTyping: boolean) => void;
    disabled: boolean;
    status: ChatStatus;
    inputRef: React.RefObject<HTMLInputElement | null>;
}

interface VideoPanelProps {
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    isWebRTCActive: boolean;
    status: ChatStatus;
    partnerId: string | null;
}

// =============== MEMOIZED COMPONENTS ===============
const ChatHeader = memo(function ChatHeader({ 
    status, 
    isWebRTCActive, 
    canStartVideo, 
    onStartChat, 
    onNextChat, 
    onEndChat, 
    onToggleVideo 
}: ChatHeaderProps) {
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
        const canInteract = status === 'chatting' || status === 'waiting';

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
});

const MessageArea = memo(function MessageArea({ 
    messages, 
    isPartnerTyping, 
    status,
    messagesEndRef
}: MessageAreaProps) {
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
            {status === 'connecting' && <div className="flex items-center text-blue-500"><Loader2 className="w-4 h-4 mr-2 animate-spin" />Connecting...</div>}
            {status === 'waiting' && <div className="flex items-center text-amber-500"><Loader2 className="w-4 h-4 mr-2 animate-spin" />Searching for partner...</div>}
        </div>
    );

    // Scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isPartnerTyping, messagesEndRef]);

    return (
        <div className="flex-grow overflow-y-auto p-4 space-y-2 relative">
            {messages.length === 0 && (status === 'idle' || status === 'disconnected' || status === 'error' || status === 'connecting' || status === 'waiting') ? (
                renderWelcomeOrStatusScreen()
            ) : (
                <>
                    {messages.map((message) => (
                        <ChatMessage key={message.id} message={message} />
                    ))}
                    {isPartnerTyping && status === "chatting" && (
                        <div className="flex justify-start sticky bottom-1 left-4">
                            <TypingIndicator />
                        </div>
                    )}
                    <div ref={messagesEndRef} style={{ height: '1px' }} />
                </>
            )}
        </div>
    );
});

// This is the component causing the focus issues, so we've heavily optimized it
const ChatInput = memo(function ChatInput({ 
    value, 
    onChange, 
    onSend, 
    onTyping, 
    disabled, 
    status,
    inputRef
}: ChatInputProps) {
    // Use ref to track typing state to avoid re-renders
    const isTypingRef = useRef(false);
    
    // Create a stable debounced typing notification function
    const debouncedTyping = useMemo(() => 
        debounce((isTyping: boolean) => {
            onTyping(isTyping);
        }, 500), 
    [onTyping]);
    
    // Ensure focus is maintained after value changes
    useEffect(() => {
        if (status === 'chatting') {
            inputRef.current?.focus();
        }
    }, [status, inputRef]);
    
    // For tracking input focus issues
    useEffect(() => {
        const handleFocusOut = () => {
            if (status === 'chatting' && document.activeElement !== inputRef.current) {
                console.log("Input lost focus", document.activeElement);
            }
        };
        
        window.addEventListener('focusout', handleFocusOut);
        return () => window.removeEventListener('focusout', handleFocusOut);
    }, [status, inputRef]);

    // Event handlers
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        onChange(newValue);
        
        // Only send typing notifications when state changes to avoid re-renders
        const shouldNotifyTyping = newValue.length > 0;
        if (shouldNotifyTyping !== isTypingRef.current) {
            isTypingRef.current = shouldNotifyTyping;
            debouncedTyping(shouldNotifyTyping);
        }
    };
    
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (value.trim() && !disabled) {
            onSend();
            // Focus is handled by the useEffect when value changes to empty
        }
    };
    
    // Handle button click without losing focus
    const handleButtonClick = (e: React.MouseEvent) => {
        if (value.trim() && !disabled) {
            e.preventDefault();
            onSend();
        }
    };

    return (
        <div className="p-3 border-t dark:border-gray-700 bg-background/90 dark:bg-gray-800/90 backdrop-blur-sm sticky bottom-0">
            <form onSubmit={handleSubmit} className="flex gap-2 items-center">
                <Input
                    ref={inputRef}
                    id="chat-input"
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
                    autoComplete="off"
                />
                <Button
                    type="button"
                    onClick={handleButtonClick}
                    disabled={disabled || !value.trim()}
                    aria-label="Send message"
                    size="icon"
                >
                    <Send className="w-5 h-5" />
                </Button>
            </form>
        </div>
    );
});

const VideoPanel = memo(function VideoPanel({ 
    localStream, 
    remoteStream, 
    isWebRTCActive, 
    status, 
    partnerId 
}: VideoPanelProps) {
    return (
        <div className="hidden md:flex flex-col w-1/3 bg-muted/40 dark:bg-black/30 border-l dark:border-gray-700">
            {/* Remote Video */}
            <div className="aspect-video bg-black relative overflow-hidden border-b dark:border-gray-700 group">
                <VideoPlayer stream={remoteStream} muted={false} />
                {!remoteStream && (
                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground bg-black/60 text-sm px-2 text-center">
                        {status === 'chatting' ? (partnerId ? (isWebRTCActive ? "Waiting for partner's video..." : "Partner's Video Off") : "Waiting for Partner") : "Offline"}
                    </div>
                )}
                {remoteStream && (
                    <div className="absolute top-2 left-2 bg-black/50 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                        <Video className="w-4 h-4"/>
                    </div>
                )}
            </div>
            {/* Local Video */}
            <div className="aspect-video bg-black relative overflow-hidden group">
                <VideoPlayer stream={localStream} muted={true} />
                {!localStream && (
                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground bg-black/60 text-sm px-2 text-center">
                        {status === 'chatting' && isWebRTCActive ? "Starting your video..." : "Your Video Off"}
                    </div>
                )}
                {localStream && (
                    <div className="absolute top-2 left-2 bg-black/50 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                        <Video className="w-4 h-4"/>
                    </div>
                )}
            </div>
            {/* Add some padding/info at the bottom if needed */}
            <div className="p-2 text-xs text-muted-foreground text-center border-t dark:border-gray-700">
                {isWebRTCActive ? "Video call active" : (status === 'chatting' ? "Video available" : "Video offline")}
            </div>
        </div>
    );
});

// =============== MAIN COMPONENT ===============
export default function ChatInterface() {
    // Custom hooks for state management
    const messageManager = useMessageManager();
    const inputManager = useInputManager();
    const messagesEndRef = useRef<HTMLDivElement>(null);
    
    // WebRTC Signal Handler Ref
    const handleReceivedSignalRef = useRef<(payload: any) => void>(() => {});
    
    // WebRTC Hook Callbacks
    const handleStreamError = useCallback((err: Error) => {
        console.error("WebRTC Stream Error:", err);
        toast.error("Video Error", {
            description: err.message || "Could not start video stream."
        });
        messageManager.addSystemMessage(`Video Error: ${err.message}`);
    }, [messageManager]);

    const handleWebRTCCallEnded = useCallback(() => {
        console.log("[ChatInterface] WebRTC call ended callback received.");
        messageManager.addSystemMessage("Video call ended.");
    }, [messageManager]);

    // Chat Manager Hook
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
        onMessageReceived: useCallback((message) => {
            messageManager.addPartnerMessage(message);
        }, [messageManager]),
        onSignalReceived: useCallback((payload) => {
            handleReceivedSignalRef.current(payload);
        }, []),
        onSystemMessage: useCallback((text) => {
            if (text === "A stranger has connected!") {
                messageManager.filterLookingMessages();
            }
            messageManager.addSystemMessage(text);
            if (text === "A stranger has connected!") {
                inputManager.focusInput();
            }
        }, [messageManager, inputManager]),
    });

    // Return main component with WebRTC provider
    return (
        <WebRTCProvider
            userId={userId}
            partnerId={partnerId}
            sendSignal={sendSocketSignal}
            onStreamError={handleStreamError}
            onCallEnded={handleWebRTCCallEnded}
        >
            <ChatInterfaceContent
                messages={messageManager.messages}
                messagesEndRef={messagesEndRef}
                inputManager={inputManager}
                messageManager={messageManager}
                status={status}
                isPartnerTyping={isPartnerTyping}
                partnerId={partnerId}
                connectSocket={connectSocket}
                disconnectSocket={disconnectSocket}
                sendSocketMessage={sendSocketMessage}
                sendSocketTyping={sendSocketTyping}
                handleReceivedSignalRef={handleReceivedSignalRef}
            />
        </WebRTCProvider>
    );
}

// =============== CONTENT COMPONENT ===============
interface ChatInterfaceContentProps {
    messages: Message[];
    messagesEndRef: React.RefObject<HTMLDivElement | null>;
    inputManager: ReturnType<typeof useInputManager>;
    messageManager: ReturnType<typeof useMessageManager>;
    status: ChatStatus;
    isPartnerTyping: boolean;
    partnerId: string | null;
    connectSocket: () => void;
    disconnectSocket: (notifyServer?: boolean) => void;
    sendSocketMessage: (text: string) => void;
    sendSocketTyping: (isTyping: boolean) => void;
    handleReceivedSignalRef: React.MutableRefObject<(payload: any) => void>;
}

function ChatInterfaceContent({
    messages,
    messagesEndRef,
    inputManager,
    messageManager,
    status,
    isPartnerTyping,
    partnerId,
    connectSocket,
    disconnectSocket,
    sendSocketMessage,
    sendSocketTyping,
    handleReceivedSignalRef,
}: ChatInterfaceContentProps) {
    // Access WebRTC context
    const {
        localStream,
        remoteStream,
        isWebRTCActive,
        startVideoCall,
        stopVideoCall,
        receivedSignal: handleReceivedWebRTCSignal,
    } = useWebRTCContext();

    // Update signal handler ref when it changes
    useEffect(() => {
        handleReceivedSignalRef.current = handleReceivedWebRTCSignal;
    }, [handleReceivedWebRTCSignal, handleReceivedSignalRef]);

    // === Action handlers ===
    const handleStartChat = useCallback(() => {
        messageManager.clearMessages();
        inputManager.clearInput();
        stopVideoCall(false);
        connectSocket();
    }, [connectSocket, stopVideoCall, inputManager, messageManager]);

    const handleEndChat = useCallback(() => {
        stopVideoCall(true);
        disconnectSocket(true);
    }, [disconnectSocket, stopVideoCall]);

    const handleNextChat = useCallback(() => {
        stopVideoCall(true);
        disconnectSocket(true);
        messageManager.clearMessages();
        inputManager.clearInput();
        messageManager.addSystemMessage("Finding a new chat partner...");
        setTimeout(() => {
            connectSocket();
        }, 100);
    }, [disconnectSocket, stopVideoCall, connectSocket, messageManager, inputManager]);

    const handleSendMessage = useCallback(() => {
        if (inputManager.inputValue.trim() && status === "chatting") {
            const text = inputManager.inputValue.trim();
            sendSocketMessage(text);
            messageManager.addUserMessage(text);
            inputManager.clearInput();
            sendSocketTyping(false);
            inputManager.focusInput();
        }
    }, [inputManager, status, sendSocketMessage, messageManager, sendSocketTyping]);

    const handleToggleVideo = useCallback(() => {
        if (isWebRTCActive) {
            console.log("[ChatInterface] User stopping video call.");
            stopVideoCall(true);
        } else if (status === 'chatting' && partnerId) {
            console.log("[ChatInterface] User starting video call.");
            messageManager.addSystemMessage("Attempting to start video call...");
            startVideoCall();
        } else if (status !== 'chatting') {
            toast.info("Video Call Disabled", {
                description: "You must be connected to a partner to start video."
            });
        }
    }, [isWebRTCActive, status, partnerId, startVideoCall, stopVideoCall, messageManager]);

    // === Render ===
    return (
        <div className="flex h-full max-h-screen overflow-hidden bg-card text-card-foreground">
            {/* Left Panel: Chat */}
            <div className="flex flex-col w-full md:w-2/3">
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
                    messagesEndRef={messagesEndRef}
                />
                <ChatInput
                    value={inputManager.inputValue}
                    onChange={inputManager.setInputValue}
                    onSend={handleSendMessage}
                    onTyping={sendSocketTyping}
                    disabled={status !== "chatting"}
                    status={status}
                    inputRef={inputManager.inputRef}
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