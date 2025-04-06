import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/supabase';

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
            auth: {}
         } as any;
    }
    clientInstance = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
    return clientInstance;
};