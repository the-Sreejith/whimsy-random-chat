'use client'; // This component uses hooks and interacts with the client-side

import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, RefreshCw, X, Search, CheckCircle, XCircle, Loader2 } from "lucide-react";
import ChatMessage from "@/components/ChatMessage";
import TypingIndicator from "@/components/TypingIndicator";
import { useChat } from "@/hooks/useChat"; // Use the refactored hook

export default function ChatInterface() {
  // Use our refactored hook to interact with the backend API & Sockets
  const { status, messages, isTyping, startChat, sendMessage, sendTyping, nextChat, endChat } = useChat();
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom when new messages arrive or typing status changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Focus input when chat becomes active
  useEffect(() => {
    if (status === "chatting") {
      inputRef.current?.focus();
    }
  }, [status]);

  // Handle input changes and notify backend about typing
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);

    // Inform the backend (via WebSocket) about typing status
    if (status === "chatting") {
        // Send typing=true immediately, potentially debounce sending typing=false
        sendTyping(newValue.length > 0);
        // Consider adding a debounce here to send `sendTyping(false)`
        // only after a pause in typing. For simplicity, we'll send on every change.
    }
  };

  // Handle sending a message
  const handleSendMessage = () => {
    if (inputValue.trim() && status === "chatting") {
      sendMessage(inputValue.trim());
      setInputValue("");
      sendTyping(false); // Explicitly set typing to false after sending
    }
  };

  // Send message on Enter key press
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Render different status indicators in the header
  const renderStatusIndicator = () => {
    switch (status) {
      case "idle":
        return <span className="text-muted-foreground flex items-center"><XCircle className="w-4 h-4 mr-2 text-gray-500" />Not connected</span>;
      case "searching":
        return (
          <span className="flex items-center text-amber-500">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Searching...
          </span>
        );
      case "chatting":
        return (
          <span className="flex items-center text-green-500">
            <span className="relative flex h-3 w-3 mr-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
            Connected
          </span>
        );
      case "disconnected":
        return <span className="text-destructive flex items-center"><XCircle className="w-4 h-4 mr-2" />Disconnected</span>;
      default:
         return <span className="text-muted-foreground flex items-center"><XCircle className="w-4 h-4 mr-2 text-gray-500" />Unknown</span>;
    }
  };

  // Render appropriate main action button based on status
   const renderMainActionButton = () => {
       if (status === 'idle' || status === 'disconnected') {
           return <Button onClick={startChat}>Start Chatting</Button>;
       }
       // If searching or chatting, show Next/End buttons
       return (
           <>
               <Button
                   variant="outline"
                   size="sm"
                   onClick={nextChat}
                   disabled={status === 'searching'} 
                   className="flex items-center"
               >
                   <RefreshCw className="w-4 h-4 mr-2" />
                   Next Chat
               </Button>
               {(status === "chatting" || status === "searching") && (
                   <Button
                       variant="destructive"
                       size="sm"
                       onClick={endChat}
                       className="flex items-center"
                   >
                       <X className="w-4 h-4 mr-2" />
                       End Chat
                   </Button>
               )}
           </>
       );
   };

  return (
    <div className="flex flex-col h-full bg-card text-card-foreground">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b dark:border-gray-700">
        <div className="flex items-center gap-4">
          <div className="text-lg font-semibold text-primary">Whimsy</div>
          <div className="text-sm">{renderStatusIndicator()}</div>
        </div>
        <div className="flex gap-2">
            {renderMainActionButton()}
        </div>
      </div>

      {/* Messages container */}
      <div className="flex-grow overflow-y-auto p-4 space-y-1">
        {status === "idle" || status === "disconnected" ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-3xl font-bold bg-gradient-to-r from-whimsy-500 to-whimsy-700 bg-clip-text text-transparent pb-2 animate-fade-in">
              Welcome to Whimsy
            </div>
            <p className="text-muted-foreground mb-6 max-w-md animate-slide-in">
              Ready to connect with someone new? Hit the button below!
            </p>
             <Button size="lg" onClick={startChat}  className="animate-slide-in animation-delay-200">
                <Search className="mr-2 h-4 w-4" /> Start a Random Chat
             </Button>
             {status === 'disconnected' && <p className="mt-4 text-sm text-destructive animate-fade-in">You were disconnected. Start a new chat!</p>}
          </div>
        ) : (
          <>
            {/* Render actual messages */}
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
            {/* Show typing indicator if applicable */}
            {isTyping && status === "chatting" && (
              <div className="flex justify-start">
                <TypingIndicator />
              </div>
            )}
            {/* Anchor for scrolling */}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input area */}
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
  );
};