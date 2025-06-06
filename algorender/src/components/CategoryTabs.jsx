// components/CategoryTabs.jsx

export default function CategoryTabs({ activeTab, setActiveTab }) {
  const tabs = [
    { id: 'data', label: '🧩 Data Structures' },
    { id: 'algo', label: '📐 Algorithms' },
  ];

  return (
    <div className="flex justify-center mb-10">
      <div className="bg-white shadow-sm rounded-lg flex overflow-hidden w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-6 py-2 text-sm sm:text-base font-medium transition-all duration-150
              ${activeTab === tab.id
                ? 'bg-green-600 text-white'
                : 'bg-white text-gray-600 hover:bg-green-100'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
