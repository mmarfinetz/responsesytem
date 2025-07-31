import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  MapPin, 
  Phone, 
  MessageSquare, 
  Camera, 
  Mic, 
  Clock, 
  User, 
  Wrench, 
  CheckCircle,
  AlertCircle,
  Navigation,
  Upload,
  DollarSign,
  History,
  Bot,
  Settings
} from 'lucide-react';
import { apiClient } from '@/services/api';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import { MetricCard } from '@/components/ui/MetricCard';

interface Job {
  id: string;
  customerId: string;
  customer: {
    name: string;
    phone: string;
    address: string;
    preferredContact: 'sms' | 'call' | 'email';
    notes?: string;
  };
  type: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'assigned' | 'en_route' | 'arrived' | 'in_progress' | 'completed';
  description: string;
  estimatedDuration: number;
  scheduledTime: Date;
  equipment?: string[];
  specialInstructions?: string;
  photos: string[];
  notes: string[];
}

interface CustomerHistory {
  jobHistory: Array<{
    id: string;
    date: Date;
    type: string;
    description: string;
    outcome: string;
  }>;
  equipment: Array<{
    type: string;
    model: string;
    installDate: Date;
    lastService: Date;
    warrantyExpires?: Date;
  }>;
  preferences: {
    contactMethod: string;
    schedule: string;
    notes: string;
  };
}

interface AIAssistance {
  diagnosis: string;
  recommendations: string[];
  partsNeeded: string[];
  estimatedTime: number;
  difficultyLevel: 'easy' | 'medium' | 'hard';
  safetyNotes: string[];
}

