# 🧬 Project Overview: Random Chat + Video Call App (Omegle Clone)

## 🌟 Goal

Build a web application that allows users to:

- Randomly match with other online users.
- Engage in **real-time text chat**.
- Start **video calls** (WebRTC-based).
- Disconnect and start a new chat at any time.
- Remain anonymous (no auth required).
- View the number of **active users online** in real-time.

---

## 🔧 Tech Stack

### Frontend

- **Framework**: Next.js 14+ (App Router, Server Components)
- **State Management**: React Context + useState/useEffect
- **Styling**: Tailwind CSS
- **Real-time**: Supabase Realtime (Channels)
- **Video Calls**: WebRTC (native browser API)
- **Notifications**: Toast (shadcn/ui sonner)

### Backend / Infra

- **Database**: Supabase PostgreSQL
- **Realtime**: Supabase Realtime (via `supabase.channel`)
- **RPCs**: PostgreSQL stored procedures for matchmaking
- **Storage**: Supabase Storage (optional, for avatars or video thumbnails)
- **Edge Functions** (optional): For server-side matchmaking control if scaling

---

## 🧠 Core Features & Flows

### 1. 🔁 Matchmaking Logic

#### Overview

- Users enter the app and click “Start Chat”.
- App calls an **RPC function** in Supabase: `find_available_room(user_id)`.
- If a room with 1 participant is found, the user is added, and chat begins.
- If not, a new room is created, and user waits.

#### RPC: `find_available_room(requesting_user_id uuid)`

Returns:

- `room_id`
- `other_user_id`

### 2. 💬 Real-Time Text Chat

#### Realtime Setup

- Uses `supabase.channel("room:{roomId}")`
- Listens for:
  - `new_message`
  - `partner_left`
  - `video_offer`, `video_answer`, `ice_candidate`

#### DB Schema

**chat\_rooms**

```
id (uuid) [PK]
created_at (timestamp)
```

**chat\_participants**

```
id (uuid) [PK]
room_id (uuid) [FK to chat_rooms]
user_id (uuid)
joined_at (timestamp)
```

**chat\_messages**

```
id (uuid)
room_id (uuid)
sender_id (uuid)
message (text)
timestamp (timestamp)
is_system (boolean)
```

---

### 3. 🎥 Video Call (WebRTC)

#### WebRTC Flow

1. User A clicks "Enable Video".
2. Sends WebRTC `offer` to partner via Supabase Realtime.
3. Partner sends `answer`.
4. ICE candidates are exchanged.
5. Once peer connection is established, video streams begin.

#### Signaling

Handled over Supabase Realtime `channel` messages:

- `type: 'video-offer' | 'video-answer' | 'ice-candidate'`
- Payload contains relevant WebRTC SDP or ICE data.

---

### 4. ⚙️ Frontend Pages

#### `/` – Home

- App intro, "Start Chat" button
- Display: **Active users online** (uses Realtime presence channel or heartbeat table)

#### `/chat` – Chat Interface

- Text chat area
- Partner video feed
- User’s own video feed
- “Next” button to disconnect and rematch

#### `/report` – Optional

- Simple form to report abusive users

---

## 🔐 User Identity

- Initially, users are **anonymous UUIDs** stored in `localStorage`
- All interactions are tracked by `user_id`

---

## 🚫 Disconnect Flow

- When a user leaves:
  - They send a `partner_left` message via Realtime
  - The partner gets a notification and is returned to the matchmaking screen

---

## 📌 Active Users Tracker

- Users are registered as active by either:
  - Subscribing to a Realtime **presence channel** (e.g., `supabase.channel('active-users', { config: { presence: { key: userId } } })`)
  - Or inserting/updating a timestamp in an `active_users` table (heartbeat model)
- The frontend listens to presence updates or queries the table every 5–10 seconds
- Display the count in the UI (e.g., “423 users online now”)

---

## 🛎️ Error Handling & Edge Cases

| Case                                        | Handling                                     |
| ------------------------------------------- | -------------------------------------------- |
| Two users join the same room simultaneously | Use DB constraints or row-level locks in RPC |
| Partner leaves suddenly                     | Notify via Realtime channel                  |
| Video permission denied                     | Show a fallback / error toast                |
| No partner found                            | Display “Waiting...” with spinner            |

