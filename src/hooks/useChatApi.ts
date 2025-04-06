import { toast } from "sonner";
import { ChatStatus } from "@/types/chat";

interface StartChatResponse {
    roomId: string;
    status: ChatStatus;
    partnerId?: string | null;
    message?: string;
}

interface NextChatResponse {
    roomId: string;
    status: ChatStatus;
    partnerId?: string | null;
    message?: string;
}

interface GenericResponse {
    success: boolean;
    message?: string;
    error?: string;
}

const fetchApi = async <T>(endpoint: string, body: any, method: string = 'POST'): Promise<T> => {
    const response = await fetch(`/api/chat${endpoint}`, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        let errorData;
        try {
            errorData = await response.json();
        } catch (e) {
            errorData = { message: `HTTP error! status: ${response.status}` };
        }
        console.error(`API Error (${endpoint}):`, errorData);
        throw new Error(errorData?.message || `HTTP error! status: ${response.status}`);
    }
    // Handle cases where the response might be empty (e.g., 204 No Content)
     if (response.status === 204) {
        return {} as T; // Return an empty object or adjust as needed
     }
    return response.json() as Promise<T>;
};


export const startChatApi = async (userId: string): Promise<StartChatResponse> => {
    try {
        return await fetchApi<StartChatResponse>('/start', { userId });
    } catch (error: any) {
        // Toast is handled in useChat hook now
        throw error;
    }
};

export const sendMessageApi = async (roomId: string, userId: string, text: string): Promise<GenericResponse> => {
     try {
        return await fetchApi<GenericResponse>('/message', { roomId, userId, text });
    } catch (error: any) {
        // Toast is handled in useChat hook now
        throw error;
    }
};

export const nextChatApi = async (userId: string, currentRoomId: string | null): Promise<NextChatResponse> => {
    try {
        return await fetchApi<NextChatResponse>('/next', { userId, currentRoomId });
    } catch (error: any) {
        // Toast is handled in useChat hook now
        throw error;
    }
};

export const leaveChatApi = async (roomId: string, userId: string): Promise<GenericResponse> => {
     try {
        return await fetchApi<GenericResponse>('/leave', { roomId, userId });
    } catch (error: any) {
        console.error("Error notifying backend on leaveChat:", error);
        // Don't show toast, user initiated. Optional: re-throw.
        // throw error;
         return { success: false, message: (error as Error).message }; // Return error info
    }
};