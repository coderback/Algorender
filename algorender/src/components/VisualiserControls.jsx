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
    <div className="flex flex-wrap gap-4 justify-center">
      <button
        onClick={addRandomValue}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
      >
        Add Random
      </button>
      <button
        onClick={removeLastValue}
        className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition"
      >
        Remove Last
      </button>
      <button
        onClick={shuffleArray}
        className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 transition"
      >
        Shuffle
      </button>
    </div>
  );
}