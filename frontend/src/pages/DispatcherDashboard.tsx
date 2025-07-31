import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  MessageSquare, 
  Phone, 
  Mail, 
  Clock, 
  User, 
  AlertTriangle, 
  CheckCircle,
  Edit,
  Send,
  Bot,
  Filter,
  Search,
  Volume2,
  Users,
  MapPin,
  Briefcase,
  Star,
  ThumbsUp,
  ThumbsDown,
  MoreHorizontal
} from 'lucide-react';
import { apiClient } from '@/services/api';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import { EmergencyAlert, EmergencyAlertData } from '@/components/ui/EmergencyAlert';

interface Conversation {
  id: string;
  customerId: string;
  customer: {
    name: string;
    phone: string;
    address?: string;
    satisfaction?: number;
  };
  channel: 'sms' | 'phone' | 'email';
  status: 'active' | 'pending' | 'resolved' | 'escalated';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignedTo?: string;
  lastMessage: {
    content: string;
    timestamp: Date;
    isFromCustomer: boolean;
    aiGenerated?: boolean;
  };
  messageCount: number;
  isEmergency: boolean;
  aiContext?: {
    suggestedResponse: string;
    confidence: number;
    intent: string;
    sentiment: 'positive' | 'neutral' | 'negative';
  };
  responseTime?: number; // in minutes
  createdAt: Date;
}

interface Message {
  id: string;
  conversationId: string;
  content: string;
  isFromCustomer: boolean;
  aiGenerated?: boolean;
  timestamp: Date;
  status: 'sent' | 'delivered' | 'read';
  attachments?: string[];
}

interface AIResponse {
  suggestedText: string;
  confidence: number;
  reasoning: string;
  alternativeOptions: string[];
  tone: 'professional' | 'friendly' | 'urgent' | 'empathetic';
}

interface TechnicianAssignment {
  technician: {
    id: string;
    name: string;
    skills: string[];
    currentLocation?: { lat: number; lng: number };
    availability: 'available' | 'busy' | 'off_duty';
    rating: number;
  };
  estimatedArrival: number;
  matchScore: number;
}

