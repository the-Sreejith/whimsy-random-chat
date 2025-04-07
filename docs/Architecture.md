Okay, let's break down the architecture of the "Whimsy" random chat application based on the provided files.

## 1. High-Level Overview

Whimsy is a web application designed to mimic Omegle's core functionality: connecting anonymous users randomly for text and video chat. It leverages Next.js for the frontend framework and Supabase as the primary backend-as-a-service (BaaS) provider for database, real-time communication, and matchmaking logic.

**Core Features:**

*   **Anonymity:** Users interact via temporary UUIDs stored locally, no login required.
*   **Random Matchmaking:** Connects users looking for a chat partner.
*   **Real-time Text Chat:** Instant messaging within a private room.
*   **WebRTC Video Calls:** Peer-to-peer video streaming initiated within the chat.
*   **Active User Count:** Displays the number of currently online users.
*   **Disconnect/Next:** Allows users to easily leave a chat and find a new partner.

## 2. Core Technologies

*   **Frontend:**
    *   Framework: Next.js 14+ (App Router)
    *   UI Components: shadcn/ui, Tailwind CSS
    *   State Management: React Hooks (`useState`, `useEffect`, `useRef`), Custom Hooks (`useChat`, `useWebRTC`)
    *   Real-time Client: `@supabase/supabase-js`, `@supabase/ssr`
    *   Video: Native WebRTC APIs
    *   Utils: `uuid`, `date-fns`, `clsx`, `tailwind-merge`, `sonner` (toasts)
*   **Backend (Supabase):**
    *   Database: PostgreSQL
    *   Realtime: Supabase Realtime (Channels, Broadcast, Presence, Postgres Changes)
    *   Functions: PostgreSQL RPC (`find_available_room`)
    *   Security: Row Level Security (RLS)
*   **API Layer:**
    *   Next.js API Routes (for server-side actions like message sending, leaving rooms, starting/finding next chat)

## 3. Architectural Flow (Conceptual)

```
+---------------------+      +------------------------+      +-----------------------+
|    User's Browser   |      |   Next.js Server/API   |      |       Supabase        |
| (Next.js Frontend)  |<----->|      (API Routes)      |<----->| (DB, Realtime, RPC)   |
+---------------------+      +------------------------+      +-----------------------+
       |     ^                      |         ^                      |        ^
       |     |                      |         |                      |        |
 (1) Load App & Get UUID            |         |                      |        |
       |     |                      |         |                      |        |
 (2) Click "Start Chat" ---------> API /start |                      |        |
       |     |                      |-------->| Call RPC find_available_room |
       |     |                      |<--------| Return room/partner   |        |
       |<----| Return room/partner  |         |                      |        |
       |     |                      |         |                      |        |
 (3) Subscribe Realtime Channel <------------------------------------> Realtime Channel (Room)
       |     |                      |         |                      |        |
 (4) Send Message ----------------> API /message|                      |        |
       |     |                      |-------->| Insert into DB        |        |
       |     |                      |<--------| Ack                   |        |
       |<----| Ack (Local Update)   |         |                      |        |
       |     |                      |         |<----------------------| DB Change -> Realtime Event
       |<-------------------------------------------------------------| Receive Realtime Message
       |     |                      |         |                      |        |
 (5) Start Video Call               |         |                      |        |
       |---> Get Local Media        |         |                      |        |
       |---> Send Offer (via Realtime Broadcast)--------------------->| Realtime Broadcast
       |<-------------------------------------------------------------| Receive Answer/Candidate (Broadcast)
       |---> Establish P2P          |         |                      |        |
       |     |                      |         |                      |        |
 (6) Track Presence <------------------------------------------------> Realtime Channel (Presence)
       |     |                      |         |                      |        |
 (7) Click "Next" -----------------> API /next |                      |        |
       |     |                      |-------->| Leave Room (DB Op)    |        |
       |     |                      |-------->| Call RPC find_available_room |
       |     |                      |<--------| Return new room/partner|        |
       |<----| Return new room/partner|         |                      |        |
```

## 4. Key Components Deep Dive

### 4.1. Frontend (`src/`)

*   **`app/layout.tsx` & `app/page.tsx`:** Sets up the main page structure, including the header with the `ActiveUserCount` component and embeds the `ChatInterface`.
*   **`components/ChatInterface.tsx`:** The core UI component.
    *   Manages the overall chat state display (idle, searching, chatting, disconnected).
    *   Renders messages using `ChatMessage`.
    *   Displays typing indicators (`TypingIndicator`).
    *   Handles user input for sending messages.
    *   Provides buttons for "Start Chat", "Next", "End", "Start/Stop Video".
    *   Integrates `VideoPlayer` components for local and remote streams.
    *   Uses the `useChat` and `useWebRTC` hooks to manage logic and state.
*   **`components/ChatMessage.tsx`:** Renders individual chat messages with appropriate styling for "me", "stranger", or "system" messages.
*   **`components/VideoPlayer.tsx`:** A simple component to display a `MediaStream` in a `<video>` element.
*   **`components/ActiveUserCount.tsx`:** Subscribes to the Supabase 'active-users' presence channel to display the real-time count of online users.
*   **`hooks/useChat.ts`:**
    *   Manages the core chat lifecycle state (`status`, `roomId`, `partnerId`, `messages`).
    *   Generates/retrieves the anonymous `userId` from `localStorage`.
    *   Interacts with `useChatApi.ts` to call Next.js API routes (`/start`, `/message`, `/next`, `/leave`).
    *   Integrates `useChatRealtime.ts` to handle incoming messages, presence updates (typing), partner join/leave events, and signaling messages.
    *   Provides functions (`startChat`, `sendMessage`, `sendTyping`, `nextChat`, `endChat`, `sendSignalingMessage`) for the `ChatInterface` component.
*   **`hooks/useWebRTC.ts`:**
    *   Manages the WebRTC connection lifecycle (`localStream`, `remoteStream`, `isWebRTCActive`).
    *   Handles `getUserMedia` to access camera/microphone.
    *   Creates and manages the `RTCPeerConnection`.
    *   Implements the signaling logic: creates offers/answers, handles ICE candidates.
    *   Uses the `sendSignal` prop (passed from `useChat`) to send signaling messages via Supabase Realtime.
    *   Listens for incoming signaling messages dispatched as custom window events from `useChat`.
    *   Cleans up connections and streams.
*   **`hooks/useChatRealtime.ts`:**
    *   Establishes and manages the Supabase Realtime channel subscription for the specific `roomId`.
    *   Listens for:
        *   `postgres_changes` on `chat_messages` (for new messages).
        *   `postgres_changes` on `chat_participants` (to detect partner join/leave).
        *   `presence` events (for typing indicators).
        *   `broadcast` events (specifically `event: 'signal'`) for WebRTC signaling.
    *   Provides functions (`sendTypingPresence`, `sendSignalingMessage`) to send data over the channel.
    *   Calls callback functions provided by `useChat` (`onNewMessage`, `onPartnerJoined`, etc.) when events occur.
    *   Handles subscription setup and cleanup.
*   **`hooks/useChatApi.ts`:** A utility hook that abstracts `fetch` calls to the Next.js API routes (`/api/chat/*`). Handles basic error formatting but delegates primary error handling (e.g., toasts) to `useChat`.
*   **`lib/supabase/client.ts`:** Creates and manages a singleton Supabase client instance for use in browser components.
*   **`lib/utils.ts`:** Standard utility functions (like `cn` for Tailwind class merging).
*   **`types/chat.ts` & `types/supabase.ts`:** TypeScript definitions for chat-related data structures and the auto-generated Supabase schema types.

### 4.2. Backend (Supabase)

*   **Database Schema (`supabase/migrations/0000_create_schema.sql`):**
    *   `chat_rooms`: Stores basic room information (ID, creation time).
    *   `chat_participants`: Links `user_id` (anonymous UUID) to `room_id`. Crucial for tracking who is in which room.
    *   `chat_messages`: Stores individual text messages, linked to `room_id` and `sender_id`. Includes `is_system` flag for non-user messages.
