'use client';

export default function InputControl({ 
  label, 
  value, 
  onChange, 
  type = 'text', 
  placeholder, 
  min, 
  max,
  error,
  helperText,
  className = ''
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      <label className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={onChange}
          min={min}
          max={max}
          placeholder={placeholder}
          className={`
            w-full h-11 px-4 py-2.5 bg-white border-2 rounded-xl shadow-sm
            text-sm font-medium text-gray-900 transition-all duration-200
            placeholder:text-gray-400
            hover:border-gray-300 hover:shadow-md
            focus:border-blue-500 focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20
            disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-gray-200 disabled:hover:shadow-sm
            ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : 'border-gray-200'}
          `}
        />
      </div>
      {(error || helperText) && (
        <p className={`text-sm ${error ? 'text-red-500' : 'text-gray-500'}`}>
          {error || helperText}
        </p>
      )}
    </div>
  );
} 