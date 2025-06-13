'use client';

export default function Button({ 
  children, 
  onClick, 
  variant = 'primary', 
  disabled = false,
  className = '',
  fullWidth = false,
  size = 'default'
}) {
  const baseClasses = 'inline-flex items-center justify-center rounded-xl font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 active:scale-[0.98]';
  
  const variantClasses = {
    primary: 'bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-md hover:shadow-lg hover:from-blue-500 hover:to-blue-600 focus:ring-blue-500',
    success: 'bg-gradient-to-br from-green-600 to-green-700 text-white shadow-md hover:shadow-lg hover:from-green-500 hover:to-green-600 focus:ring-green-500',
    danger: 'bg-gradient-to-br from-red-600 to-red-700 text-white shadow-md hover:shadow-lg hover:from-red-500 hover:to-red-600 focus:ring-red-500',
    secondary: 'bg-gradient-to-br from-gray-100 to-gray-200 text-gray-700 shadow-sm hover:shadow-md hover:from-gray-200 hover:to-gray-300 focus:ring-gray-500'
  };

  const sizeClasses = {
    default: 'h-11 px-6 py-2.5',
    sm: 'h-9 px-4 py-2',
    lg: 'h-12 px-8 py-3 text-base'
  };

  const widthClass = fullWidth ? 'w-full' : '';
  const disabledClass = disabled ? 'opacity-50 cursor-not-allowed' : '';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${widthClass} ${disabledClass} ${className}`}
    >
      {children}
    </button>
  );
} 