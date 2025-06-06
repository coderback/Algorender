export default function Header() {
  return (
    <header className="w-full bg-white shadow-sm sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-green-600 tracking-tight">
          Algorender
        </h1>
        <span className="text-sm text-gray-500 hidden sm:block">
          Visualising DSA, One Step at a Time
        </span>
      </div>
    </header>
  );
}