*   **Matchmaking Function (`supabase/migrations/0001_create_rpc.sql`):**
    *   `find_available_room(requesting_user_id uuid)`: A PostgreSQL function callable via RPC.
    *   **Logic:**
        1.  Tries to find a `chat_room` with exactly one participant (who is not the `requesting_user_id`). Uses `FOR UPDATE SKIP LOCKED` to prevent race conditions where two users might grab the same empty room simultaneously.
        2.  If found, adds the `requesting_user_id` to that room and returns the `room_id` and the `other_user_id`.
        3.  If not found, creates a *new* `chat_room`, adds the `requesting_user_id` as the first participant, and returns the new `room_id` with `other_user_id` as `NULL`.
*   **Realtime:**
    *   Enabled on `chat_messages` and `chat_participants` tables.
    *   **Room Channel (`room:{roomId}`):** Used for multiple purposes:
        *   Receiving new messages (via `postgres_changes` on `chat_messages`).
        *   Detecting partner join/leave (via `postgres_changes` on `chat_participants`).
        *   Tracking typing status (via `presence`).
        *   Broadcasting/receiving WebRTC signaling messages (via `broadcast`, event type `signal`).
    *   **Presence Channel (`active-users`):** Uses Supabase Presence. Each client tracks their `userId`. The `ActiveUserCount` component subscribes to this channel and uses `presenceState()` on `sync` events to get the count of unique keys (users).
