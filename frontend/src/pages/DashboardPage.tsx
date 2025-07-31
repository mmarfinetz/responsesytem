import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/services/api';
import { Users, MessageSquare, Briefcase, FileText, TrendingUp, Clock } from 'lucide-react';

const DashboardPage: React.FC = () => {
  const { data: metrics, isLoading } = useQuery(
    'dashboard-metrics',
    () => apiClient.analytics.getMetrics(),
    {
      refetchInterval: 30000, // Refresh every 30 seconds
    }
  );

  const stats = [
    {
      name: 'Total Customers',
      value: metrics?.data?.totalCustomers || 0,
      icon: Users,
      color: 'bg-blue-500',
    },
    {
      name: 'Active Jobs',
      value: metrics?.data?.activeJobs || 0,
      icon: Briefcase,
      color: 'bg-green-500',
    },
    {
      name: 'Pending Quotes',
      value: metrics?.data?.pendingQuotes || 0,
      icon: FileText,
      color: 'bg-yellow-500',
    },
    {
      name: 'Avg Response Time',
      value: `${metrics?.data?.averageResponseTime || 0}m`,
      icon: Clock,
      color: 'bg-purple-500',
    },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white overflow-hidden shadow rounded-lg animate-pulse">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="h-8 w-8 bg-gray-300 rounded"></div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <div className="h-4 bg-gray-300 rounded w-20 mb-2"></div>
                    <div className="h-6 bg-gray-300 rounded w-12"></div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="md:flex md:items-center md:justify-between">
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Welcome back! Here's what's happening with your business today.
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.name} className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className={`${stat.color} p-2 rounded-md`}>
                      <Icon className="h-6 w-6 text-white" />
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        {stat.name}
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {stat.value}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent Activity Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Conversations */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
              Recent Conversations
            </h3>
            <div className="space-y-3">
              <div className="text-sm text-gray-500">
                Loading recent conversations...
              </div>
            </div>
          </div>
        </div>

        {/* Recent Jobs */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
              Recent Jobs
            </h3>
            <div className="space-y-3">
              <div className="text-sm text-gray-500">
                Loading recent jobs...
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            Performance Overview
          </h3>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {Math.round((metrics?.data?.jobCompletionRate || 0) * 100)}%
              </div>
              <div className="text-sm text-gray-500">Job Completion Rate</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {Math.round((metrics?.data?.conversionRate || 0) * 100)}%
              </div>
              <div className="text-sm text-gray-500">Quote Conversion Rate</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">
                {metrics?.data?.customerSatisfaction || 0}/5
              </div>
              <div className="text-sm text-gray-500">Customer Satisfaction</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;