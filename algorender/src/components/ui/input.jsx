import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-xl border-2 border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-900 shadow-sm transition-all duration-200",
          "placeholder:text-gray-400",
          "hover:border-gray-300 hover:shadow-md",
          "focus:border-blue-500 focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-gray-200 disabled:hover:shadow-sm",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input }; 