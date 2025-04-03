import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css"; // Assuming your Tailwind globals are here
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Whimsy - Random Chats with Strangers",
  description: "Connect with random strangers in a modern, elegant chat interface",
    // Add other meta tags as needed (OpenGraph, Twitter from original index.html)
    // Example for OpenGraph:
     openGraph: {
       title: "Whimsy - Random Chats with Strangers",
       description: "Connect with random strangers in a modern, elegant chat interface",
       type: "website",
       // Update image URL if needed
       images: ['https://lovable.dev/opengraph-image-p98pqg.png'],
     },
     twitter: {
       card: "summary_large_image",
       site: "@lovable_dev", // Replace if you have a different Twitter handle
       // Update image URL if needed
       images: ['https://lovable.dev/opengraph-image-p98pqg.png'],
     }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          "min-h-screen bg-background font-sans antialiased",
          inter.variable
        )}
      >
        <TooltipProvider delayDuration={0}>
            {children}
            <Toaster />
        </TooltipProvider>
      </body>
    </html>
  );
}