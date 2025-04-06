'use client';

import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, RefreshCw, X, Search, Loader2, Video, VideoOff, PhoneOff } from "lucide-react";
import ChatMessage from "@/components/ChatMessage";
import TypingIndicator from "@/components/TypingIndicator";
import VideoPlayer from "@/components/VideoPlayer";
import { useChat } from "@/hooks/useChat";
import { useWebRTC } from "@/hooks/useWebRTC";

export default function ChatInterface() {
  const {
    userId,
    status,
    messages,
    roomId,
    partnerId,
    isPartnerTyping,
    startChat,
    sendMessage,
    sendTyping,
    nextChat,
    endChat,
    sendSignalingMessage,
  } = useChat();

  const {
    localStream,
    remoteStream,
    isWebRTCActive,
    startVideoCall,
    stopVideoCall,
    receivedSignal,
  } = useWebRTC({
    userId,
    partnerId,
    sendSignal: sendSignalingMessage,
    onStreamError: (err) => console.error("Stream Error:", err),
  });

  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isPartnerTyping]);

  useEffect(() => {
    if (status === "chatting") {
      inputRef.current?.focus();
    }
  }, [status]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    if (status === "chatting") {
        sendTyping(newValue.length > 0);
    }
  };

  const handleSendMessage = () => {
    if (inputValue.trim() && status === "chatting") {
      sendMessage(inputValue.trim());
      setInputValue("");
      sendTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleToggleVideo = () => {
      if (isWebRTCActive) {
          stopVideoCall();
      } else if (status === 'chatting' && partnerId) {
          startVideoCall();
      }
  }

  const renderStatusIndicator = () => {
    switch (status) {
      case "idle":
        return <span className="text-muted-foreground flex items-center"><VideoOff className="w-4 h-4 mr-2 text-gray-500" />Not connected</span>;
      case "searching":
        return (
          <span className="flex items-center text-amber-500">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />Searching...
          </span>
        );
      case "chatting":
        return (
          <span className="flex items-center text-green-500">
            <span className="relative flex h-3 w-3 mr-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>Connected
          </span>
        );
      case "disconnected":
        return <span className="text-destructive flex items-center"><VideoOff className="w-4 h-4 mr-2" />Disconnected</span>;
      default:
         return <span className="text-muted-foreground flex items-center"><VideoOff className="w-4 h-4 mr-2 text-gray-500" />Unknown</span>;
    }
  };

   const renderMainActionButton = () => {
       if (status === 'idle' || status === 'disconnected') {
           return <Button onClick={startChat} size="lg"><Search className="mr-2 h-4 w-4" />Start Chatting</Button>;
       }
       return (
           <div className="flex gap-2">
               <Button
                   variant="outline"
                   size="sm"
                   onClick={nextChat}
                   disabled={status === 'searching'}
                   className="flex items-center"
               >
                   <RefreshCw className="w-4 h-4 mr-2" />Next
               </Button>
                <Button
                    variant={isWebRTCActive ? "secondary" : "outline"}
                    size="sm"
                    onClick={handleToggleVideo}
                    disabled={status !== 'chatting'}
                    className="flex items-center"
                >
                    {isWebRTCActive ? <VideoOff className="w-4 h-4 mr-2" /> : <Video className="w-4 h-4 mr-2" />}
                    {isWebRTCActive ? 'Stop Video' : 'Start Video'}
                </Button>
               {(status === "chatting" || status === "searching") && (
                   <Button
                       variant="destructive"
                       size="sm"
                       onClick={endChat}
                       className="flex items-center"
                   >
                       <PhoneOff className="w-4 h-4 mr-2" />End
                   </Button>
               )}
           </div>
       );
   };

  return (
    <div className="flex h-full bg-card text-card-foreground">
        <div className="flex flex-col w-2/3 border-r dark:border-gray-700">
            <div className="flex items-center justify-between px-4 py-3 border-b dark:border-gray-700">
                <div className="text-sm">{renderStatusIndicator()}</div>
                <div className="flex gap-2">
                    {renderMainActionButton()}
                </div>
            </div>

            <div className="flex-grow overflow-y-auto p-4 space-y-1">
                {status === "idle" || status === "disconnected" ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                    <div className="text-3xl font-bold bg-gradient-to-r from-whimsy-500 to-whimsy-700 bg-clip-text text-transparent pb-2 animate-fade-in">
                    Welcome to Whimsy
                    </div>
                    <p className="text-muted-foreground mb-6 max-w-md animate-slide-in">
                    Ready to connect with someone new? Hit the button!
                    </p>
                    {status === 'disconnected' && <p className="mt-4 text-sm text-destructive animate-fade-in">You were disconnected. Start a new chat!</p>}
                </div>
                ) : (
                <>
                    {messages.map((message) => (
                    <ChatMessage key={message.id} message={message} />
                    ))}
                    {isPartnerTyping && status === "chatting" && (
                    <div className="flex justify-start">
                        <TypingIndicator />
                    </div>
                    )}
                    <div ref={messagesEndRef} />
                </>
                )}
            </div>

            <div className="p-3 border-t dark:border-gray-700 bg-background/80 dark:bg-gray-800/80 backdrop-blur-sm">
                <div className="flex gap-2 items-center">
                <Input
                    ref={inputRef}
                    value={inputValue}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder={
                    status === "chatting"
                        ? "Type your message..."
                        : status === "searching"
                        ? "Connecting..."
                        : "Click 'Start Chatting' to begin"
                    }
                    disabled={status !== "chatting"}
                    className="flex-grow disabled:opacity-70 disabled:cursor-not-allowed"
                    aria-label="Chat message input"
                />
                <Button
                    onClick={handleSendMessage}
                    disabled={status !== "chatting" || !inputValue.trim()}
                    aria-label="Send message"
                    size="icon"
                >
                    <Send className="w-4 h-4" />
                </Button>
                </div>
            </div>
        </div>

        <div className="w-1/3 flex flex-col bg-muted/30 dark:bg-black/20">
            <div className="aspect-video bg-black relative overflow-hidden border-b dark:border-gray-700">
                <VideoPlayer stream={remoteStream} muted={false} />
                {!remoteStream && status === 'chatting' && (
                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground bg-black/50">
                        Partner's Video
                    </div>
                )}
                 {!remoteStream && status !== 'chatting' && (
                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground bg-black/50">
                        Offline
                    </div>
                )}
            </div>
            <div className="aspect-video bg-black relative overflow-hidden">
                 <VideoPlayer stream={localStream} muted={true} />
                  {!localStream && (
                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground bg-black/50">
                        Your Video (Off)
                    </div>
                  )}
            </div>
        </div>
    </div>
  );
};