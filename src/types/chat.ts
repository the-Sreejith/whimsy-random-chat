export interface Message {
  id: string;
  text: string;
  sender: "me" | "stranger" | "system";
  timestamp: number;
  system?: boolean;
}

export type ChatStatus = "idle" | "connecting" | "waiting" | "chatting" | "disconnected" | "error";

export interface SignalingMessage {
  type: 'video-offer' | 'video-answer' | 'ice-candidate' | 'bye';
  sender: string;
  target: string;
  payload: any; // Contains SDP or ICE candidate data
}