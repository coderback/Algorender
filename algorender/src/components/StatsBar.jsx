export default function StatsBar({ timeComplexity, spaceComplexity }) {
  return (
    <div className="bg-white border border-blue-100 rounded-lg p-4 mb-6 shadow-sm">
      <h3 className="text-lg font-semibold text-blue-700 mb-2">Complexity</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm text-gray-700">
        <div>
          <span className="block font-medium text-gray-500">Best Case</span>
          <span>{timeComplexity.best}</span>
        </div>
        <div>
          <span className="block font-medium text-gray-500">Average Case</span>
          <span>{timeComplexity.average}</span>
        </div>
        <div>
          <span className="block font-medium text-gray-500">Worst Case</span>
          <span>{timeComplexity.worst}</span>
        </div>
        <div>
          <span className="block font-medium text-gray-500">Space</span>
          <span>{spaceComplexity}</span>
        </div>
      </div>
    </div>
  );
}
