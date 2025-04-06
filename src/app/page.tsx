import ChatInterface from "@/components/ChatInterface";
import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-[calc(100vh-57px)] flex flex-col bg-gradient-to-br from-whimsy-50 to-whimsy-100 dark:from-gray-900 dark:to-gray-800">
      <main className="flex-grow flex items-center justify-center p-4 sm:p-6 md:p-10">
        <div className="w-full max-w-5xl h-[80vh] bg-background dark:bg-gray-800/90 rounded-xl overflow-hidden shadow-lg border dark:border-gray-700">
            <ChatInterface />
        </div>
      </main>
      <footer className="py-4 text-center text-sm text-muted-foreground">
        <p>Whimsy © {new Date().getFullYear()} - Random Chat</p>
        <Link href="/report" className="underline ml-4">Report User</Link>
      </footer>
    </div>
  );
}