*   **Row Level Security (`supabase/migrations/0002_rls_policies.sql`):**
    *   Policies restrict data access based on user identity (assumed to be `auth.uid()`, which implies using Supabase's anonymous authentication might be needed for RLS to work seamlessly with the anonymous UUIDs).
    *   **Examples:**
        *   Users can only read messages (`chat_messages`) from rooms they are participants in.
        *   Users can only insert messages (`chat_messages`) into rooms they are participants in, and the `sender_id` must match their own ID.
        *   Users can only view participant (`chat_participants`) entries for rooms they are in.
        *   Users can delete their *own* participant entry (to leave a room).
    *   **Note:** The RPC function `find_available_room` runs as `SECURITY INVOKER`, meaning it runs with the permissions of the calling user, respecting RLS.

### 4.3. API Routes (`src/app/api/`)

These Next.js routes handle actions that benefit from server-side execution or abstraction. They use `createSupabaseServerClient` to interact with Supabase securely.

*   **`/api/chat/start`:**
    *   Receives the `userId`.
    *   Calls the `find_available_room` RPC function.
    *   Adds initial system messages ("Waiting..." or "User joined...").
    *   Returns the `roomId`, `partnerId` (if matched), and `status` (`searching` or `chatting`).
*   **`/api/chat/message`:**
    *   Receives `roomId`, `userId`, `text`.
    *   Validates input.
    *   Inserts the message into the `chat_messages` table. RLS ensures the user is allowed to post in that room.
    *   Returns success/failure. (Realtime notifies clients of the new message).
*   **`/api/chat/next`:**
    *   Receives `userId` and optional `currentRoomId`.
    *   If `currentRoomId` exists, calls a helper (`removeUserFromRoom`) to delete the user's entry from `chat_participants` for that room (and potentially cleans up the room/messages if empty).
    *   Calls the `find_available_room` RPC function to get a new match/room.
    *   Adds initial system messages for the new room.
    *   Returns the new `roomId`, `partnerId`, and `status`.
*   **`/api/chat/leave`:**
    *   Receives `roomId`, `userId`.
    *   Calls the helper (`removeUserFromRoom`) to delete the user from `chat_participants` and potentially clean up.
    *   Returns success/failure. (Realtime notifies the partner via the `postgres_changes` event on `chat_participants`).
*   **`/api/report` (Optional):**
    *   Receives report details (`reported_user_id`, `reason`, `room_id`).
    *   Currently logs the report. Intended to insert into a `reports` table (schema commented out).

### 4.4. User Identity

*   A UUID is generated client-side using the `uuid` library when a user first visits.
*   It's stored in `localStorage` under the key `whimsyUserId`.
*   This `userId` is passed in API calls and used as the key for Supabase Presence tracking.
*   **Important:** RLS policies in `0002_rls_policies.sql` assume this ID corresponds to `auth.uid()`. For this to work correctly without actual user logins, Supabase's anonymous sign-in feature should likely be enabled (`supabase.auth.signInAnonymously()`) so that Supabase manages the session and `auth.uid()` returns the persistent anonymous user ID. If not using Supabase Auth, RLS needs significant adjustments, or security relies more heavily on the API layer validating the passed `userId`.

## 5. User Flows with Code Snippets

### 5.1. Initial Load & User ID

1.  **User opens the app.**
2.  **`useChat` Hook (`useEffect`):** Checks `localStorage` for `whimsyUserId`. If not found, generates a new UUID and stores it. Sets the `userId` state.
    ```typescript
    // src/hooks/useChat.ts
    useEffect(() => {
        if (typeof window !== 'undefined') {
            let id = localStorage.getItem('whimsyUserId');
            if (!id) {
                id = uuidv4();
                localStorage.setItem('whimsyUserId', id);
            }
            setUserId(id);
            // Consider Supabase anonymous auth here:
            // supabase.auth.getSession().then(({ data: { session } }) => {
            //   if (!session || session.user.is_anonymous) {
            //      supabase.auth.signInAnonymously({ data: { client_uuid: id } }); // Link if needed
            //   }
            // });
        }
    }, []);
    ```
3.  **`ActiveUserCount` Component:** Gets the `userId`, connects to the `active-users` presence channel, and starts tracking.
    ```typescript
    // src/components/ActiveUserCount.tsx
    useEffect(() => {
        // ... setup channel ...
        channel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await channel.track({ online_at: new Date().toISOString() });
                handleSync(); // Get initial count
            }
        });
        // ... event listeners for sync/join/leave ...
    }, [supabase, userId]);
    ```
4.  **UI:** Shows the initial screen ("Welcome to Whimsy", "Start Chatting" button) via `ChatInterface`.

### 5.2. Starting a Chat (Matchmaking)

1.  **User clicks "Start Chatting".**
2.  **`ChatInterface`:** Calls `startChat` from `useChat`.
3.  **`useChat.startChat`:**
    *   Sets status to `"searching"`.
    *   Clears previous messages, `roomId`, `partnerId`.
    *   Adds "Looking for someone..." system message.
    *   Calls `ChatApi.startChatApi(userId)`.
    ```typescript
    // src/hooks/useChat.ts
    const startChat = useCallback(async () => {
        // ... checks ...
        setStatus("searching");
        addSystemMessage("Looking for someone to chat with...");
        try {
            const data = await ChatApi.startChatApi(userId); // Calls API
            setRoomId(data.roomId);
            setStatus(data.status);
            // ... handle partnerId and messages ...
        } catch (error: any) { /* ... handle error ... */ }
    }, [userId, status, addSystemMessage]);
    ```
4.  **`ChatApi.startChatApi`:** Makes a POST request to `/api/chat/start`.
    ```typescript
    // src/hooks/useChatApi.ts
    export const startChatApi = async (userId: string): Promise<StartChatResponse> => {
        return await fetchApi<StartChatResponse>('/start', { userId });
    };
    ```
5.  **`/api/chat/start` Route:**
    *   Receives `userId`.
    *   Calls `supabase.rpc('find_available_room', { requesting_user_id: userId })`.
    ```sql
    -- supabase/migrations/0001_create_rpc.sql (Illustrative Logic)
    -- SELECT ... FROM chat_participants WHERE COUNT(id) = 1 ... FOR UPDATE SKIP LOCKED;
    -- IF found THEN INSERT requesting_user_id; RETURN room_id, other_user_id;
    -- ELSE INSERT new room; INSERT requesting_user_id; RETURN new_room_id, NULL;
    -- END IF;
    ```
    *   Inserts system messages based on the result (e.g., "Waiting..." or "User joined...").
    *   Returns `{ roomId, partnerId, status }`.
6.  **`useChat.startChat` (Callback):** Receives the response, updates `roomId`, `partnerId`, `status`.
7.  **`useChatRealtime` Hook (`useEffect`):** Detects the new `roomId`, cleans up old subscriptions (if any), and subscribes to the new `room:{roomId}` channel.
    ```typescript
    // src/hooks/useChatRealtime.ts
    useEffect(() => {
        if (!roomId || !supabase || !userId) {
            cleanupSubscriptions(); // Unsubscribe from previous room
            return;
        }
        // ... setup new channel for roomId ...
        mainChannel.current = supabase.channel(`room:${roomId}`, { /* config */ });
        // ... setup listeners (postgres_changes, presence, broadcast) ...
        mainChannel.current.subscribe(/* ... */);
        // ... return cleanup function ...
    }, [roomId, userId, supabase /* ... */]);
    ```
8.  **UI (`ChatInterface`):** Updates to show "Searching..." or the chat view if immediately matched.

### 5.3. Sending/Receiving Messages

1.  **User types and clicks Send (or presses Enter).**
2.  **`ChatInterface`:** Calls `sendMessage` from `useChat`.
3.  **`useChat.sendMessage`:**
    *   Adds the message locally with sender "me" (`addMessage`).
    *   Calls `ChatApi.sendMessageApi(roomId, userId, text)`.
    *   Sends `typing: false` presence update via `sendTypingPresence`.
4.  **`ChatApi.sendMessageApi`:** Makes a POST request to `/api/chat/message`.
5.  **`/api/chat/message` Route:**
    *   Receives `roomId`, `userId`, `text`.
    *   Inserts into `chat_messages` table. RLS verifies the user is in the room.
    ```typescript
    // src/app/api/chat/message/route.ts
    const { error } = await supabase
        .from('chat_messages')
        .insert({ room_id: roomId, sender_id: userId, message: text.trim(), is_system: false });
    ```
    *   Returns success.
6.  **Realtime (Partner's Client):**
    *   Supabase detects the INSERT on `chat_messages`.
    *   Sends a `postgres_changes` event to the partner's subscribed `room:{roomId}` channel.
    *   **Partner's `useChatRealtime`:** Receives the event.
    ```typescript
    // src/hooks/useChatRealtime.ts
    mainChannel.current.on<ChatMessagePayload>(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}` },
        (payload) => {
            const newMessage = payload.new as ChatMessagePayload;
            if (newMessage && newMessage.sender_id !== userId) { // Check it's not own message
                onNewMessage(newMessage.message ?? '', "stranger", newMessage.id, /* timestamp */);
            }
        }
    )
    ```
    *   Calls `onNewMessage` callback provided by `useChat`.
7.  **Partner's `useChat`:** The `handleNewMessage` callback calls `addMessage` to update the message list.
8.  **Partner's UI (`ChatInterface`):** Renders the new message.

### 5.4. Starting/Stopping Video Call (WebRTC Signaling)

1.  **User A clicks "Start Video".**
2.  **`ChatInterface`:** Calls `startVideoCall` from `useWebRTC`.
3.  **`useWebRTC.startVideoCall`:**
    *   Calls `navigator.mediaDevices.getUserMedia`.
    *   On success, sets `localStream` and `isWebRTCActive`.
4.  **`useWebRTC` Hook (`useEffect` watching `localStream`):**
    *   Initializes `RTCPeerConnection` (`initializePeerConnection`).
    *   Adds local tracks to the connection.
    *   Sets up `onicecandidate`, `ontrack` handlers.
    *   If User A is the designated initiator (e.g., `userId < partnerId`), creates an SDP offer.
    ```typescript
    // src/hooks/useWebRTC.ts
    peerConnection.current?.createOffer()
        .then(offer => peerConnection.current?.setLocalDescription(offer))
        .then(() => {
            if (peerConnection.current?.localDescription) {
                sendSignal({ // Prop function from useChat
                    type: 'video-offer',
                    payload: { sdp: peerConnection.current.localDescription },
                });
            }
        });
    ```
5.  **`useWebRTC.sendSignal` -> `useChat.sendSignalingMessage`:**
    *   Constructs the full `SignalingMessage` object (adding `sender` and `target`).
    *   Calls `sendSignalViaRealtime` (from `useChatRealtime`).
    ```typescript
    // src/hooks/useChat.ts
     const sendSignalingMessage = useCallback(async (payload: Omit<SignalingMessage, 'sender'>) => {
        if (!roomId || !partnerId || !userId) return;
        const message: SignalingMessage = { ...payload, sender: userId, target: partnerId };
        await sendSignalViaRealtime(message); // Function from useChatRealtime
     }, [roomId, partnerId, userId, sendSignalViaRealtime]);
    ```
6.  **`useChatRealtime.sendSignalingMessage`:** Sends a broadcast message over the Supabase channel.
    ```typescript
    // src/hooks/useChatRealtime.ts
    const status = await mainChannel.current.send({
        type: 'broadcast',
        event: 'signal', // Custom event name
        payload: payload, // The SignalingMessage object
    });
    ```
7.  **User B's `useChatRealtime`:** Receives the broadcast event.
    ```typescript
    // src/hooks/useChatRealtime.ts
    const handleIncomingBroadcast = (event: { type: string, payload: any }) => {
         if (event.type === 'signal') { // Check our custom event name
             onSignalingMessage(event.payload as SignalingMessage); // Callback to useChat
         }
    };
    mainChannel.current.on('broadcast', { event: 'signal' }, handleIncomingBroadcast);
    ```
8.  **User B's `useChat.handleSignalingMessage`:** Checks if the message `target` matches their `userId`, then dispatches a custom window event.
    ```typescript
    // src/hooks/useChat.ts
    const handleSignalingMessage = useCallback((payload: SignalingMessage) => {
       if (payload.target !== userId) return;
       const event = new CustomEvent('webrtc-signal', { detail: payload });
       window.dispatchEvent(event);
    }, [userId]);
    ```
9.  **User B's `useWebRTC` (`useEffect` listening for `webrtc-signal` event):**
    *   Calls `receivedSignal` handler.
    *   **`useWebRTC.receivedSignal` (Offer Case):**
        *   If needed, calls `startVideoCall` to get local media first.
        *   Initializes its own `RTCPeerConnection`.
        *   Sets the received offer as the remote description (`setRemoteDescription`).
        *   Creates an answer (`createAnswer`).
        *   Sets the answer as the local description (`setLocalDescription`).
        *   Sends the answer back to User A using the same `sendSignal` -> Supabase Broadcast flow.
10. **ICE Candidate Exchange:** Both users' `onicecandidate` handlers fire, sending `ice-candidate` signals via Supabase Broadcast. The receiving `useWebRTC` adds them using `addIceCandidate`.
11. **Connection Established:** `ontrack` handlers fire in both clients when remote media arrives, setting the `remoteStream` state.
12. **UI (`ChatInterface` -> `VideoPlayer`):** Renders the local and remote video streams.
13. **Stopping:** User clicks "Stop Video" -> `ChatInterface` calls `stopVideoCall` -> `useWebRTC.stopVideoCall` calls `cleanupConnection` (closes PC, stops tracks).

### 5.5. Finding the Next Chat Partner

1.  **User clicks "Next".**
2.  **`ChatInterface`:** Calls `nextChat` from `useChat`.
3.  **`useChat.nextChat`:**
    *   Sets status to `"searching"`.
    *   Adds "Finding new partner..." system message.
    *   Calls `ChatApi.nextChatApi(userId, previousRoomId)`.
4.  **`ChatApi.nextChatApi`:** Makes POST request to `/api/chat/next`.
5.  **`/api/chat/next` Route:**
    *   Calls helper `removeUserFromRoom(supabase, currentRoomId, userId)` (Deletes from `chat_participants`).
    *   Calls helper `findOrCreateRoomForUser(supabase, userId)` (which calls the `find_available_room` RPC).
    *   Returns new `{ roomId, partnerId, status }`.
6.  **`useChat.nextChat` (Callback):** Receives response, updates state (`roomId`, `partnerId`, `status`), clears messages.
7.  **`useChatRealtime` Hook (`useEffect`):** Detects `roomId` change, unsubscribes from the old channel, subscribes to the new one.
8.  **UI:** Updates to "Searching..." or the new chat view.

### 5.6. Leaving a Chat

1.  **User clicks "End".**
2.  **`ChatInterface`:** Calls `endChat` from `useChat`.
3.  **`useChat.endChat`:**
    *   Sets status to `"disconnected"`.
    *   Adds "You have disconnected." system message.
    *   Clears `roomId`, `partnerId`.
    *   Calls `ChatApi.leaveChatApi(previousRoomId, userId)`.
4.  **`ChatApi.leaveChatApi`:** Makes POST request to `/api/chat/leave`.
5.  **`/api/chat/leave` Route:** Calls `removeUserFromRoom(supabase, roomId, userId)` (Deletes from `chat_participants`).
6.  **Realtime (Partner's Client):**
    *   Supabase detects the DELETE on `chat_participants`.
    *   Sends a `postgres_changes` event to the partner's subscribed `room:{roomId}` channel.
    *   **Partner's `useChatRealtime`:** Receives the event.
    ```typescript
    // src/hooks/useChatRealtime.ts (Participant Listener Logic)
    .on<ChatParticipantPayload>(
         'postgres_changes',
         { event: 'DELETE', schema: 'public', table: 'chat_participants', /* filter */ },
         (payload) => {
             const leftUserId = payload.old?.user_id;
             if (leftUserId && leftUserId !== userId) { // Check it was the partner who left
                  onPartnerLeft(); // Callback to useChat
                  setIsPartnerTyping(false);
             }
         }
     )
    ```
    *   Calls `onPartnerLeft` callback.
7.  **Partner's `useChat.handlePartnerLeft`:** Sets status to `"disconnected"`, clears `roomId`/`partnerId`, adds "Stranger disconnected" message.
8.  **Partner's UI:** Updates to show the disconnected state.
9.  **Original User's UI:** Shows the disconnected state.

## 6. Conclusion

This architecture effectively utilizes Supabase as a powerful BaaS, minimizing the need for custom backend server logic.

*   **Strengths:**
    *   **Rapid Development:** Leverages Supabase features (DB, Realtime, RPC) for core backend functionality.
    *   **Scalability:** Supabase handles scaling concerns for DB and Realtime connections (within plan limits).
    *   **Real-time Focus:** Built around Supabase Realtime for chat, presence, and signaling transport.
    *   **Clear Separation:** Frontend logic (React/Next.js) is well-separated from backend operations (Supabase/API routes). Custom hooks (`useChat`, `useWebRTC`) encapsulate complex logic.
*   **Considerations:**
    *   **RLS Complexity:** The reliance on `auth.uid()` in the provided RLS policies needs careful handling for anonymous users (likely requiring Supabase anonymous auth).
    *   **API Route Necessity:** Some actions (like sending messages) could potentially be done directly from the client using Supabase JS library if RLS is configured correctly, reducing API route usage. However, API routes provide a good abstraction layer and allow for potential future server-side logic (validation, rate limiting).
    *   **WebRTC Reliability:** WebRTC relies on STUN/TURN servers for NAT traversal. The current setup only uses public STUN servers, which might not work for all network configurations. Adding a TURN server (potentially via Supabase's Edge Functions or a third-party service) would improve reliability.
    *   **Error Handling:** Robust error handling and state management for edge cases (network drops, permission errors, race conditions beyond `SKIP LOCKED`) are crucial for a smooth user experience.
    *   **Scalability Limits:** High concurrency might eventually hit Supabase plan limits (connections, RPC calls). The `SKIP LOCKED` approach in the RPC is good but might lead to slightly longer wait times under extreme load compared to more complex queueing systems.

Overall, it's a solid architecture for an Omegle clone, making excellent use of Supabase's capabilities combined with a modern Next.js frontend.