const TechnicianMobile: React.FC = () => {
  const [currentJob, setCurrentJob] = useState<Job | null>(null);
  const [location, setLocation] = useState<GeolocationPosition | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [activeTab, setActiveTab] = useState<'job' | 'customer' | 'ai' | 'docs'>('job');
  const [photos, setPhotos] = useState<File[]>([]);
  const queryClient = useQueryClient();

  // Get current location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => setLocation(position),
        (error) => console.error('Location error:', error),
        { enableHighAccuracy: true }
      );
    }
  }, []);

  // Fetch current technician's active job
  const { data: activeJob, isLoading: jobLoading } = useQuery<Job>(
    'active-job',
    () => apiClient.jobs.getActive(),
    {
      refetchInterval: 30000, // Refresh every 30 seconds
      onSuccess: (data) => setCurrentJob(data),
    }
  );

  // Fetch customer history
  const { data: customerHistory } = useQuery<CustomerHistory>(
    ['customer-history', currentJob?.customerId],
    () => apiClient.customers.getHistory(currentJob!.customerId),
    {
      enabled: !!currentJob?.customerId,
    }
  );

  // Fetch AI assistance
  const { data: aiAssistance, isLoading: aiLoading } = useQuery<AIAssistance>(
    ['ai-assistance', currentJob?.id, currentJob?.description],
    () => apiClient.ai.getJobAssistance(currentJob!.id, currentJob!.description),
    {
      enabled: !!currentJob?.id && activeTab === 'ai',
    }
  );

  // Update job status mutation
  const updateJobStatus = useMutation(
    (status: Job['status']) => 
      apiClient.jobs.updateStatus(currentJob!.id, { 
        status,
        location: location ? {
          lat: location.coords.latitude,
          lng: location.coords.longitude
        } : undefined
      }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('active-job');
      },
    }
  );

  // Add job note mutation
  const addJobNote = useMutation(
    (note: string) => apiClient.jobs.addNote(currentJob!.id, { note }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('active-job');
      },
    }
  );

  // Upload photo mutation
  const uploadPhoto = useMutation(
    (photo: File) => {
      const formData = new FormData();
      formData.append('photo', photo);
      return apiClient.jobs.uploadPhoto(currentJob!.id, formData);
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('active-job');
        setPhotos([]);
      },
    }
  );

  const handleStatusUpdate = (status: Job['status']) => {
    updateJobStatus.mutate(status);
  };

  const handlePhotoCapture = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setPhotos(prev => [...prev, ...files]);
  };

  const handleUploadPhotos = () => {
    photos.forEach(photo => {
      uploadPhoto.mutate(photo);
    });
  };

  const handleCall = (phone: string) => {
    window.open(`tel:${phone}`);
  };

  const handleMessage = (phone: string) => {
    window.open(`sms:${phone}`);
  };

  const handleNavigation = (address: string) => {
    const encodedAddress = encodeURIComponent(address);
    window.open(`https://maps.google.com?q=${encodedAddress}`);
  };

  const startVoiceNote = () => {
    // TODO: Implement voice recording
    setIsRecording(true);
    console.log('Starting voice recording...');
  };

  const stopVoiceNote = () => {
    setIsRecording(false);
    // TODO: Process voice note
    console.log('Stopping voice recording...');
  };

  if (jobLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading job details...</p>
        </div>
      </div>
    );
  }

  if (!currentJob) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <Wrench className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Active Job</h2>
          <p className="text-gray-600">You don't have any active jobs at the moment.</p>
        </div>
      </div>
    );
  }

  const statusColor = {
    assigned: 'warning' as const,
    en_route: 'processing' as const,
    arrived: 'pending' as const,
    in_progress: 'processing' as const,
    completed: 'online' as const,
  };

  const priorityColor = {
    low: 'bg-blue-500',
    medium: 'bg-yellow-500',
    high: 'bg-orange-500',
    critical: 'bg-red-500',
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Job #{currentJob.id}</h1>
              <StatusIndicator status={statusColor[currentJob.status]} label={currentJob.status.replace('_', ' ')} />
            </div>
            <div className="flex items-center space-x-2">
              <div className={`px-2 py-1 rounded text-xs font-medium text-white ${priorityColor[currentJob.priority]}`}>
                {currentJob.priority.toUpperCase()}
              </div>
              <Settings className="h-5 w-5 text-gray-500" />
            </div>
          </div>
        </div>
      </div>

      {/* Job Status Actions */}
      <div className="bg-white border-b px-4 py-3">
        <div className="grid grid-cols-4 gap-2">
          {currentJob.status === 'assigned' && (
            <button
              onClick={() => handleStatusUpdate('en_route')}
              className="bg-blue-600 text-white px-3 py-2 rounded text-sm font-medium"
            >
              En Route
            </button>
          )}
          {currentJob.status === 'en_route' && (
            <button
              onClick={() => handleStatusUpdate('arrived')}
              className="bg-green-600 text-white px-3 py-2 rounded text-sm font-medium"
            >
              Arrived
            </button>
          )}
          {currentJob.status === 'arrived' && (
            <button
              onClick={() => handleStatusUpdate('in_progress')}
              className="bg-purple-600 text-white px-3 py-2 rounded text-sm font-medium"
            >
              Start Work
            </button>
          )}
          {currentJob.status === 'in_progress' && (
            <button
              onClick={() => handleStatusUpdate('completed')}
              className="bg-green-600 text-white px-3 py-2 rounded text-sm font-medium"
            >
              Complete
            </button>
          )}
          
          <button
            onClick={() => handleCall(currentJob.customer.phone)}
            className="flex items-center justify-center bg-green-100 text-green-700 px-3 py-2 rounded"
          >
            <Phone className="h-4 w-4" />
          </button>
          
          <button
            onClick={() => handleMessage(currentJob.customer.phone)}
            className="flex items-center justify-center bg-blue-100 text-blue-700 px-3 py-2 rounded"
          >
            <MessageSquare className="h-4 w-4" />
          </button>
          
          <button
            onClick={() => handleNavigation(currentJob.customer.address)}
            className="flex items-center justify-center bg-purple-100 text-purple-700 px-3 py-2 rounded"
          >
            <Navigation className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white border-b">
        <div className="flex">
          {[
            { key: 'job', label: 'Job Details', icon: Wrench },
            { key: 'customer', label: 'Customer', icon: User },
            { key: 'ai', label: 'AI Help', icon: Bot },
            { key: 'docs', label: 'Documentation', icon: Camera },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as any)}
              className={`flex-1 py-3 px-2 text-center border-b-2 transition-colors ${
                activeTab === key 
                  ? 'border-blue-600 text-blue-600 bg-blue-50' 
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="h-4 w-4 mx-auto mb-1" />
              <div className="text-xs font-medium">{label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 p-4 space-y-4">
        {activeTab === 'job' && (
          <>
            {/* Job Overview */}
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Job Overview</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-600">Type</p>
                  <p className="font-medium">{currentJob.type}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Description</p>
                  <p className="text-gray-900">{currentJob.description}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Estimated Duration</p>
                  <p className="font-medium flex items-center">
                    <Clock className="h-4 w-4 mr-1" />
                    {currentJob.estimatedDuration} minutes
                  </p>
                </div>
                {currentJob.specialInstructions && (
                  <div>
                    <p className="text-sm text-gray-600">Special Instructions</p>
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mt-1">
                      <p className="text-yellow-800">{currentJob.specialInstructions}</p>
                    </div>
                  </div>
                )}
                {currentJob.equipment && currentJob.equipment.length > 0 && (
                  <div>
                    <p className="text-sm text-gray-600 mb-2">Required Equipment</p>
                    <div className="flex flex-wrap gap-2">
                      {currentJob.equipment.map((item, index) => (
                        <span key={index} className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-sm">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Customer Contact */}
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Customer Contact</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{currentJob.customer.name}</p>
                    <p className="text-sm text-gray-600">{currentJob.customer.phone}</p>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleCall(currentJob.customer.phone)}
                      className="bg-green-100 text-green-700 p-2 rounded-full"
                    >
                      <Phone className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleMessage(currentJob.customer.phone)}
                      className="bg-blue-100 text-blue-700 p-2 rounded-full"
                    >
                      <MessageSquare className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="flex items-start space-x-2">
                  <MapPin className="h-4 w-4 text-gray-500 mt-1" />
                  <div className="flex-1">
                    <p className="text-gray-900">{currentJob.customer.address}</p>
                    <button
                      onClick={() => handleNavigation(currentJob.customer.address)}
                      className="text-blue-600 text-sm font-medium mt-1"
                    >
                      Get Directions →
                    </button>
                  </div>
                </div>
                {currentJob.customer.notes && (
                  <div className="bg-blue-50 border border-blue-200 rounded p-3">
                    <p className="text-blue-800 text-sm">{currentJob.customer.notes}</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {activeTab === 'customer' && customerHistory && (
          <>
            {/* Customer Preferences */}
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Customer Preferences</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Preferred Contact:</span>
                  <span className="font-medium">{customerHistory.preferences.contactMethod}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Best Schedule:</span>
                  <span className="font-medium">{customerHistory.preferences.schedule}</span>
                </div>
                {customerHistory.preferences.notes && (
                  <div className="bg-gray-50 rounded p-3 mt-3">
                    <p className="text-sm text-gray-800">{customerHistory.preferences.notes}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Equipment History */}
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Equipment</h3>
              <div className="space-y-3">
                {customerHistory.equipment.map((item, index) => (
                  <div key={index} className="border border-gray-200 rounded p-3">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-medium">{item.type}</p>
                        <p className="text-sm text-gray-600">{item.model}</p>
                      </div>
                      {item.warrantyExpires && new Date(item.warrantyExpires) > new Date() && (
                        <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">
                          Under Warranty
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 space-y-1">
                      <p>Installed: {new Date(item.installDate).toLocaleDateString()}</p>
                      <p>Last Service: {new Date(item.lastService).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Job History */}
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Recent Job History</h3>
              <div className="space-y-3">
                {customerHistory.jobHistory.slice(0, 5).map((job, index) => (
                  <div key={index} className="flex items-start space-x-3 pb-3 border-b border-gray-100 last:border-0">
                    <History className="h-4 w-4 text-gray-400 mt-1" />
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-sm">{job.type}</p>
                          <p className="text-xs text-gray-600">{job.description}</p>
                        </div>
                        <span className="text-xs text-gray-500">
                          {new Date(job.date).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-xs text-green-600 mt-1">{job.outcome}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {activeTab === 'ai' && (
          <>
            {aiLoading ? (
              <div className="bg-white rounded-lg shadow p-4">
                <div className="animate-pulse space-y-3">
                  <div className="h-4 bg-gray-300 rounded w-3/4"></div>
                  <div className="h-4 bg-gray-300 rounded w-1/2"></div>
                  <div className="h-4 bg-gray-300 rounded w-5/6"></div>
                </div>
              </div>
            ) : aiAssistance && (
              <>
                {/* AI Diagnosis */}
                <div className="bg-white rounded-lg shadow p-4">
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                    <Bot className="h-5 w-5 mr-2 text-blue-600" />
                    AI Diagnosis
                  </h3>
                  <div className="bg-blue-50 border border-blue-200 rounded p-4">
                    <p className="text-blue-900">{aiAssistance.diagnosis}</p>
                  </div>
                  <div className="mt-3 flex justify-between text-sm">
                    <span className="text-gray-600">Difficulty: 
                      <span className={`ml-1 font-medium ${
                        aiAssistance.difficultyLevel === 'easy' ? 'text-green-600' :
                        aiAssistance.difficultyLevel === 'medium' ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                        {aiAssistance.difficultyLevel}
                      </span>
                    </span>
                    <span className="text-gray-600">
                      Est. Time: {aiAssistance.estimatedTime}min
                    </span>
                  </div>
                </div>

                {/* Recommendations */}
                <div className="bg-white rounded-lg shadow p-4">
                  <h3 className="font-semibold text-gray-900 mb-3">Recommendations</h3>
                  <div className="space-y-2">
                    {aiAssistance.recommendations.map((rec, index) => (
                      <div key={index} className="flex items-start space-x-2">
                        <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                        <p className="text-sm text-gray-800">{rec}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Parts Needed */}
                {aiAssistance.partsNeeded.length > 0 && (
                  <div className="bg-white rounded-lg shadow p-4">
                    <h3 className="font-semibold text-gray-900 mb-3">Parts Needed</h3>
                    <div className="space-y-2">
                      {aiAssistance.partsNeeded.map((part, index) => (
                        <div key={index} className="flex items-center justify-between bg-gray-50 rounded p-2">
                          <span className="text-sm text-gray-800">{part}</span>
                          <button className="text-blue-600 text-xs font-medium">
                            Check Stock
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Safety Notes */}
                {aiAssistance.safetyNotes.length > 0 && (
                  <div className="bg-white rounded-lg shadow p-4">
                    <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                      <AlertCircle className="h-5 w-5 mr-2 text-red-500" />
                      Safety Notes
                    </h3>
                    <div className="space-y-2">
                      {aiAssistance.safetyNotes.map((note, index) => (
                        <div key={index} className="flex items-start space-x-2">
                          <AlertCircle className="h-4 w-4 text-red-500 mt-0.5" />
                          <p className="text-sm text-red-800">{note}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {activeTab === 'docs' && (
          <>
            {/* Photo Capture */}
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Photo Documentation</h3>
              <div className="space-y-4">
                <div className="flex space-x-2">
                  <label className="flex-1 bg-blue-600 text-white px-4 py-2 rounded font-medium text-center cursor-pointer">
                    <Camera className="h-4 w-4 inline mr-2" />
                    Take Photo
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhotoCapture}
                      className="hidden"
                      multiple
                    />
                  </label>
                  <button
                    onClick={handleUploadPhotos}
                    disabled={photos.length === 0}
                    className="bg-green-600 text-white px-4 py-2 rounded font-medium disabled:bg-gray-400"
                  >
                    <Upload className="h-4 w-4" />
                  </button>
                </div>
                
                {photos.length > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded p-3">
                    <p className="text-blue-800 text-sm">
                      {photos.length} photo(s) ready to upload
                    </p>
                  </div>
                )}

                {/* Existing Photos */}
                {currentJob.photos.length > 0 && (
                  <div>
                    <p className="text-sm text-gray-600 mb-2">Job Photos</p>
                    <div className="grid grid-cols-2 gap-2">
                      {currentJob.photos.map((photo, index) => (
                        <img
                          key={index}
                          src={photo}
                          alt={`Job photo ${index + 1}`}
                          className="w-full h-24 object-cover rounded border"
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Voice Notes */}
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Voice Notes</h3>
              <div className="flex space-x-2">
                <button
                  onClick={isRecording ? stopVoiceNote : startVoiceNote}
                  className={`flex-1 px-4 py-2 rounded font-medium ${
                    isRecording 
                      ? 'bg-red-600 text-white' 
                      : 'bg-blue-600 text-white'
                  }`}
                >
                  <Mic className="h-4 w-4 inline mr-2" />
                  {isRecording ? 'Stop Recording' : 'Start Voice Note'}
                </button>
              </div>
              {isRecording && (
                <div className="mt-3 bg-red-50 border border-red-200 rounded p-3">
                  <p className="text-red-800 text-sm flex items-center">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse mr-2"></div>
                    Recording in progress...
                  </p>
                </div>
              )}
            </div>

            {/* Job Notes */}
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Job Notes</h3>
              <div className="space-y-3">
                {currentJob.notes.map((note, index) => (
                  <div key={index} className="bg-gray-50 rounded p-3">
                    <p className="text-sm text-gray-800">{note}</p>
                  </div>
                ))}
                <textarea
                  placeholder="Add a note..."
                  className="w-full p-3 border border-gray-300 rounded-lg resize-none"
                  rows={3}
                  onBlur={(e) => {
                    if (e.target.value.trim()) {
                      addJobNote.mutate(e.target.value.trim());
                      e.target.value = '';
                    }
                  }}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default TechnicianMobile;