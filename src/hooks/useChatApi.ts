import { toast } from "sonner";

// Define interfaces for API responses for better type safety
interface StartChatResponse {
    roomId: string;
    status: 'searching' | 'chatting';
    message?: string; // Optional initial message from backend
}

interface NextChatResponse {
    roomId: string;
    status: 'searching' | 'chatting';
    message?: string; // Optional initial message from backend
}

// API fetch helper
const fetchApi = async <T>(endpoint: string, body: any, method: string = 'POST'): Promise<T> => {
    const response = await fetch(`/api/chat${endpoint}`, { // Use relative path
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
    return response.json() as Promise<T>;
};


export const startChatApi = async (userId: string): Promise<StartChatResponse> => {
    try {
        return await fetchApi<StartChatResponse>('/start', { userId });
    } catch (error: any) {
        toast.error("Failed to start chat", { description: error.message });
        throw error; // Re-throw to be handled by the caller hook
    }
};

export const sendMessageApi = async (roomId: string, userId: string, text: string): Promise<void> => {
     try {
        // Assuming the message API doesn't return significant data on success
        await fetchApi<void>('/message', { roomId, userId, text });
    } catch (error: any) {
        toast.error("Failed to send message", { description: error.message });
        throw error; // Re-throw to be handled by the caller hook
    }
};

export const nextChatApi = async (userId: string, currentRoomId: string | null): Promise<NextChatResponse> => {
    try {
        return await fetchApi<NextChatResponse>('/next', { userId, currentRoomId });
    } catch (error: any) {
        toast.error("Failed to find next chat", { description: error.message });
        throw error; // Re-throw to be handled by the caller hook
    }
};

export const leaveChatApi = async (roomId: string, userId: string): Promise<void> => {
     try {
        // Assuming the leave API doesn't return significant data on success
        await fetchApi<void>('/leave', { roomId, userId });
    } catch (error: any) {
        // Don't necessarily show a toast here, as the user initiated the leave.
        // Log the error for debugging.
        console.error("Error notifying backend on leaveChat:", error);
        // We might not need to re-throw if the primary goal was cleanup.
        // throw error; // Optional: re-throw if the caller needs to know about the failure
    }
};