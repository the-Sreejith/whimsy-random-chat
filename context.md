# Whimsy Random Chat

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

*   Anonymous authentication is handled through Supabase Auth's `signInAnonymously()` method.
*   A UUID is generated client-side when a user first visits, or the Supabase Auth user ID is used if available.
*   User authentication is initialized at application start via the `AuthProvider` component.
*   The user ID is stored in `localStorage` under the key `whimsyUserId` for backward compatibility.
*   This integrated approach ensures that `auth.uid()` in Supabase RLS policies correctly maps to the user's identity.
*   The `getUserId()` utility function in `lib/supabase/client.ts` provides a consistent way to access the user's ID.

## 5. Directory Structure and the purpose of key files.

└── **whimsy-random-chat/**
    ├── `README.md`: Main project documentation (Backend Setup, Realtime, RPC).
    ├── `components.json`: Configuration for shadcn/ui components.
    ├── `next.config.ts`: Next.js build and runtime configuration.
    ├── `package.json`: Project dependencies (npm/yarn) and scripts.
    ├── `postcss.config.mjs`: PostCSS configuration, primarily for Tailwind CSS.
    ├── `README2.md`: High-level project overview and feature description.
    ├── `tailwind.config.ts`: Tailwind CSS theme, variants, and plugin configuration.
    ├── `tsconfig.json`: TypeScript compiler options for the project.
    ├── **public/**: Static assets (e.g., images, fonts) served directly.
    ├── **src/**: Main application source code.
    │   ├── **app/**: Next.js App Router directory (pages, API routes, layout).
    │   │   ├── `globals.css`: Global CSS styles, Tailwind CSS imports and base layers.
    │   │   ├── `layout.tsx`: Root application layout component (wraps all pages, includes header, providers).
    │   │   ├── `page.tsx`: Main application entry page component (`/`), renders `ChatInterface`.
    │   │   ├── **api/**: Server-side API route handlers.
    │   │   │   ├── **chat/**: API routes specifically for chat functionality.
    │   │   │   │   ├── **leave/route.ts**: API endpoint logic for a user leaving a chat room.
    │   │   │   │   ├── **message/route.ts**: API endpoint logic for sending a chat message.
    │   │   │   │   ├── **next/route.ts**: API endpoint logic for leaving the current chat and finding a new one.
    │   │   │   │   └── **start/route.ts**: API endpoint logic for initiating matchmaking and starting a chat.
    │   │   │   └── **report/route.ts**: API endpoint logic for submitting user reports (optional feature).
    │   │   └── **report/**: Frontend page for user reporting.
    │   │       └── `page.tsx`: React component for the user report submission form.
    │   ├── **components/**: Reusable React UI components.
    │   │   ├── `ActiveUserCount.tsx`: Component displaying the live count of online users via Supabase Presence.
    │   │   ├── `ChatInterface.tsx`: The main component orchestrating the chat UI, state, and interactions.
    │   │   ├── `ChatMessage.tsx`: Component responsible for rendering a single chat message bubble.
    │   │   ├── `TypingIndicator.tsx`: Component displaying the "partner is typing" animation.
    │   │   ├── `VideoPlayer.tsx`: Component for rendering local/remote WebRTC video streams.
    │   │   └── **ui/**: Base UI components, likely generated by/used with shadcn/ui.
    │   │       ├── `button.tsx`: Reusable Button component.
    │   │       ├── `input.tsx`: Reusable Input field component.
    │   │       ├── `sonner.tsx`: Toaster component configuration (for notifications).
    │   │       ├── `textarea.tsx`: Reusable Textarea component.
    │   │       └── `tooltip.tsx`: Reusable Tooltip component.
    │   ├── **hooks/**: Custom React hooks encapsulating stateful logic.
    │   │   ├── `useChat.ts`: Core hook managing chat state (status, messages, room, partner), API interactions, and Realtime events orchestration.
    │   │   ├── `useChatApi.ts`: Hook abstracting fetch calls to the `/api/chat/*` endpoints.
    │   │   ├── `useChatRealtime.ts`: Hook managing Supabase Realtime channel subscriptions (messages, presence, signaling) for a chat room.
    │   │   └── `useWebRTC.ts`: Hook handling WebRTC peer connection setup, signaling logic, and stream management.
    │   ├── **lib/**: Shared utility functions and library configurations.
    │   │   ├── `utils.ts`: General utility functions (e.g., `cn` for class name merging).
    │   │   └── **supabase/**: Supabase client initialization logic.
    │   │       ├── `client.ts`: Sets up the Supabase client for browser-side usage.
    │   │       └── `server.ts`: Sets up the Supabase client for server-side usage (API routes, Server Components).
    │   └── **types/**: TypeScript type definitions.
    │       ├── `chat.ts`: Custom type definitions specific to the chat application (Message, Status, SignalingMessage).
    │       └── `supabase.ts`: Auto-generated TypeScript types based on the Supabase database schema.
    └── **supabase/**: Configuration and database migrations for Supabase local development CLI.
        ├── `config.toml`: Supabase CLI project configuration file (ports, auth, db settings).
        ├── `.gitignore`: Specifies files generated by Supabase CLI to be ignored by Git.
        └── **migrations/**: Directory containing ordered SQL migration files for database schema changes.
            ├── `0000_create_schema.sql`: SQL script to create initial database tables (chat_rooms, chat_participants, chat_messages).
            ├── `0001_create_rpc.sql`: SQL script to create the `find_available_room` PostgreSQL function for matchmaking.
            └── `0002_rls_policies.sql`: SQL script to define Row Level Security (RLS) policies for data access control.

