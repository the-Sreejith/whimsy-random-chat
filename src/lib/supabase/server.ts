import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/supabase';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const keyToUse = supabaseAnonKey;

export const createSupabaseServerClient = () => {
    if (!supabaseUrl || !keyToUse) {
        throw new Error("Supabase URL or Anon Key missing for server client creation.");
    }

    const cookieStore = cookies();

    return createServerClient<Database>(
        supabaseUrl,
        keyToUse,
        {
            cookies: {
                async get(name: string) {
                    return (await cookieStore).get(name)?.value;
                },
                async set(name: string, value: string, options: CookieOptions) {
                    try {
                        (await cookieStore).set({ name, value, ...options });
                    } catch (error) {}
                },
                async remove(name: string, options: CookieOptions) {
                    try {
                        (await cookieStore).set({ name, value: '', ...options });
                    } catch (error) {}
                },
            },
        }
    );
};

export const createSupabaseServiceRoleClient = () => {
    if (!supabaseUrl || !supabaseServiceRoleKey) {
        console.warn("Attempted to create Service Role client, but key is missing. Falling back to Anon key.");
         return createSupabaseServerClient(); // Fallback to anon client
        // Or throw: throw new Error("Supabase URL or Service Role Key missing.");
    }
    return createServerClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
        cookies: {} as any, // Service role doesn't need cookies
         auth: {
             persistSession: false, // Don't persist session for service role
             autoRefreshToken: false, // No need to refresh
         }
    });
}