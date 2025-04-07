import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/supabase';
import { v4 as uuidv4 } from 'uuid';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let clientInstance: ReturnType<typeof createBrowserClient<Database>> | null = null;

export const getSupabaseBrowserClient = () => {
    if (clientInstance) {
        return clientInstance;
    }
    if (!supabaseUrl || !supabaseAnonKey) {
        console.error("Supabase URL or Anon Key is missing client-side. App might not work correctly.");
        return {
            from: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
            channel: () => ({ subscribe: () => ({ unsubscribe: () => {} }), on: () => {}, track: async () => {}, untrack: async () => {}, send: async () => {} }),
            removeAllChannels: async () => {},
            rpc: async () => ({ data: null, error: new Error("Supabase client not configured") }),
            auth: {
                signInAnonymously: async () => ({ data: null, error: new Error("Supabase client not configured") }),
                getSession: () => null
            }
         } as any;
    }
    clientInstance = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
    return clientInstance;
};

// Initialize anonymous authentication session
export const initializeAnonymousAuth = async () => {
    const supabase = getSupabaseBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    // If no session exists, sign in anonymously
    if (!session) {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) {
            console.error("Error signing in anonymously:", error.message);
            return null;
        }
        return data.session;
    }
    
    return session;
};

// Get or create the user ID, now ensuring it's connected to Supabase Auth
export const getUserId = async (): Promise<string> => {
    // First, ensure we have an anonymous auth session
    const session = await initializeAnonymousAuth();
    
    if (session && session.user.id) {
        // If we have a session, use the Supabase user ID
        const supabaseUserId = session.user.id;
        
        // For backward compatibility, store in localStorage as well
        if (typeof window !== 'undefined') {
            localStorage.setItem('whimsyUserId', supabaseUserId);
        }
        
        return supabaseUserId;
    }
    
    // Fallback to localStorage if auth fails for some reason
    if (typeof window !== 'undefined') {
        let id = localStorage.getItem('whimsyUserId');
        if (!id) {
            id = uuidv4();
            localStorage.setItem('whimsyUserId', id);
        }
        return id;
    }
    
    // Final fallback
    return uuidv4();
};