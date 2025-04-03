// src/lib/supabase/server.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers'; // Import cookies from next/headers for server components/actions/routes

// Ensure these environment variables are defined in your .env.local or server environment
// DO NOT prefix server-side variables with NEXT_PUBLIC_
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!; // Re-use public URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Use Service Role for server actions if needed, or Anon Key

if (!supabaseUrl || !supabaseServiceRoleKey) { // Check for service key if you use it
    console.error("Supabase URL or Service Role Key is missing from server-side environment variables.");
    // Decide how to handle this - throw error or use Anon key as fallback?
    // For now, we might proceed assuming Anon key is sufficient if Service Role isn't strictly needed for these operations *with RLS*
    // throw new Error("Supabase server environment variables missing!");
}
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
     console.error("Supabase Anon Key missing. Server client might fail if Service Role key isn't used/available.");
}

// Note: Using the Service Role Key bypasses RLS. Be extremely careful.
// It's often better to use the Anon Key even on the server and rely on RLS,
// unless specific admin-level operations are needed.
// Let's default to using the ANON key for safety, matching the original direct client usage.
const keyToUse = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Function to create a server client instance within a request context
export const createSupabaseServerClient = () => {
    // Check if keys are present before creating client
    if (!supabaseUrl || !keyToUse) {
        throw new Error("Supabase URL or Anon Key missing for server client creation.");
    }

    const cookieStore = cookies(); // Get cookies within the server context

    return createServerClient(
        supabaseUrl,
        keyToUse, // Use Anon Key by default
        {
            cookies: {
                async get(name: string) {
                    const cookies = await cookieStore;
                    return cookies.get(name)?.value;
                },
                // Note: set/remove are needed if you perform auth actions (signIn, signOut)
                // For read/write operations with Anon key + RLS, they might not be strictly necessary,
                // but it's good practice to include them.
                async set(name: string, value: string, options: CookieOptions) {
                    try {
                        const cookies = await cookieStore;
                        cookies.set({ name, value, ...options });
                    } catch (error) {
                        // The `set` method was called from a Server Component.
                        // This can be ignored if you have middleware refreshing
                        // user sessions.
                    }
                },
                async remove(name: string, options: CookieOptions) {
                    try {
                        const cookies = await cookieStore;
                        cookies.set({ name, value: '', ...options });
                    } catch (error) {
                        // The `delete` method was called from a Server Component.
                        // This can be ignored if you have middleware refreshing
                        // user sessions.
                    }
                },
            },
        }
    );
};

// Optional: Function to create a client with the Service Role Key if needed
export const createSupabaseServiceRoleClient = () => {
    if (!supabaseUrl || !supabaseServiceRoleKey) {
        throw new Error("Supabase URL or Service Role Key missing for service client creation.");
    }
     // Service role client doesn't need cookies
    return createServerClient(supabaseUrl, supabaseServiceRoleKey, { cookies: {} as any }); // Cast cookies as any because it's not needed
}