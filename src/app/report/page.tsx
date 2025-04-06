'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function ReportPage() {
    const [reportedUserId, setReportedUserId] = useState('');
    const [reason, setReason] = useState('');
    const [roomId, setRoomId] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!reason.trim()) {
            toast.error("Please provide a reason for the report.");
            return;
        }
        setIsSubmitting(true);

        try {
            const response = await fetch('/api/report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    reported_user_id: reportedUserId || null, // Allow empty if unknown
                    reason: reason.trim(),
                    room_id: roomId || null, // Allow empty if unknown
                }),
            });

            const result = await response.json();

            if (response.ok && result.success) {
                toast.success("Report submitted successfully.");
                setReportedUserId('');
                setReason('');
                setRoomId('');
            } else {
                throw new Error(result.message || "Failed to submit report.");
            }
        } catch (error: any) {
            toast.error("Report submission failed", { description: error.message });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-[calc(100vh-57px)] flex flex-col items-center justify-center p-4 bg-gradient-to-br from-red-50 to-orange-100 dark:from-gray-900 dark:to-gray-800">
            <div className="w-full max-w-md p-6 bg-card rounded-lg shadow-lg border dark:border-gray-700">
                 <Link href="/" className="flex items-center text-sm text-muted-foreground hover:underline mb-4">
                    <ArrowLeft className="w-4 h-4 mr-1" /> Back to Chat
                 </Link>
                <h2 className="text-2xl font-semibold mb-4 text-center">Report User</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="roomId" className="block text-sm font-medium mb-1">Room ID (Optional)</label>
                        <Input
                            id="roomId"
                            value={roomId}
                            onChange={(e) => setRoomId(e.target.value)}
                            placeholder="Enter the Room ID if known"
                        />
                    </div>
                    <div>
                        <label htmlFor="reportedUserId" className="block text-sm font-medium mb-1">Reported User ID (Optional)</label>
                        <Input
                            id="reportedUserId"
                            value={reportedUserId}
                            onChange={(e) => setReportedUserId(e.target.value)}
                            placeholder="Enter the User ID if known"
                        />
                    </div>
                    <div>
                        <label htmlFor="reason" className="block text-sm font-medium mb-1">Reason for Report</label>
                        <Textarea
                            id="reason"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Describe the issue..."
                            rows={4}
                            required
                        />
                    </div>
                    <Button type="submit" className="w-full" disabled={isSubmitting}>
                        {isSubmitting ? 'Submitting...' : 'Submit Report'}
                    </Button>
                </form>
            </div>
             <footer className="py-4 text-center text-sm text-muted-foreground mt-6">
                <p>Whimsy © {new Date().getFullYear()} - Random Chat</p>
            </footer>
        </div>
    );
}