const DispatcherDashboard: React.FC = () => {
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'pending' | 'emergency'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [aiResponseVisible, setAiResponseVisible] = useState(false);
  const [editingAiResponse, setEditingAiResponse] = useState(false);
  const [customResponse, setCustomResponse] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Fetch conversations
  const { data: conversations, isLoading: conversationsLoading } = useQuery<Conversation[]>(
    ['conversations', filterStatus, searchQuery],
    () => apiClient.conversations.getAll({ 
      status: filterStatus !== 'all' ? filterStatus : undefined,
      search: searchQuery || undefined,
      isEmergency: filterStatus === 'emergency' ? true : undefined
    }),
    {
      refetchInterval: 10000, // Refresh every 10 seconds
    }
  );

  // Fetch messages for selected conversation
  const { data: messages } = useQuery<Message[]>(
    ['conversation-messages', selectedConversation?.id],
    () => apiClient.conversations.getMessages(selectedConversation!.id),
    {
      enabled: !!selectedConversation?.id,
      refetchInterval: 5000, // Refresh every 5 seconds
    }
  );

  // Fetch AI response suggestion
  const { data: aiResponse, isLoading: aiResponseLoading } = useQuery<AIResponse>(
    ['ai-response', selectedConversation?.id, selectedConversation?.lastMessage?.content],
    () => apiClient.ai.generateResponseSuggestion(selectedConversation!.id),
    {
      enabled: !!selectedConversation?.id && aiResponseVisible,
    }
  );

  // Fetch emergency alerts
  const { data: emergencyAlerts } = useQuery<EmergencyAlertData[]>(
    'emergency-alerts',
    () => apiClient.emergencies.getActiveAlerts(),
    {
      refetchInterval: 10000,
    }
  );

  // Fetch available technicians for assignment
  const { data: availableTechnicians } = useQuery<TechnicianAssignment[]>(
    ['available-technicians', selectedConversation?.customer?.address],
    () => apiClient.jobs.getAvailableTechnicians({
      location: selectedConversation?.customer?.address,
      skills: [], // TODO: Extract skills from conversation context
    }),
    {
      enabled: !!selectedConversation?.customer?.address,
    }
  );

  // Send message mutation
  const sendMessage = useMutation(
    (data: { conversationId: string; content: string; aiGenerated?: boolean }) =>
      apiClient.conversations.sendMessage(data.conversationId, {
        content: data.content,
        aiGenerated: data.aiGenerated,
      }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['conversation-messages', selectedConversation?.id]);
        queryClient.invalidateQueries(['conversations']);
        setMessageInput('');
        setCustomResponse('');
        setAiResponseVisible(false);
        setEditingAiResponse(false);
      },
    }
  );

  // Update conversation status mutation
  const updateConversationStatus = useMutation(
    (data: { conversationId: string; status: Conversation['status'] }) =>
      apiClient.conversations.updateStatus(data.conversationId, { status: data.status }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('conversations');
      },
    }
  );

  // Assign technician mutation
  const assignTechnician = useMutation(
    (data: { conversationId: string; technicianId: string }) =>
      apiClient.jobs.assignTechnician(data.conversationId, data.technicianId),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('conversations');
      },
    }
  );

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initialize AI response when conversation is selected
  useEffect(() => {
    if (selectedConversation && selectedConversation.aiContext?.suggestedResponse) {
      setCustomResponse(selectedConversation.aiContext.suggestedResponse);
    }
  }, [selectedConversation]);

  const handleSendMessage = () => {
    if (!selectedConversation || !messageInput.trim()) return;
    
    sendMessage.mutate({
      conversationId: selectedConversation.id,
      content: messageInput.trim(),
      aiGenerated: false,
    });
  };

  const handleSendAIResponse = (response: string, aiGenerated: boolean = true) => {
    if (!selectedConversation || !response.trim()) return;
    
    sendMessage.mutate({
      conversationId: selectedConversation.id,
      content: response.trim(),
      aiGenerated,
    });
  };

  const handleAssignTechnician = (technicianId: string) => {
    if (!selectedConversation) return;
    
    assignTechnician.mutate({
      conversationId: selectedConversation.id,
      technicianId,
    });
  };

  const filteredConversations = conversations?.filter(conv => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        conv.customer.name.toLowerCase().includes(query) ||
        conv.customer.phone.includes(query) ||
        conv.lastMessage.content.toLowerCase().includes(query)
      );
    }
    return true;
  }) || [];

  const priorityColor = {
    low: 'bg-blue-500',
    medium: 'bg-yellow-500',
    high: 'bg-orange-500',
    critical: 'bg-red-500',
  };

  const channelIcon = {
    sms: MessageSquare,
    phone: Phone,
    email: Mail,
  };

  return (
    <div className="h-screen flex bg-gray-100">
      {/* Sidebar - Conversations List */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-xl font-semibold text-gray-900 mb-4">Dispatch Center</h1>
          
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          {/* Filters */}
          <div className="flex space-x-2">
            {(['all', 'active', 'pending', 'emergency'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                  filterStatus === status
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Emergency Alerts */}
        {emergencyAlerts && emergencyAlerts.length > 0 && (
          <div className="p-4 bg-red-50 border-b border-red-200">
            <h3 className="text-sm font-semibold text-red-800 mb-2 flex items-center">
              <AlertTriangle className="h-4 w-4 mr-1" />
              Emergency Alerts ({emergencyAlerts.length})
            </h3>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {emergencyAlerts.slice(0, 3).map((alert) => (
                <div key={alert.id} className="text-xs bg-white rounded p-2 border border-red-200">
                  <p className="font-medium text-red-900">{alert.customer.name}</p>
                  <p className="text-red-700 truncate">{alert.message}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto">
          {conversationsLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="flex items-start space-x-3 p-3">
                    <div className="w-10 h-10 bg-gray-300 rounded-full"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-300 rounded w-3/4"></div>
                      <div className="h-3 bg-gray-300 rounded w-1/2"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredConversations.map((conversation) => {
                const ChannelIcon = channelIcon[conversation.channel];
                const isSelected = selectedConversation?.id === conversation.id;
                
                return (
                  <div
                    key={conversation.id}
                    onClick={() => setSelectedConversation(conversation)}
                    className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                      isSelected ? 'bg-blue-50 border-r-2 border-blue-600' : ''
                    }`}
                  >
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0">
                        <div className="relative">
                          <div className="h-10 w-10 bg-gray-200 rounded-full flex items-center justify-center">
                            <User className="h-5 w-5 text-gray-500" />
                          </div>
                          <div className="absolute -bottom-1 -right-1">
                            <ChannelIcon className="h-4 w-4 text-gray-600 bg-white rounded-full p-0.5" />
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {conversation.customer.name}
                          </p>
                          <div className="flex items-center space-x-1">
                            {conversation.isEmergency && (
                              <AlertTriangle className="h-3 w-3 text-red-500" />
                            )}
                            <div className={`w-2 h-2 rounded-full ${priorityColor[conversation.priority]}`} />
                          </div>
                        </div>
                        
                        <p className="text-xs text-gray-600 truncate mb-1">
                          {conversation.lastMessage.content}
                        </p>
                        
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <StatusIndicator 
                              status={conversation.status === 'active' ? 'online' : 'pending'} 
                              size="sm"
                            />
                            {conversation.aiContext && (
                              <Bot className="h-3 w-3 text-blue-500" />
                            )}
                          </div>
                          <span className="text-xs text-gray-500">
                            {new Date(conversation.lastMessage.timestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                        
                        {conversation.responseTime && (
                          <div className="mt-1">
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              conversation.responseTime <= 5 ? 'bg-green-100 text-green-800' :
                              conversation.responseTime <= 15 ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {conversation.responseTime}m response
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {selectedConversation ? (
          <>
            {/* Conversation Header */}
            <div className="bg-white border-b border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="h-10 w-10 bg-gray-200 rounded-full flex items-center justify-center">
                    <User className="h-5 w-5 text-gray-500" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      {selectedConversation.customer.name}
                    </h2>
                    <div className="flex items-center space-x-4 text-sm text-gray-600">
                      <span className="flex items-center">
                        <Phone className="h-4 w-4 mr-1" />
                        {selectedConversation.customer.phone}
                      </span>
                      {selectedConversation.customer.address && (
                        <span className="flex items-center">
                          <MapPin className="h-4 w-4 mr-1" />
                          {selectedConversation.customer.address}
                        </span>
                      )}
                      {selectedConversation.customer.satisfaction && (
                        <span className="flex items-center">
                          <Star className="h-4 w-4 mr-1 text-yellow-500" />
                          {selectedConversation.customer.satisfaction.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setAiResponseVisible(!aiResponseVisible)}
                    className={`px-3 py-1 text-sm font-medium rounded ${
                      aiResponseVisible 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <Bot className="h-4 w-4 inline mr-1" />
                    AI Assist
                  </button>
                  
                  <select
                    value={selectedConversation.status}
                    onChange={(e) => updateConversationStatus.mutate({
                      conversationId: selectedConversation.id,
                      status: e.target.value as Conversation['status']
                    })}
                    className="px-3 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="active">Active</option>
                    <option value="pending">Pending</option>
                    <option value="resolved">Resolved</option>
                    <option value="escalated">Escalated</option>
                  </select>
                  
                  <button className="p-2 text-gray-500 hover:text-gray-700">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* AI Response Panel */}
            {aiResponseVisible && (
              <div className="bg-blue-50 border-b border-blue-200 p-4">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-sm font-semibold text-blue-900 flex items-center">
                    <Bot className="h-4 w-4 mr-1" />
                    AI Response Suggestion
                    {aiResponse && (
                      <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                        {Math.round(aiResponse.confidence * 100)}% confident
                      </span>
                    )}
                  </h3>
                  <button
                    onClick={() => setEditingAiResponse(!editingAiResponse)}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                </div>
                
                {aiResponseLoading ? (
                  <div className="animate-pulse">
                    <div className="h-4 bg-blue-200 rounded w-3/4 mb-2"></div>
                    <div className="h-4 bg-blue-200 rounded w-1/2"></div>
                  </div>
                ) : aiResponse ? (
                  <div className="space-y-3">
                    {editingAiResponse ? (
                      <textarea
                        value={customResponse}
                        onChange={(e) => setCustomResponse(e.target.value)}
                        className="w-full p-3 border border-blue-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500"
                        rows={3}
                        placeholder="Edit the AI response..."
                      />
                    ) : (
                      <div className="bg-white border border-blue-200 rounded-lg p-3">
                        <p className="text-sm text-gray-900">{aiResponse.suggestedText}</p>
                        <p className="text-xs text-gray-600 mt-2">
                          <strong>Reasoning:</strong> {aiResponse.reasoning}
                        </p>
                      </div>
                    )}
                    
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleSendAIResponse(
                          editingAiResponse ? customResponse : aiResponse.suggestedText,
                          !editingAiResponse
                        )}
                        className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700"
                      >
                        Send Response
                      </button>
                      
                      <button
                        className="bg-white border border-blue-300 text-blue-700 px-4 py-2 rounded text-sm font-medium hover:bg-blue-50"
                      >
                        <ThumbsUp className="h-4 w-4 inline mr-1" />
                        Good
                      </button>
                      
                      <button
                        className="bg-white border border-blue-300 text-blue-700 px-4 py-2 rounded text-sm font-medium hover:bg-blue-50"
                      >
                        <ThumbsDown className="h-4 w-4 inline mr-1" />
                        Poor
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto bg-gray-50 p-4">
              <div className="space-y-4">
                {messages?.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.isFromCustomer ? 'justify-start' : 'justify-end'}`}
                  >
                    <div
                      className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                        message.isFromCustomer
                          ? 'bg-white text-gray-900 border border-gray-200'
                          : message.aiGenerated
                          ? 'bg-blue-100 text-blue-900 border border-blue-200'
                          : 'bg-blue-600 text-white'
                      }`}
                    >
                      <p className="text-sm">{message.content}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs opacity-75">
                          {new Date(message.timestamp).toLocaleTimeString()}
                        </span>
                        {message.aiGenerated && (
                          <Bot className="h-3 w-3 opacity-75" />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Message Input */}
            <div className="bg-white border-t border-gray-200 p-4">
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Type your message..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!messageInput.trim() || sendMessage.isLoading}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <MessageSquare className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Select a Conversation</h2>
              <p className="text-gray-600">Choose a conversation from the sidebar to start managing it.</p>
            </div>
          </div>
        )}
      </div>

      {/* Right Sidebar - Context & Actions */}
      {selectedConversation && (
        <div className="w-80 bg-white border-l border-gray-200 p-4 overflow-y-auto">
          <div className="space-y-6">
            {/* Customer Context */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Customer Context</h3>
              <div className="space-y-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm text-gray-600">Priority</p>
                  <div className="flex items-center mt-1">
                    <div className={`w-3 h-3 rounded-full ${priorityColor[selectedConversation.priority]} mr-2`} />
                    <span className="text-sm font-medium text-gray-900 capitalize">
                      {selectedConversation.priority}
                    </span>
                  </div>
                </div>
                
                {selectedConversation.aiContext && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-sm text-gray-600">Intent</p>
                    <p className="text-sm font-medium text-gray-900 mt-1">
                      {selectedConversation.aiContext.intent}
                    </p>
                    <div className="mt-2">
                      <span className={`text-xs px-2 py-1 rounded ${
                        selectedConversation.aiContext.sentiment === 'positive' ? 'bg-green-100 text-green-800' :
                        selectedConversation.aiContext.sentiment === 'negative' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {selectedConversation.aiContext.sentiment} sentiment
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Technician Assignment */}
            {availableTechnicians && availableTechnicians.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Assign Technician</h3>
                <div className="space-y-2">
                  {availableTechnicians.slice(0, 3).map((assignment) => (
                    <div
                      key={assignment.technician.id}
                      className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 cursor-pointer"
                      onClick={() => handleAssignTechnician(assignment.technician.id)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium text-gray-900">{assignment.technician.name}</p>
                        <div className="flex items-center">
                          <Star className="h-4 w-4 text-yellow-500 mr-1" />
                          <span className="text-sm text-gray-600">{assignment.technician.rating}</span>
                        </div>
                      </div>
                      <div className="text-xs text-gray-600 space-y-1">
                        <p>ETA: {assignment.estimatedArrival} minutes</p>
                        <p>Match: {Math.round(assignment.matchScore * 100)}%</p>
                        <StatusIndicator 
                          status={assignment.technician.availability === 'available' ? 'online' : 'pending'} 
                          size="sm" 
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Quick Actions</h3>
              <div className="space-y-2">
                <button className="w-full bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center justify-center">
                  <Phone className="h-4 w-4 mr-2" />
                  Call Customer
                </button>
                <button className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center justify-center">
                  <Briefcase className="h-4 w-4 mr-2" />
                  Create Job
                </button>
                <button className="w-full bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 flex items-center justify-center">
                  <Users className="h-4 w-4 mr-2" />
                  Escalate
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DispatcherDashboard;