-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ## CHAT ROOMS ##
CREATE TABLE public.chat_rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
COMMENT ON TABLE public.chat_rooms IS 'Stores active chat rooms.';

-- ## CHAT PARTICIPANTS ##
CREATE TABLE public.chat_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL, -- Represents the anonymous user UUID
    joined_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
COMMENT ON TABLE public.chat_participants IS 'Tracks users within chat rooms.';
-- Add indexes for frequent lookups
CREATE INDEX idx_chat_participants_room_id ON public.chat_participants(room_id);
CREATE INDEX idx_chat_participants_user_id ON public.chat_participants(user_id);
-- Ensure a user can only be in one room at a time (optional but good practice)
-- This might conflict if a user reconnects quickly before cleanup. Consider carefully.
-- CREATE UNIQUE INDEX idx_chat_participants_unique_user ON public.chat_participants(user_id);
-- Ensure a room cannot have more than 2 participants (can also be handled in RPC)
-- Constraint might be too strict during matchmaking phase. Handled in RPC logic.


-- ## CHAT MESSAGES ##
CREATE TABLE public.chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL, -- Anonymous user UUID
    message TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    is_system BOOLEAN DEFAULT FALSE -- For messages like "Partner disconnected"
);
COMMENT ON TABLE public.chat_messages IS 'Stores text messages for chat rooms.';
-- Add indexes for frequent lookups
CREATE INDEX idx_chat_messages_room_id_timestamp ON public.chat_messages(room_id, timestamp DESC);
CREATE INDEX idx_chat_messages_sender_id ON public.chat_messages(sender_id);


-- ## Optional: Active Users Heartbeat Table (Alternative to Presence) ##
-- Only use this if Supabase Presence doesn't scale or fit your needs.
/*
CREATE TABLE public.active_users (
    user_id UUID PRIMARY KEY,
    last_seen TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
COMMENT ON TABLE public.active_users IS 'Tracks recently active users via heartbeat.';
CREATE INDEX idx_active_users_last_seen ON public.active_users(last_seen DESC);

-- Function to update heartbeat or insert new user
CREATE OR REPLACE FUNCTION public.update_user_heartbeat(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER -- Use with caution, allows bypassing RLS for this specific action
AS $$
BEGIN
  INSERT INTO public.active_users (user_id, last_seen)
  VALUES (p_user_id, NOW())
  ON CONFLICT (user_id)
  DO UPDATE SET last_seen = NOW();
END;
$$;

-- Function or View to count active users
CREATE OR REPLACE FUNCTION public.count_active_users(p_interval INTERVAL DEFAULT '30 seconds')
RETURNS INTEGER
LANGUAGE sql
STABLE -- Indicates the function doesn't modify the database
AS $$
  SELECT COUNT(*)::INTEGER FROM public.active_users
  WHERE last_seen > NOW() - p_interval;
$$;
*/


-- Grant basic USAGE privilege for the anonymous role on the schema
-- Replace 'anon' if you use a different role for unauthenticated users
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON TABLE public.chat_rooms TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.chat_participants TO anon; -- Permissions will be restricted by RLS
GRANT SELECT, INSERT ON TABLE public.chat_messages TO anon; -- Permissions will be restricted by RLS

-- Grant permissions for authenticated role as well (if using Supabase Auth)
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON TABLE public.chat_rooms TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.chat_participants TO authenticated;
GRANT SELECT, INSERT ON TABLE public.chat_messages TO authenticated;


-- Enable Realtime for relevant tables
ALTER TABLE public.chat_rooms REPLICA IDENTITY FULL;
ALTER TABLE public.chat_participants REPLICA IDENTITY FULL;
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;

-- Drop existing publications if they exist
DROP PUBLICATION IF EXISTS supabase_realtime;

-- Create publication for all tables initially (you can refine this)
-- Supabase typically manages this, but explicitly defining can be helpful.
CREATE PUBLICATION supabase_realtime FOR ALL TABLES;

-- If you want finer control (recommended):
-- CREATE PUBLICATION supabase_realtime FOR TABLE
--   public.chat_messages,
--   public.chat_participants;
-- Add other tables as needed for Realtime events.

-- Note: Supabase Realtime UI might handle publication creation automatically.
-- Verify in your Supabase dashboard under Database -> Replication.