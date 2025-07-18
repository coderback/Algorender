export default function StatsBar({ stats, timeComplexity }) {
  return (
    <div className="space-y-4">
      {stats && stats.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-lg p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Statistics</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm text-gray-700">
            {stats.map((stat, index) => (
              <div key={index}>
                <span className="block font-medium text-gray-500">{stat.label}</span>
                <span className="text-gray-900 font-semibold">{stat.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {timeComplexity && (
        <div className="bg-white border border-blue-100 rounded-lg p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-blue-700 mb-2">Complexity</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm text-gray-700">
            <div>
              <span className="block font-medium text-gray-500">Best Case</span>
              <span className="text-gray-900 font-semibold">{timeComplexity.best}</span>
            </div>
            <div>
              <span className="block font-medium text-gray-500">Average Case</span>
              <span className="text-gray-900 font-semibold">{timeComplexity.average}</span>
            </div>
            <div>
              <span className="block font-medium text-gray-500">Worst Case</span>
              <span className="text-gray-900 font-semibold">{timeComplexity.worst}</span>
            </div>
            <div>
              <span className="block font-medium text-gray-500">Space</span>
              <span className="text-gray-900 font-semibold">{timeComplexity.space}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 