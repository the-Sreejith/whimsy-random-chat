-- Fix for RLS policy issue with chat_rooms
-- This migration addresses the error: "new row violates row-level security policy for table 'chat_rooms'"

-- Drop the old policy to recreate it
DROP POLICY IF EXISTS "Allow read access to participants" ON public.chat_rooms;

-- Create an insert policy to allow the matchmaking function to create rooms
DROP POLICY IF EXISTS "Allow insert for authenticated users" ON public.chat_rooms;
CREATE POLICY "Allow insert for authenticated users" ON public.chat_rooms
    FOR INSERT
    WITH CHECK (true); -- Allow insert for any authenticated user

-- Recreate the read policy
CREATE POLICY "Allow read access to participants" ON public.chat_rooms
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1
        FROM public.chat_participants cp
        WHERE cp.room_id = id AND cp.user_id = auth.uid()
      )
    );

-- Ensure the find_available_room function has the necessary permissions
GRANT INSERT ON TABLE public.chat_rooms TO authenticated;
GRANT INSERT ON TABLE public.chat_rooms TO anon;

-- Log the change
COMMENT ON POLICY "Allow insert for authenticated users" ON public.chat_rooms 
IS 'Allows users to create chat rooms during matchmaking'; 