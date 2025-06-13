export default function VisualiserControls({ array, setArray }) {
  const addRandomValue = () => {
    const randomVal = Math.floor(Math.random() * 100);
    setArray([...array, randomVal]);
  };

  const removeLastValue = () => {
    if (array.length > 0) {
      setArray(array.slice(0, -1));
    }
  };

  const shuffleArray = () => {
    const shuffled = [...array].sort(() => Math.random() - 0.5);
    setArray(shuffled);
  };

  return (
    <div className="flex flex-wrap gap-4 justify-center p-6 bg-white rounded-2xl shadow-lg border border-gray-100">
      <button
        onClick={addRandomValue}
        className="inline-flex items-center justify-center px-6 py-2.5 rounded-xl text-sm font-medium text-white bg-gradient-to-br from-blue-600 to-blue-700 shadow-md hover:shadow-lg hover:from-blue-500 hover:to-blue-600 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 active:scale-[0.98]"
      >
        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
        Add Random
      </button>
      <button
        onClick={removeLastValue}
        className="inline-flex items-center justify-center px-6 py-2.5 rounded-xl text-sm font-medium text-white bg-gradient-to-br from-red-600 to-red-700 shadow-md hover:shadow-lg hover:from-red-500 hover:to-red-600 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-red-500/20 active:scale-[0.98]"
      >
        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
        </svg>
        Remove Last
      </button>
      <button
        onClick={shuffleArray}
        className="inline-flex items-center justify-center px-6 py-2.5 rounded-xl text-sm font-medium text-white bg-gradient-to-br from-purple-600 to-purple-700 shadow-md hover:shadow-lg hover:from-purple-500 hover:to-purple-600 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500/20 active:scale-[0.98]"
      >
        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Shuffle
      </button>
    </div>
  );
}