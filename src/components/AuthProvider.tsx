'use client';

import { useEffect, useState } from 'react';
import { initializeAnonymousAuth } from '@/lib/supabase/client';

interface AuthProviderProps {
  children: React.ReactNode;
}

export default function AuthProvider({ children }: AuthProviderProps) {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        // Initialize anonymous auth
        await initializeAnonymousAuth();
        setIsInitialized(true);
      } catch (error) {
        console.error('Error initializing authentication:', error);
        // Still set as initialized to avoid blocking the UI
        setIsInitialized(true);
      }
    };

    init();
  }, []);

  // We don't need to show a loading state as the auth can happen in the background
  // The app can still function while auth is being set up
  return <>{children}</>;
} 