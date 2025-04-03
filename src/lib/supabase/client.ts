// src/lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr';

// Ensure these environment variables are correctly defined in your .env.local
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("Supabase URL or Anon Key is missing from client-side environment variables. Realtime features may fail.");
    // You might throw an error here depending on how critical Supabase is at load time
    // throw new Error("Supabase client environment variables missing!");
}

// Create a singleton client instance (optional, but good practice)
// We need the browser client for real-time subscriptions in hooks
let clientInstance: ReturnType<typeof createBrowserClient> | null = null;

export const getSupabaseBrowserClient = () => {
    if (clientInstance) {
        return clientInstance;
    }
    if (supabaseUrl && supabaseAnonKey) {
         clientInstance = createBrowserClient(supabaseUrl, supabaseAnonKey);
         return clientInstance;
    }
    // Return a dummy or throw error if env vars are missing
    console.error("Cannot create Supabase browser client due to missing env vars.");
     // Return a minimal object or null to prevent hard crashes, but log the error
     return {
        from: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }), // Mock essential methods
        channel: () => ({ subscribe: () => ({ unsubscribe: () => {} }), on: () => {} , track: () => {}, untrack: () => {} }), // Mock channel methods
        removeAllChannels: async () => {},
        auth: {} // Mock auth if needed
     } as any; // Cast to avoid type errors everywhere, but be aware it's non-functional
};