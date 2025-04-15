import React from 'react';

const LoadingIndicator: React.FC = () => {
  return (
    <div className="mb-4 flex justify-start">
      <div className="max-w-[85%] rounded-xl bg-white px-4 py-3 shadow">
        <div className="flex space-x-2">
          <div className="h-2.5 w-2.5 animate-bounce rounded-full bg-gray-400"></div>
          <div className="h-2.5 w-2.5 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: '0.2s' }}></div>
          <div className="h-2.5 w-2.5 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: '0.4s' }}></div>
        </div>
      </div>
    </div>
  );
};

export default LoadingIndicator;