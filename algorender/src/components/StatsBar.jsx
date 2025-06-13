export default function StatsBar({ stats, timeComplexity }) {
  return (
    <div className="space-y-6">
      {stats && stats.length > 0 && (
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Statistics</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            {stats.map((stat, index) => (
              <div key={index} className="space-y-1">
                <span className="block text-sm font-medium text-gray-500">{stat.label}</span>
                <span className="block text-xl font-semibold text-gray-900">{stat.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {timeComplexity && (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 shadow-lg border border-blue-100">
          <h3 className="text-lg font-semibold text-blue-900 mb-4">Complexity Analysis</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-blue-100">
              <span className="block text-sm font-medium text-blue-600 mb-1">Best Case</span>
              <span className="block text-xl font-semibold text-blue-900">{timeComplexity.best}</span>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-green-100">
              <span className="block text-sm font-medium text-green-600 mb-1">Average Case</span>
              <span className="block text-xl font-semibold text-green-900">{timeComplexity.average}</span>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-red-100">
              <span className="block text-sm font-medium text-red-600 mb-1">Worst Case</span>
              <span className="block text-xl font-semibold text-red-900">{timeComplexity.worst}</span>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-purple-100">
              <span className="block text-sm font-medium text-purple-600 mb-1">Space</span>
              <span className="block text-xl font-semibold text-purple-900">{timeComplexity.space}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 