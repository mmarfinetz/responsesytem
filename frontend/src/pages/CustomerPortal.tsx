import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Calendar,
  Clock,
  DollarSign,
  FileText,
  History,
  MessageSquare,
  Camera,
  Star,
  Wrench,
  AlertCircle,
  CheckCircle,
  MapPin,
  Phone,
  Mail,
  Upload,
  Download,
  CreditCard,
  Shield,
  Bell,
  Settings,
  User,
  Home
} from 'lucide-react';
import { apiClient } from '@/services/api';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import { MetricCard } from '@/components/ui/MetricCard';
import { RealTimeChart } from '@/components/ui/RealTimeChart';

interface ServiceHistory {
  id: string;
  date: Date;
  type: string;
  description: string;
  technician: string;
  cost: number;
  status: 'completed' | 'in_progress' | 'scheduled';
  photos: string[];
  warranty?: {
    expires: Date;
    covered: boolean;
  };
  rating?: number;
  notes?: string;
}

interface Equipment {
  id: string;
  type: string;
  brand: string;
  model: string;
  installDate: Date;
  lastService: Date;
  nextService?: Date;
  warrantyCoverage?: {
    expires: Date;
    provider: string;
    claimable: boolean;
  };
  condition: 'excellent' | 'good' | 'fair' | 'poor';
  maintenanceTips: string[];
  estimatedLifespan: number; // in years
}

interface MaintenanceRecommendation {
  equipmentId: string;
  equipmentName: string;
  type: 'preventive' | 'repair' | 'replacement';
  priority: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  estimatedCost: number;
  recommendedDate: Date;
  reasoning: string;
  benefits: string[];
  consequences?: string;
}

interface QuoteRequest {
  id?: string;
  type: string;
  description: string;
  urgency: 'routine' | 'soon' | 'urgent' | 'emergency';
  preferredDate?: Date;
  photos: File[];
  contactMethod: 'phone' | 'email' | 'sms';
  location: string;
  additionalNotes?: string;
}

interface Bill {
  id: string;
  date: Date;
  amount: number;
  status: 'paid' | 'pending' | 'overdue';
  services: Array<{
    description: string;
    cost: number;
  }>;
  warrantyItems?: Array<{
    description: string;
    covered: boolean;
    savings?: number;
  }>;
}

