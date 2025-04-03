import { Message } from "@/types/chat"; // Ensure this path is correct
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface ChatMessageProps {
  message: Message; // Use the Message type from types/chat
}

const ChatMessage = ({ message }: ChatMessageProps) => {
  // Defensively check timestamp validity before formatting
  const timestamp = message.timestamp && !isNaN(message.timestamp)
    ? format(new Date(message.timestamp), "HH:mm")
    : '--:--';

  // Handle system messages
  if (message.system) {
    return (
      <div className="flex justify-center my-2 animate-fade-in">
        <div className="px-4 py-1 text-xs italic text-center text-muted-foreground bg-muted/30 rounded-full">
          {message.text} ({timestamp})
        </div>
      </div>
    );
  }

  // Handle regular user messages
  const isMe = message.sender === "me";

  return (
    <div className={cn(
      "flex mb-2 animate-slide-in", // Reduced margin-bottom slightly
      isMe ? "justify-end" : "justify-start"
    )}>
      <div className={cn(
        "max-w-[75%] px-3 py-1.5 rounded-xl break-words shadow-sm", // Adjusted padding and roundedness
        isMe
          ? "bg-primary text-primary-foreground rounded-br-none"
          : "bg-secondary dark:bg-gray-700 text-secondary-foreground dark:text-gray-200 rounded-tl-none" // Adjusted background for dark mode
      )}>
        <div className="text-sm">{message.text}</div> {/* Explicitly set text size */}
        <div className={cn(
          "text-[10px] mt-0.5 text-right opacity-70", // Adjusted margin and opacity
           isMe ? "text-primary-foreground/70" : "text-muted-foreground"
        )}>
          {timestamp}
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;