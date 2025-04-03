import React from "react";

const TypingIndicator = () => {
  return (
    // Adjusted styling for consistency
    <div className="flex items-center space-x-1 px-3 py-1.5 rounded-full bg-secondary dark:bg-gray-700 my-1 shadow-sm animate-fade-in">
      <div className="w-1.5 h-1.5 bg-muted-foreground/70 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
      <div className="w-1.5 h-1.5 bg-muted-foreground/70 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
      <div className="w-1.5 h-1.5 bg-muted-foreground/70 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
    </div>
  );
};

export default TypingIndicator;