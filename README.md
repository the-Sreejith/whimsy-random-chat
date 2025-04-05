# Whimsy random chat

This document outlines the backend setup for the Random Chat + Video Call App (Omegle Clone) project, using Supabase and Next.js.

## Overview

The backend provides the necessary database structure, real-time capabilities, and matchmaking logic to support the core features of the application:

-   Random user matchmaking.
-   Real-time text chat rooms.
-   Signaling infrastructure for WebRTC video calls.
-   Tracking active users (via Supabase Presence).
-   Anonymous user identification via UUIDs.

## Prerequisites

-   A Supabase project.
-   Node.js and npm/yarn installed.
-   Next.js 14+ project initialized.
-   Supabase CLI (optional but recommended for managing migrations).

## Setup

1.  **Supabase Project:** Create a new project on [Supabase](https://supabase.com/).
2.  **Environment Variables:**
    -   Copy `.env.local.example` to `.env.local`.
    -   Fill in your Supabase project URL and Anon Key from your Supabase project settings (API section).
    ```bash
    NEXT_PUBLIC_SUPABASE_URL="YOUR_SUPABASE_URL"
    NEXT_PUBLIC_SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY"
    ```
3.  **Database Migrations:**
    -   Navigate to the SQL Editor in your Supabase dashboard (Database -> SQL Editor).
    -   Execute the SQL scripts located in the `supabase/migrations/` directory in the specified order:
        1.  `0000_create_schema.sql` - Creates the necessary tables (`chat_rooms`, `chat_participants`, `chat_messages`).
        2.  `0001_create_rpc.sql` - Creates the `find_available_room` PostgreSQL function for matchmaking.
        3.  `0002_rls_policies.sql` - Sets up Row Level Security policies to control data access. **Review these policies carefully** to ensure they match your security requirements, especially regarding anonymous user identification (`auth.uid()` vs. manually passed UUIDs).
    -   *(Alternatively, use the Supabase CLI to apply these migrations).*
4.  **Supabase Realtime:**
    -   Ensure Realtime is enabled for the required tables (`chat_rooms`, `chat_participants`, `chat_messages`) in your Supabase dashboard (Database -> Replication). The `0000_create_schema.sql` script attempts to enable this via `ALTER TABLE ... REPLICA IDENTITY FULL` and managing the `supabase_realtime` publication, but verify in the UI.
5.  **Install Dependencies:** If you haven't already, install the necessary Supabase helper library for Next.js:
    ```bash
    npm install @supabase/ssr @supabase/supabase-js
    # or
    yarn add @supabase/ssr @supabase/supabase-js
    ```
6.  **Integrate Helper Files:**
    -   Place the `client.ts` and `server.ts` files into your Next.js project under `src/lib/supabase/`.
    -   Adjust the import path for `Database` types (`@/types/supabase`) if necessary. You can generate these types using the Supabase CLI: `npx supabase gen types typescript --project-id YOUR_PROJECT_REF --schema public > src/types/supabase.ts`.
7.  **(Optional) API Route:**
    -   Place the `report/route.ts` file under `src/app/api/` if you intend to implement the reporting feature via a Next.js API route. Remember to create the corresponding `reports` table (SQL commented out in the `route.ts` file and `0000_create_schema.sql`) if you use this.

## Backend Components

### 1. Database Schema (PostgreSQL)

-   **`chat_rooms`**: Stores basic information about each chat room.
    -   `id (uuid, PK)`
    -   `created_at (timestamptz)`
-   **`chat_participants`**: Links users (anonymous UUIDs) to chat rooms.
    -   `id (uuid, PK)`
    -   `room_id (uuid, FK -> chat_rooms)`
    -   `user_id (uuid)`
    -   `joined_at (timestamptz)`
-   **`chat_messages`**: Contains the text messages exchanged in a room.
    -   `id (uuid, PK)`
    -   `room_id (uuid, FK -> chat_rooms)`
    -   `sender_id (uuid)`
    -   `message (text)`
    -   `timestamp (timestamptz)`
    -   `is_system (boolean)`

### 2. Matchmaking RPC Function

-   **Function:** `public.find_available_room(requesting_user_id uuid)`
-   **Purpose:** Finds an available chat room with one participant or creates a new one for the requesting user.
-   **Input:** `requesting_user_id (uuid)` - The anonymous UUID of the user looking for a chat.
-   **Returns:** A record with `room_id (uuid)` and `other_user_id (uuid)`.
    -   If matched: Returns the `room_id` and the `user_id` of the partner.
    -   If no match found: Creates a new room, adds the user, and returns the new `room_id` and `NULL` for `other_user_id`.
-   **Concurrency:** Uses `FOR UPDATE SKIP LOCKED` to minimize race conditions where two users might try to join the same vacant room simultaneously.
-   **Calling from Frontend:**
    ```javascript
    // Assuming 'supabase' is your initialized Supabase client
    // and 'userId' is the anonymous UUID from localStorage
    const { data, error } = await supabase.rpc('find_available_room', {
      requesting_user_id: userId
    });

    if (error) {
      console.error('Matchmaking failed:', error);
    } else if (data) {
      const { room_id, other_user_id } = data;
      if (other_user_id) {
        // Matched! Start chat in room_id with other_user_id
      } else {
        // Waiting in new room (room_id)
      }
    }
    ```

### 3. Realtime (Supabase Channels & Presence)

-   **Chat & Signaling Channel:** `supabase.channel("room:{roomId}")`
    -   Used for broadcasting/receiving:
        -   `new_message` (chat messages)
        -   `partner_left` (disconnect notifications)
        -   `video-offer`, `video-answer`, `ice-candidate` (WebRTC signaling)
    -   Frontend clients subscribe to this channel upon entering a room. RLS policies ensure only participants of the specific `roomId` can subscribe and interact.
-   **Active Users Channel (Presence):** `supabase.channel('active-users', { config: { presence: { key: userId } } })`
    -   Uses Supabase's built-in Presence feature.
    -   Each connected client tracks their presence using their anonymous `userId`.
    -   The frontend subscribes to this channel to get real-time updates on the number of connected users.
    -   **How to get the count:**
        ```javascript
        const activeUsersChannel = supabase.channel('active-users', {
          config: { presence: { key: userId } }
        });

        activeUsersChannel
          .on('presence', { event: 'sync' }, () => {
            const presenceState = activeUsersChannel.presenceState();
            const userCount = Object.keys(presenceState).length;
            console.log('Users online:', userCount);
            // Update UI state with userCount
          })
          .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
              await activeUsersChannel.track({ online_at: new Date().toISOString() });
            }
          });

        // Remember to unsubscribe on component unmount or user disconnect
        // activeUsersChannel.unsubscribe();
        ```

### 4. Row Level Security (RLS)

-   Policies are defined in `0002_rls_policies.sql`.
-   They restrict access to data based on the user's identity (assumed to be `auth.uid()` if using Supabase Auth for anonymous users) and their participation in specific chat rooms.
-   **Crucial:** Ensure these policies correctly reflect how you manage anonymous user identity. If not using Supabase Auth sessions, you may need to adjust policies or handle authorization differently (e.g., using custom JWTs or validating user IDs within SECURITY DEFINER functions).

## Usage Notes

-   **Anonymous User ID:** The frontend is responsible for generating a UUID for each new user and storing it (e.g., in `localStorage`). This UUID (`userId`) must be passed to the backend (e.g., RPC calls, Presence tracking).
-   **WebRTC Signaling:** The backend provides the *transport* mechanism (Supabase Realtime) for WebRTC signaling messages (`offer`, `answer`, `ice-candidate`). The actual WebRTC peer connection logic resides entirely on the frontend.
-   **Disconnect:** When a user leaves, the frontend should:
    1.  Send a `partner_left` message on the `room:{roomId}` channel.
    2.  Unsubscribe from the room channel.
    3.  Potentially call an RPC or API to clean up the `chat_participants` entry (or rely on RLS allowing self-deletion).
    4.  Untrack presence from the `active-users` channel.
-   **Scalability:** For very high concurrency, review Supabase limits, consider optimizing RPC functions, and potentially offload complex logic to Edge Functions if needed. The current RPC uses `SKIP LOCKED` for basic concurrency control during matchmaking.