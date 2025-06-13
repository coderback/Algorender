import Header from '@/components/Header';
import StatsBar from '@/components/StatsBar';
import ClientContent from './ClientContent';

export default function Page() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-blue-50 text-gray-800">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-10">
        {/* Stats bar or other server-rendered parts */}
        <StatsBar />
        {/* Client-only tabs and content */}
        <ClientContent />
      </main>
    </div>
  );
}