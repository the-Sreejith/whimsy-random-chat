import { NextResponse } from 'next/server';
// import { createSupabaseServerClient } from '@/lib/supabase/server'; // If needed for auth/logging

export async function POST(request: Request) {
  try {
    // const supabase = createSupabaseServerClient();
    // // Optional: Check if reporter_id exists or is valid if needed
    // const { reported_user_id, reason, room_id, reporter_id } = await request.json();
    const { reported_user_id, reason, room_id } = await request.json();

    console.log('Received report:', { reported_user_id, reason, room_id });

    // TODO: Implement actual reporting logic
    // - Validate input
    // - Store report in a 'reports' table in Supabase
    // - Potentially trigger moderation actions

    // Example: Insert into a 'reports' table (ensure table exists)
    /*
    const { error } = await supabase.from('reports').insert({
      reported_user_id,
      reason,
      room_id,
      // reporter_id: reporter_id // Store who reported if available
    });

    if (error) throw error;
    */

    return NextResponse.json({ success: true, message: 'Report submitted successfully.' });

  } catch (error: any) {
    console.error('Report submission error:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to submit report.' }, { status: 500 });
  }
}

// Remember to create a `reports` table in Supabase if you use this.
/*
CREATE TABLE public.reports (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reported_user_id UUID,
  reporter_id UUID, -- Can be NULL if reporting user is untracked or leaves quickly
  reason TEXT,
  room_id UUID,
  status TEXT DEFAULT 'pending' -- e.g., pending, reviewed, action_taken
);
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated users to submit reports" ON public.reports
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
-- Add policies for moderators/admins to read/update reports
*/