const CustomerPortal: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'equipment' | 'maintenance' | 'schedule' | 'quotes' | 'billing'>('overview');
  const [quoteRequest, setQuoteRequest] = useState<QuoteRequest>({
    type: '',
    description: '',
    urgency: 'routine',
    photos: [],
    contactMethod: 'phone',
    location: '',
  });
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const queryClient = useQueryClient();

  // Fetch customer profile
  const { data: profile } = useQuery(
    'customer-profile',
    () => apiClient.customers.getCurrentProfile(),
    {
      refetchInterval: 300000, // Refresh every 5 minutes
    }
  );

  // Fetch service history
  const { data: serviceHistory } = useQuery<ServiceHistory[]>(
    'service-history',
    () => apiClient.customers.getServiceHistory(),
    {
      refetchInterval: 60000,
    }
  );

  // Fetch equipment
  const { data: equipment } = useQuery<Equipment[]>(
    'customer-equipment',
    () => apiClient.customers.getEquipment(),
    {
      refetchInterval: 300000,
    }
  );

  // Fetch maintenance recommendations
  const { data: maintenanceRecommendations } = useQuery<MaintenanceRecommendation[]>(
    'maintenance-recommendations',
    () => apiClient.maintenance.getRecommendations(),
    {
      refetchInterval: 86400000, // Refresh daily
    }
  );

  // Fetch available appointment slots
  const { data: availableSlots } = useQuery(
    'available-slots',
    () => apiClient.scheduling.getAvailableSlots(),
    {
      refetchInterval: 300000,
    }
  );

  // Fetch bills
  const { data: bills } = useQuery<Bill[]>(
    'customer-bills',
    () => apiClient.billing.getBills(),
    {
      refetchInterval: 300000,
    }
  );

  // Submit quote request mutation
  const submitQuoteRequest = useMutation(
    (data: QuoteRequest) => {
      const formData = new FormData();
      Object.entries(data).forEach(([key, value]) => {
        if (key === 'photos') {
          value.forEach((photo: File) => formData.append('photos', photo));
        } else if (value !== undefined && value !== null) {
          formData.append(key, value.toString());
        }
      });
      return apiClient.quotes.submit(formData);
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('customer-quotes');
        setShowQuoteForm(false);
        setQuoteRequest({
          type: '',
          description: '',
          urgency: 'routine',
          photos: [],
          contactMethod: 'phone',
          location: '',
        });
      },
    }
  );

  // Schedule appointment mutation
  const scheduleAppointment = useMutation(
    (data: { slotId: string; serviceType: string; notes?: string }) =>
      apiClient.scheduling.bookAppointment(data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('scheduled-appointments');
        queryClient.invalidateQueries('available-slots');
      },
    }
  );

  const handlePhotoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setQuoteRequest(prev => ({
      ...prev,
      photos: [...prev.photos, ...files]
    }));
  };

  const handleQuoteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitQuoteRequest.mutate(quoteRequest);
  };

  const priorityColors = {
    low: 'text-blue-600 bg-blue-50',
    medium: 'text-yellow-600 bg-yellow-50',
    high: 'text-orange-600 bg-orange-50',
    critical: 'text-red-600 bg-red-50',
  };

  const statusColors = {
    completed: 'text-green-600 bg-green-50',
    in_progress: 'text-blue-600 bg-blue-50',
    scheduled: 'text-purple-600 bg-purple-50',
  };

  const tabs = [
    { key: 'overview', label: 'Overview', icon: Home },
    { key: 'history', label: 'Service History', icon: History },
    { key: 'equipment', label: 'Equipment', icon: Wrench },
    { key: 'maintenance', label: 'Maintenance', icon: AlertCircle },
    { key: 'schedule', label: 'Schedule Service', icon: Calendar },
    { key: 'quotes', label: 'Get Quote', icon: DollarSign },
    { key: 'billing', label: 'Billing', icon: CreditCard },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Customer Portal</h1>
              {profile && (
                <p className="mt-1 text-sm text-gray-600">
                  Welcome back, {profile.firstName} {profile.lastName}
                </p>
              )}
            </div>
            <div className="flex items-center space-x-4">
              <button className="text-gray-500 hover:text-gray-700">
                <Bell className="h-5 w-5" />
              </button>
              <button className="text-gray-500 hover:text-gray-700">
                <Settings className="h-5 w-5" />
              </button>
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
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <MetricCard
                title="Services This Year"
                value={serviceHistory?.length || 0}
                icon={Wrench}
                color="blue"
              />
              <MetricCard
                title="Total Saved"
                value={`$${bills?.reduce((sum, bill) => sum + (bill.warrantyItems?.reduce((s, item) => s + (item.savings || 0), 0) || 0), 0).toFixed(0)}`}
                icon={Shield}
                color="green"
              />
              <MetricCard
                title="Equipment Items"
                value={equipment?.length || 0}
                icon={Home}
                color="purple"
              />
              <MetricCard
                title="Upcoming Services"
                value={maintenanceRecommendations?.filter(r => r.type === 'preventive').length || 0}
                icon={Calendar}
                color="yellow"
              />
            </div>

            {/* Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-lg shadow">
                <div className="p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Services</h3>
                  <div className="space-y-3">
                    {serviceHistory?.slice(0, 5).map((service) => (
                      <div key={service.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{service.type}</p>
                          <p className="text-xs text-gray-600">{new Date(service.date).toLocaleDateString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-gray-900">${service.cost}</p>
                          <StatusIndicator status="online" size="sm" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow">
                <div className="p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Maintenance Alerts</h3>
                  <div className="space-y-3">
                    {maintenanceRecommendations?.slice(0, 5).map((rec) => (
                      <div key={rec.equipmentId} className={`p-3 rounded-lg border ${priorityColors[rec.priority]}`}>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-medium">{rec.equipmentName}</p>
                          <span className="text-xs font-medium uppercase">{rec.priority}</span>
                        </div>
                        <p className="text-xs">{rec.description}</p>
                        <p className="text-xs mt-1">Est. Cost: ${rec.estimatedCost}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <button
                  onClick={() => setActiveTab('schedule')}
                  className="flex flex-col items-center p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  <Calendar className="h-8 w-8 text-blue-600 mb-2" />
                  <span className="text-sm font-medium text-gray-900">Schedule Service</span>
                </button>
                <button
                  onClick={() => setActiveTab('quotes')}
                  className="flex flex-col items-center p-4 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
                >
                  <DollarSign className="h-8 w-8 text-green-600 mb-2" />
                  <span className="text-sm font-medium text-gray-900">Get Quote</span>
                </button>
                <button
                  onClick={() => setActiveTab('maintenance')}
                  className="flex flex-col items-center p-4 bg-yellow-50 rounded-lg hover:bg-yellow-100 transition-colors"
                >
                  <AlertCircle className="h-8 w-8 text-yellow-600 mb-2" />
                  <span className="text-sm font-medium text-gray-900">View Alerts</span>
                </button>
                <button className="flex flex-col items-center p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors">
                  <MessageSquare className="h-8 w-8 text-purple-600 mb-2" />
                  <span className="text-sm font-medium text-gray-900">Contact Support</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow">
              <div className="p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-6">Service History</h3>
                <div className="space-y-6">
                  {serviceHistory?.map((service) => (
                    <div key={service.id} className="border border-gray-200 rounded-lg p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h4 className="text-lg font-medium text-gray-900">{service.type}</h4>
                          <p className="text-sm text-gray-600 mt-1">{service.description}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-semibold text-gray-900">${service.cost}</p>
                          <StatusIndicator status={service.status === 'completed' ? 'online' : 'pending'} size="sm" />
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div>
                          <p className="text-sm text-gray-600">Date</p>
                          <p className="font-medium">{new Date(service.date).toLocaleDateString()}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Technician</p>
                          <p className="font-medium">{service.technician}</p>
                        </div>
                        {service.rating && (
                          <div>
                            <p className="text-sm text-gray-600">Rating</p>
                            <div className="flex items-center">
                              {[...Array(5)].map((_, i) => (
                                <Star
                                  key={i}
                                  className={`h-4 w-4 ${
                                    i < service.rating! ? 'text-yellow-500 fill-current' : 'text-gray-300'
                                  }`}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {service.warranty && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
                          <div className="flex items-center">
                            <Shield className="h-4 w-4 text-green-600 mr-2" />
                            <span className="text-sm font-medium text-green-800">
                              Warranty Coverage until {new Date(service.warranty.expires).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      )}

                      {service.photos.length > 0 && (
                        <div>
                          <p className="text-sm text-gray-600 mb-2">Service Photos</p>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            {service.photos.map((photo, index) => (
                              <img
                                key={index}
                                src={photo}
                                alt={`Service photo ${index + 1}`}
                                className="w-full h-20 object-cover rounded border cursor-pointer hover:opacity-75"
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'equipment' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {equipment?.map((item) => (
                <div key={item.id} className="bg-white rounded-lg shadow p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h4 className="text-lg font-medium text-gray-900">{item.type}</h4>
                      <p className="text-sm text-gray-600">{item.brand} {item.model}</p>
                    </div>
                    <StatusIndicator 
                      status={item.condition === 'excellent' || item.condition === 'good' ? 'online' : 'warning'} 
                      size="sm" 
                    />
                  </div>

                  <div className="space-y-3 mb-4">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Installed</span>
                      <span className="text-sm font-medium">{new Date(item.installDate).toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Last Service</span>
                      <span className="text-sm font-medium">{new Date(item.lastService).toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Condition</span>
                      <span className={`text-sm font-medium capitalize ${
                        item.condition === 'excellent' ? 'text-green-600' :
                        item.condition === 'good' ? 'text-blue-600' :
                        item.condition === 'fair' ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {item.condition}
                      </span>
                    </div>
                  </div>

                  {item.warrantyCoverage && (
                    <div className="bg-green-50 border border-green-200 rounded p-3 mb-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-green-800">Warranty Active</span>
                        <span className="text-xs text-green-600">
                          Until {new Date(item.warrantyCoverage.expires).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  )}

                  {item.maintenanceTips.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-gray-900 mb-2">Maintenance Tips</p>
                      <ul className="text-xs text-gray-600 space-y-1">
                        {item.maintenanceTips.slice(0, 3).map((tip, index) => (
                          <li key={index} className="flex items-start">
                            <CheckCircle className="h-3 w-3 text-green-500 mr-1 mt-0.5 flex-shrink-0" />
                            {tip}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <button className="w-full bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700">
                      Schedule Maintenance
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'quotes' && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-6">Request a Quote</h3>
              
              <form onSubmit={handleQuoteSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Service Type
                  </label>
                  <select
                    value={quoteRequest.type}
                    onChange={(e) => setQuoteRequest(prev => ({ ...prev, type: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  >
                    <option value="">Select a service type</option>
                    <option value="repair">Repair</option>
                    <option value="installation">Installation</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="inspection">Inspection</option>
                    <option value="emergency">Emergency Service</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={quoteRequest.description}
                    onChange={(e) => setQuoteRequest(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    rows={4}
                    placeholder="Please describe the issue or service needed..."
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Urgency
                  </label>
                  <select
                    value={quoteRequest.urgency}
                    onChange={(e) => setQuoteRequest(prev => ({ ...prev, urgency: e.target.value as any }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="routine">Routine (within 2 weeks)</option>
                    <option value="soon">Soon (within 1 week)</option>
                    <option value="urgent">Urgent (within 3 days)</option>
                    <option value="emergency">Emergency (ASAP)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Photos (optional)
                  </label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                    <Camera className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    <label className="cursor-pointer">
                      <span className="text-blue-600 font-medium">Upload photos</span>
                      <span className="text-gray-600"> or drag and drop</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handlePhotoUpload}
                        className="hidden"
                      />
                    </label>
                    {quoteRequest.photos.length > 0 && (
                      <p className="text-sm text-gray-600 mt-2">
                        {quoteRequest.photos.length} photo(s) selected
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Preferred Contact Method
                  </label>
                  <div className="grid grid-cols-3 gap-4">
                    {(['phone', 'email', 'sms'] as const).map((method) => (
                      <label key={method} className="flex items-center">
                        <input
                          type="radio"
                          name="contactMethod"
                          value={method}
                          checked={quoteRequest.contactMethod === method}
                          onChange={(e) => setQuoteRequest(prev => ({ ...prev, contactMethod: e.target.value as any }))}
                          className="mr-2"
                        />
                        <span className="text-sm text-gray-900 capitalize">{method}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end space-x-4">
                  <button
                    type="button"
                    onClick={() => setShowQuoteForm(false)}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitQuoteRequest.isLoading}
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:bg-blue-400"
                  >
                    {submitQuoteRequest.isLoading ? 'Submitting...' : 'Submit Quote Request'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Additional tabs would be implemented similarly */}
      </div>
    </div>
  );
};

export default CustomerPortal;