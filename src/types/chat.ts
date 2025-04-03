export interface Message {
    id: string; // Unique ID for React keys, can be different from DB id
    text: string;
    sender: "me" | "stranger" | "system"; // Added "system" sender type
    timestamp: number; // Use number (milliseconds since epoch) for easier date handling
    system?: boolean; // Explicit flag for system messages
  }
  
  export type ChatStatus = "idle" | "searching" | "chatting" | "disconnected";