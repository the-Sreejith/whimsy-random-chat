-- ## MATCHMAKING RPC FUNCTION ##

-- Define a return type for the function
-- DROP TYPE IF EXISTS matching_result; -- Uncomment if you need to modify the type
CREATE TYPE public.matching_result AS (
    room_id UUID,
    other_user_id UUID
);

-- The core matchmaking function
CREATE OR REPLACE FUNCTION public.find_available_room(requesting_user_id uuid)
RETURNS public.matching_result
LANGUAGE plpgsql
-- SECURITY INVOKER: Runs with privileges of the calling user (relies on RLS)
-- SECURITY DEFINER: Runs with privileges of the function owner (use if needing elevated perms, ensure security)
SECURITY INVOKER
AS $$
DECLARE
    found_room_id UUID;
    found_participant_id UUID;
    new_room_id UUID;
    participant_count INTEGER;
    result public.matching_result;
BEGIN
    -- Step 1: Try to find an existing room with exactly one participant
    --         who is NOT the requesting user.
    --         Use FOR UPDATE SKIP LOCKED to handle concurrency:
    --         Try to lock a row, if it's already locked by another transaction, skip it.
    SELECT cp.room_id, cp.user_id
    INTO found_room_id, found_participant_id
    FROM public.chat_participants cp
    JOIN public.chat_rooms cr ON cp.room_id = cr.id
    WHERE cp.room_id IN (
        -- Subquery to find rooms with exactly one participant
        SELECT room_id
        FROM public.chat_participants
        GROUP BY room_id
        HAVING COUNT(id) = 1
    )
    AND cp.user_id != requesting_user_id
    LIMIT 1
    FOR UPDATE SKIP LOCKED; -- Attempt to lock the participant row

    -- Step 2: If a suitable room is found and locked
    IF found_room_id IS NOT NULL THEN
        -- Add the requesting user to this room
        INSERT INTO public.chat_participants (room_id, user_id)
        VALUES (found_room_id, requesting_user_id);

        -- Set the result
        result.room_id := found_room_id;
        result.other_user_id := found_participant_id;

        RAISE LOG 'User % matched with user % in room %', requesting_user_id, found_participant_id, found_room_id;

    -- Step 3: If no suitable room is found, create a new one
    ELSE
        -- Create a new room
        INSERT INTO public.chat_rooms DEFAULT VALUES
        RETURNING id INTO new_room_id;

        -- Add the requesting user as the first participant
        INSERT INTO public.chat_participants (room_id, user_id)
        VALUES (new_room_id, requesting_user_id);

        -- Set the result (no other user yet)
        result.room_id := new_room_id;
        result.other_user_id := NULL;

        RAISE LOG 'User % created new room % and is waiting', requesting_user_id, new_room_id;
    END IF;

    -- Return the result (either the matched room or the new waiting room)
    RETURN result;

EXCEPTION
    WHEN OTHERS THEN
        -- Log any unexpected errors during matchmaking
        RAISE WARNING 'Matchmaking error for user %: %', requesting_user_id, SQLERRM;
        -- Return nulls or raise an exception depending on desired frontend handling
        result.room_id := NULL;
        result.other_user_id := NULL;
        RETURN result;
END;
$$;

-- Grant execute permission on the function to the relevant roles
GRANT EXECUTE ON FUNCTION public.find_available_room(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.find_available_room(uuid) TO authenticated;