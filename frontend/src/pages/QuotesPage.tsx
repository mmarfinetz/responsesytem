import React from 'react';

const QuotesPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="md:flex md:items-center md:justify-between">
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl font-bold text-gray-900">Quotes</h1>
          <p className="mt-1 text-sm text-gray-500">
            Create, manage, and track quotes for customer jobs.
          </p>
        </div>
        <div className="mt-4 flex md:mt-0 md:ml-4">
          <button
            type="button"
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Create Quote
          </button>
        </div>
      </div>

      {/* Quotes interface will be implemented here */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <div className="text-center py-12">
            <p className="text-gray-500">Quote management interface coming soon...</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuotesPage;