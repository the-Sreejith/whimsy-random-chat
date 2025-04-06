'use client';

import React, { useRef, useEffect } from 'react';

interface VideoPlayerProps {
    stream: MediaStream | null;
    muted?: boolean;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ stream, muted = false }) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        } else if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    }, [stream]);

    return (
        <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={muted}
            className="w-full h-full object-cover"
        />
    );
};

export default VideoPlayer;