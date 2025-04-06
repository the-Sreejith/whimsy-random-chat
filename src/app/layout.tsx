import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip";
import ActiveUserCount from "@/components/ActiveUserCount";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Whimsy - Random Chats with Strangers",
  description: "Connect with random strangers in a modern, elegant chat interface",
     openGraph: {
       title: "Whimsy - Random Chats with Strangers",
       description: "Connect with random strangers in a modern, elegant chat interface",
       type: "website",
       images: ['/opengraph-image.png'],
     },
     twitter: {
       card: "summary_large_image",
       site: "@your_twitter_handle",
       images: ['/opengraph-image.png'],
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
            <header className="sticky top-0 z-10 flex items-center justify-between px-4 py-2 border-b bg-background/80 backdrop-blur-sm">
                 <h1 className="text-xl font-bold text-primary">Whimsy</h1>
                 <ActiveUserCount />
            </header>
            {children}
            <Toaster />
        </TooltipProvider>
      </body>
    </html>
  );
}

