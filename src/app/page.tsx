import ChatInterface from "@/components/ChatInterface";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-whimsy-50 to-whimsy-100 dark:from-gray-900 dark:to-gray-800">
      <main className="flex-grow flex items-center justify-center p-4 sm:p-6 md:p-10">
        {/* The ChatInterface component is client-side due to hooks and state */}
        <div className="w-full max-w-4xl h-[80vh] bg-background dark:bg-gray-800/90 rounded-xl overflow-hidden shadow-lg border backdrop-blur-sm dark:border-gray-700">
            <ChatInterface />
        </div>
      </main>
      <footer className="py-4 text-center text-sm text-muted-foreground">
        <p>Whimsy © {new Date().getFullYear()} - Random Chat</p>
      </footer>
    </div>
  );
}