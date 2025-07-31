import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Bot,
  Brain,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Edit,
  Save,
  Plus,
  Search,
  Filter,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Clock,
  Target,
  AlertCircle,
  CheckCircle,
  BarChart3,
  Settings,
  Download,
  Upload,
  Play,
  Pause,
  RotateCcw
} from 'lucide-react';
import { apiClient } from '@/services/api';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import { MetricCard } from '@/components/ui/MetricCard';
import { RealTimeChart } from '@/components/ui/RealTimeChart';

interface AIResponse {
  id: string;
  conversationId: string;
  originalMessage: string;
  generatedResponse: string;
  confidence: number;
  intent: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  qualityScore: number;
  humanReviewed: boolean;
  humanRating?: 'excellent' | 'good' | 'fair' | 'poor';
  humanFeedback?: string;
  used: boolean;
  edited: boolean;
  finalResponse?: string;
  timestamp: Date;
  processingTime: number; // in ms
  tokenUsage: number;
  cost: number;
}

interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  category: 'general' | 'emergency' | 'scheduling' | 'technical' | 'billing';
  template: string;
  variables: string[];
  performance: {
    successRate: number;
    avgConfidence: number;
    avgQualityScore: number;
    usageCount: number;
  };
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  versions: Array<{
    version: number;
    template: string;
    performance: any;
    createdAt: Date;
  }>;
}

interface TrainingData {
  id: string;
  inputText: string;
  expectedOutput: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  tags: string[];
  validated: boolean;
  validatedBy?: string;
  validatedAt?: Date;
  modelPerformance?: {
    accuracy: number;
    confidence: number;
    notes: string;
  };
}

interface QualityMetrics {
  overall: {
    accuracy: number;
    confidence: number;
    responseTime: number;
    satisfaction: number;
    costPerQuery: number;
  };
  trends: {
    accuracy: { value: number; change: number };
    confidence: { value: number; change: number };
    satisfaction: { value: number; change: number };
    cost: { value: number; change: number };
  };
  categories: Array<{
    name: string;
    accuracy: number;
    volume: number;
    satisfaction: number;
  }>;
}

const AIManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'review' | 'prompts' | 'training' | 'analytics' | 'optimization'>('review');
  const [selectedResponse, setSelectedResponse] = useState<AIResponse | null>(null);
  const [editingPrompt, setEditingPrompt] = useState<PromptTemplate | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [ratingFilter, setRatingFilter] = useState<'all' | 'unreviewed' | 'excellent' | 'good' | 'fair' | 'poor'>('all');
  const queryClient = useQueryClient();

  // Fetch AI responses for review
  const { data: aiResponses, isLoading: responsesLoading } = useQuery<AIResponse[]>(
    ['ai-responses', searchQuery, ratingFilter],
    () => apiClient.ai.getResponses({ 
      search: searchQuery || undefined,
      rating: ratingFilter !== 'all' ? ratingFilter : undefined 
    }),
    {
      refetchInterval: 30000,
    }
  );

  // Fetch prompt templates
  const { data: promptTemplates } = useQuery<PromptTemplate[]>(
    'prompt-templates',
    () => apiClient.ai.getPromptTemplates(),
    {
      refetchInterval: 60000,
    }
  );

  // Fetch training data
  const { data: trainingData } = useQuery<TrainingData[]>(
    'training-data',
    () => apiClient.ai.getTrainingData(),
    {
      refetchInterval: 300000,
    }
  );

  // Fetch quality metrics
  const { data: qualityMetrics } = useQuery<QualityMetrics>(
    'ai-quality-metrics',
    () => apiClient.ai.getQualityMetrics(),
    {
      refetchInterval: 60000,
    }
  );

  // Rate AI response mutation
  const rateResponse = useMutation(
    (data: { responseId: string; rating: string; feedback?: string }) =>
      apiClient.ai.rateResponse(data.responseId, { rating: data.rating, feedback: data.feedback }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('ai-responses');
        queryClient.invalidateQueries('ai-quality-metrics');
      },
    }
  );

  // Update prompt template mutation
  const updatePromptTemplate = useMutation(
    (template: PromptTemplate) =>
      apiClient.ai.updatePromptTemplate(template.id, template),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('prompt-templates');
        setEditingPrompt(null);
      },
    }
  );

  // Add training data mutation
  const addTrainingData = useMutation(
    (data: Omit<TrainingData, 'id' | 'validated' | 'validatedAt'>) =>
      apiClient.ai.addTrainingData(data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('training-data');
      },
    }
  );

  // Start training mutation
  const startTraining = useMutation(
    () => apiClient.ai.startTraining(),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('ai-quality-metrics');
      },
    }
  );

  const handleRateResponse = (responseId: string, rating: string, feedback?: string) => {
    rateResponse.mutate({ responseId, rating, feedback });
  };

  const handleSavePrompt = () => {
    if (editingPrompt) {
      updatePromptTemplate.mutate(editingPrompt);
    }
  };

  const filteredResponses = aiResponses?.filter(response => {
    if (ratingFilter === 'unreviewed') return !response.humanReviewed;
    if (ratingFilter !== 'all') return response.humanRating === ratingFilter;
    return true;
  }) || [];

  const tabs = [
    { key: 'review', label: 'Response Review', icon: MessageSquare },
    { key: 'prompts', label: 'Prompt Management', icon: Edit },
    { key: 'training', label: 'Training Data', icon: Brain },
    { key: 'analytics', label: 'Analytics', icon: BarChart3 },
    { key: 'optimization', label: 'Optimization', icon: Target },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                <Bot className="h-8 w-8 mr-3 text-blue-600" />
                AI Management Center
              </h1>
              <p className="mt-1 text-sm text-gray-600">
                Manage AI responses, training, and performance optimization
              </p>
            </div>
            <div className="flex items-center space-x-4">
              {qualityMetrics && (
                <div className="flex items-center space-x-4 text-sm">
                  <div className="text-center">
                    <div className="font-semibold text-gray-900">
                      {(qualityMetrics.overall.accuracy * 100).toFixed(1)}%
                    </div>
                    <div className="text-gray-600">Accuracy</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-gray-900">
                      ${qualityMetrics.overall.costPerQuery.toFixed(3)}
                    </div>
                    <div className="text-gray-600">Cost/Query</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8 overflow-x-auto">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key as any)}
                className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                  activeTab === key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'review' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Response List */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-lg shadow">
                <div className="p-6 border-b border-gray-200">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-medium text-gray-900">AI Responses</h3>
                    <div className="flex items-center space-x-2">
                      <select
                        value={ratingFilter}
                        onChange={(e) => setRatingFilter(e.target.value as any)}
                        className="px-3 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="all">All Responses</option>
                        <option value="unreviewed">Unreviewed</option>
                        <option value="excellent">Excellent</option>
                        <option value="good">Good</option>
                        <option value="fair">Fair</option>
                        <option value="poor">Poor</option>
                      </select>
                    </div>
                  </div>
                  
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search responses..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="max-h-96 overflow-y-auto">
                  {responsesLoading ? (
                    <div className="p-6 space-y-4">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="animate-pulse border-b border-gray-100 pb-4">
                          <div className="flex justify-between items-start mb-2">
                            <div className="h-4 bg-gray-300 rounded w-1/4"></div>
                            <div className="h-4 bg-gray-300 rounded w-16"></div>
                          </div>
                          <div className="h-3 bg-gray-300 rounded w-3/4 mb-2"></div>
                          <div className="h-3 bg-gray-300 rounded w-1/2"></div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {filteredResponses.map((response) => (
                        <div
                          key={response.id}
                          onClick={() => setSelectedResponse(response)}
                          className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                            selectedResponse?.id === response.id ? 'bg-blue-50 border-r-2 border-blue-600' : ''
                          }`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center space-x-2">
                              <span className={`text-xs px-2 py-1 rounded ${
                                response.confidence > 0.8 ? 'bg-green-100 text-green-800' :
                                response.confidence > 0.6 ? 'bg-yellow-100 text-yellow-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {Math.round(response.confidence * 100)}% confident
                              </span>
                              {response.humanReviewed && response.humanRating && (
                                <span className={`text-xs px-2 py-1 rounded ${
                                  response.humanRating === 'excellent' ? 'bg-green-100 text-green-800' :
                                  response.humanRating === 'good' ? 'bg-blue-100 text-blue-800' :
                                  response.humanRating === 'fair' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-red-100 text-red-800'
                                }`}>
                                  {response.humanRating}
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-gray-500">
                              {new Date(response.timestamp).toLocaleDateString()}
                            </span>
                          </div>
                          
                          <p className="text-sm text-gray-900 mb-1 line-clamp-2">
                            <strong>Customer:</strong> {response.originalMessage}
                          </p>
                          <p className="text-sm text-gray-600 line-clamp-2">
                            <strong>AI:</strong> {response.generatedResponse}
                          </p>
                          
                          <div className="flex justify-between items-center mt-2">
                            <div className="flex items-center space-x-2 text-xs text-gray-500">
                              <span>{response.intent}</span>
                              <span>•</span>
                              <span>{response.processingTime}ms</span>
                              <span>•</span>
                              <span>${response.cost.toFixed(4)}</span>
                            </div>
                            {!response.humanReviewed && (
                              <AlertCircle className="h-4 w-4 text-yellow-500" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Response Details */}
            <div>
              {selectedResponse ? (
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Response Details</h3>
                  
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-2">Customer Message</p>
                      <div className="bg-gray-50 rounded p-3">
                        <p className="text-sm text-gray-900">{selectedResponse.originalMessage}</p>
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-2">AI Response</p>
                      <div className="bg-blue-50 rounded p-3">
                        <p className="text-sm text-gray-900">{selectedResponse.generatedResponse}</p>
                      </div>
                    </div>

                    {selectedResponse.edited && selectedResponse.finalResponse && (
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-2">Final Response (Edited)</p>
                        <div className="bg-green-50 rounded p-3">
                          <p className="text-sm text-gray-900">{selectedResponse.finalResponse}</p>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium text-gray-700">Confidence</p>
                        <p className="text-lg font-semibold text-gray-900">
                          {Math.round(selectedResponse.confidence * 100)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-700">Quality Score</p>
                        <p className="text-lg font-semibold text-gray-900">
                          {selectedResponse.qualityScore.toFixed(1)}/10
                        </p>
                      </div>
                    </div>

                    {!selectedResponse.humanReviewed && (
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-3">Rate this response</p>
                        <div className="grid grid-cols-2 gap-2">
                          {(['excellent', 'good', 'fair', 'poor'] as const).map((rating) => (
                            <button
                              key={rating}
                              onClick={() => handleRateResponse(selectedResponse.id, rating)}
                              className={`px-3 py-2 text-sm font-medium rounded transition-colors ${
                                rating === 'excellent' ? 'bg-green-100 text-green-800 hover:bg-green-200' :
                                rating === 'good' ? 'bg-blue-100 text-blue-800 hover:bg-blue-200' :
                                rating === 'fair' ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200' :
                                'bg-red-100 text-red-800 hover:bg-red-200'
                              }`}
                            >
                              {rating.charAt(0).toUpperCase() + rating.slice(1)}
                            </button>
                          ))}
                        </div>
                        
                        <textarea
                          placeholder="Optional feedback..."
                          className="w-full mt-3 p-3 border border-gray-300 rounded-lg text-sm resize-none"
                          rows={3}
                          onBlur={(e) => {
                            if (e.target.value.trim()) {
                              // Store feedback to be sent with rating
                            }
                          }}
                        />
                      </div>
                    )}

                    {selectedResponse.humanFeedback && (
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-2">Human Feedback</p>
                        <div className="bg-gray-50 rounded p-3">
                          <p className="text-sm text-gray-900">{selectedResponse.humanFeedback}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow p-6 text-center">
                  <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">Select a response to review details</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'analytics' && qualityMetrics && (
          <div className="space-y-6">
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
              <MetricCard
                title="Overall Accuracy"
                value={`${(qualityMetrics.overall.accuracy * 100).toFixed(1)}%`}
                change={qualityMetrics.trends.accuracy}
                icon={Target}
                color="green"
              />
              <MetricCard
                title="Avg Confidence"
                value={`${(qualityMetrics.overall.confidence * 100).toFixed(1)}%`}
                change={qualityMetrics.trends.confidence}
                icon={TrendingUp}
                color="blue"
              />
              <MetricCard
                title="Response Time"
                value={`${qualityMetrics.overall.responseTime.toFixed(0)}ms`}
                icon={Clock}
                color="purple"
              />
              <MetricCard
                title="Satisfaction"
                value={`${(qualityMetrics.overall.satisfaction * 100).toFixed(1)}%`}
                change={qualityMetrics.trends.satisfaction}
                icon={ThumbsUp}
                color="yellow"
              />
              <MetricCard
                title="Cost per Query"
                value={`$${qualityMetrics.overall.costPerQuery.toFixed(4)}`}
                change={qualityMetrics.trends.cost}
                icon={DollarSign}
                color="red"
              />
            </div>

            {/* Category Performance */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-6">Performance by Category</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {qualityMetrics.categories.map((category, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-3">{category.name}</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Accuracy</span>
                        <span className="text-sm font-medium text-gray-900">
                          {(category.accuracy * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Volume</span>
                        <span className="text-sm font-medium text-gray-900">
                          {category.volume}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Satisfaction</span>
                        <span className="text-sm font-medium text-gray-900">
                          {(category.satisfaction * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Other tabs would be implemented similarly */}
      </div>
    </div>
  );
};

export default AIManagement;