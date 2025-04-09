'use client';

import { useState, useEffect, useMemo } from 'react';
import { Users } from 'lucide-react';

const ActiveUserCount = () => {
    const [userCount, setUserCount] = useState<number | null>(null);
    const [userId] = useState<string>(() => {
         if (typeof window !== 'undefined') {
             let id = localStorage.getItem('whimsyUserId');
             return id || 'unknown-user'; // Use a fallback if ID not set yet
         }
         return 'unknown-user';
    });


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