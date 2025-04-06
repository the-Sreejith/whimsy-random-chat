-- ## ROW LEVEL SECURITY (RLS) POLICIES ##

-- ** Important **: RLS is critical for security in Supabase.
-- These are example policies. Review and adjust them based on your exact needs.
-- Assumes user identity is managed via a UUID passed from the client (e.g., from localStorage).
-- If using Supabase Auth, replace checks with `auth.uid()`. For this anonymous setup,
-- we might need a way to pass the claimed `user_id` securely, potentially via session or headers
-- if not directly in function calls. These policies assume the `user_id` is available contextually
-- or passed correctly. For direct DB access/Realtime, this usually means `auth.uid()`.
-- If NOT using Supabase Auth, RLS based on `auth.uid()` won't work directly for anonymous users.
-- You might need custom auth JWTs or pass the user_id explicitly and trust the RPC/API layer.
-- Let's assume for now we *are* using Supabase Auth to manage even anonymous sessions/UUIDs for simplicity with RLS.

-- ** Chat Rooms **
ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow read access to participants" ON public.chat_rooms;
-- Policy: Users can SELECT a room if they are a participant in it.
CREATE POLICY "Allow read access to participants" ON public.chat_rooms
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1
        FROM public.chat_participants cp
        WHERE cp.room_id = id AND cp.user_id = auth.uid() -- Assumes user_id is auth.uid()
      )
    );
-- Note: Creating rooms is handled by the RPC function. Direct inserts might be disabled.
-- DROP POLICY IF EXISTS "Allow insert for authenticated users" ON public.chat_rooms;
-- CREATE POLICY "Allow insert for authenticated users" ON public.chat_rooms
--     FOR INSERT
--     WITH CHECK (auth.role() = 'authenticated');


-- ** Chat Participants **
ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow participants to view their own participant entry" ON public.chat_participants;
DROP POLICY IF EXISTS "Allow participants to view others in the same room" ON public.chat_participants;
DROP POLICY IF EXISTS "Allow users to insert themselves into a room (via RPC)" ON public.chat_participants;
DROP POLICY IF EXISTS "Allow participants to delete their own entry (leave room)" ON public.chat_participants;

-- Policy: Users can SELECT their *own* participant record.
CREATE POLICY "Allow participants to view their own participant entry" ON public.chat_participants
    FOR SELECT
    USING (auth.uid() = user_id); -- Assumes user_id is auth.uid()

-- Policy: Users can SELECT *other* participants if they are in the same room.
CREATE POLICY "Allow participants to view others in the same room" ON public.chat_participants
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1
        FROM public.chat_participants cp_self
        WHERE cp_self.user_id = auth.uid() AND cp_self.room_id = chat_participants.room_id -- Assumes user_id is auth.uid()
      )
    );

-- Policy: Allow users to be inserted (primarily done safely via the RPC).
-- This needs to be open enough for the RPC function if it runs as SECURITY INVOKER.
-- If RPC is SECURITY DEFINER, it bypasses RLS. Let's assume INVOKER.
CREATE POLICY "Allow users to insert themselves into a room (via RPC)" ON public.chat_participants
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated'); -- Or `anon` if applicable

-- Policy: Allow users to DELETE their *own* participant record (to leave).
CREATE POLICY "Allow participants to delete their own entry (leave room)" ON public.chat_participants
    FOR DELETE
    USING (auth.uid() = user_id); -- Assumes user_id is auth.uid()


-- ** Chat Messages **
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow participants to read messages in their room" ON public.chat_messages;
DROP POLICY IF EXISTS "Allow participants to insert messages into their room" ON public.chat_messages;

-- Policy: Users can SELECT messages if they are a participant in that message's room.
CREATE POLICY "Allow participants to read messages in their room" ON public.chat_messages
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1
        FROM public.chat_participants cp
        WHERE cp.room_id = chat_messages.room_id AND cp.user_id = auth.uid() -- Assumes user_id is auth.uid()
      )
    );

-- Policy: Users can INSERT messages into a room they are currently participating in.
CREATE POLICY "Allow participants to insert messages into their room" ON public.chat_messages
    FOR INSERT
    WITH CHECK (
      sender_id = auth.uid() -- Assumes sender_id must match the authenticated user
      AND EXISTS (
        SELECT 1
        FROM public.chat_participants cp
        WHERE cp.room_id = chat_messages.room_id AND cp.user_id = auth.uid() -- Assumes user_id is auth.uid()
      )
    );


-- ** Realtime / Presence **
-- Supabase automatically manages Realtime based on SELECT permissions granted by RLS.
-- For Presence, Supabase needs permissions to track users. Usually, basic authenticated
-- access is sufficient, but ensure your RLS doesn't block Supabase internal mechanisms.
-- The standard `authenticated` role usually has enough permissions if granted SELECT on relevant tables.

-- Example for Heartbeat table (if used)
/*
ALTER TABLE public.active_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow users to update their own heartbeat" ON public.active_users;
DROP POLICY IF EXISTS "Allow all users to read active user count (via function)" ON public.active_users;

-- Allow users to upsert their own record (via heartbeat function)
-- Requires the heartbeat function to handle security or run as DEFINER.
CREATE POLICY "Allow users to update their own heartbeat" ON public.active_users
    FOR ALL -- Covers INSERT and UPDATE via ON CONFLICT
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Reading the count is often done via an RPC function (`count_active_users`)
-- Grant EXECUTE on that function instead of direct SELECT on the table.
GRANT EXECUTE ON FUNCTION public.count_active_users(INTERVAL) TO anon;
GRANT EXECUTE ON FUNCTION public.count_active_users(INTERVAL) TO authenticated;
-- Alternatively, allow direct reads if needed:
-- CREATE POLICY "Allow all users to read active user data" ON public.active_users
--    FOR SELECT
--    USING (true);
*/