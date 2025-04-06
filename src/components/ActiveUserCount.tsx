'use client';

import { useState, useEffect, useMemo } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { RealtimePresenceState } from '@supabase/supabase-js';
import { Users } from 'lucide-react';

const ActiveUserCount = () => {
    const [userCount, setUserCount] = useState<number | null>(null);
    const supabase = useMemo(() => getSupabaseBrowserClient(), []);
    const [userId] = useState<string>(() => {
         if (typeof window !== 'undefined') {
             let id = localStorage.getItem('whimsyUserId');
             return id || 'unknown-user'; // Use a fallback if ID not set yet
         }
         return 'unknown-user';
    });


    useEffect(() => {
        if (!supabase || userId === 'unknown-user') return;

        const channel = supabase.channel('active-users', {
            config: {
                presence: {
                    key: userId,
                },
            },
        });

        const handleSync = () => {
            const presenceState: RealtimePresenceState<{}> = channel.presenceState();
            const count = Object.keys(presenceState).length;
            setUserCount(count);
        };

        channel
            .on('presence', { event: 'sync' }, handleSync)
            .on('presence', { event: 'join' }, handleSync) // Update on join
            .on('presence', { event: 'leave' }, handleSync) // Update on leave
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await channel.track({ online_at: new Date().toISOString() });
                    handleSync(); // Initial count sync after subscribing and tracking
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                     console.error('Active users presence channel error:', status);
                     setUserCount(null); // Indicate error or unknown state
                }
            });

        return () => {
            channel.unsubscribe();
            supabase.removeChannel(channel);
        };

    }, [supabase, userId]);

    return (
        <div className="flex items-center text-sm text-muted-foreground">
            <Users className="w-4 h-4 mr-1.5" />
            {userCount !== null ? (
                <span>{userCount} user{userCount !== 1 ? 's' : ''} online</span>
            ) : (
                <span className="italic">Loading...</span>
            )}
        </div>
    );
};

export default ActiveUserCount;