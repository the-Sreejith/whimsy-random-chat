import { Message } from "@/types/chat";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface ChatMessageProps {
  message: Message;
}

const ChatMessage = ({ message }: ChatMessageProps) => {
  const timestamp = message.timestamp && !isNaN(message.timestamp)
    ? format(new Date(message.timestamp), "HH:mm")
    : '--:--';

  if (message.system) {
    return (
      <div className="flex justify-center my-2 animate-fade-in">
        <div className="px-4 py-1 text-xs italic text-center text-muted-foreground bg-muted/30 rounded-full">
          {message.text} ({timestamp})
        </div>
      </div>
    );
  }

  const isMe = message.sender === "me";

  return (
    <div className={cn(
      "flex mb-2 animate-slide-in",
      isMe ? "justify-end" : "justify-start"
    )}>
      <div className={cn(
        "max-w-[75%] px-3 py-1.5 rounded-xl break-words shadow-sm",
        isMe
          ? "bg-primary text-primary-foreground rounded-br-none"
          : "bg-secondary dark:bg-gray-700 text-secondary-foreground dark:text-gray-200 rounded-tl-none"
      )}>
        <div className="text-sm">{message.text}</div>
        <div className={cn(
          "text-[10px] mt-0.5 text-right opacity-70",
           isMe ? "text-primary-foreground/70" : "text-muted-foreground"
        )}>
          {timestamp}
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;