import React from 'react';

const ConversationsPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="md:flex md:items-center md:justify-between">
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl font-bold text-gray-900">Conversations</h1>
          <p className="mt-1 text-sm text-gray-500">
            View and manage customer conversations and messages.
          </p>
        </div>
      </div>

      {/* Conversations interface will be implemented here */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <div className="text-center py-12">
            <p className="text-gray-500">Conversation management interface coming soon...</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConversationsPage;