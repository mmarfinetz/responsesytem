import { Router } from 'express';
import { 
  AIController,
  generateResponseValidation,
  analyzeConversationValidation,
  classifyIntentValidation,
  generateVariationsValidation,
  updateResponseFeedbackValidation
} from '../controllers/AIController';

const router = Router();
const aiController = new AIController();

// Generate AI response for customer message
router.post('/generate-response', generateResponseValidation, aiController.generateResponse);

// Analyze conversation for comprehensive insights
router.get('/analyze/:conversationId', analyzeConversationValidation, aiController.analyzeConversation);

// Classify intent for a single message
router.post('/classify-intent/:messageId', classifyIntentValidation, aiController.classifyIntent);

// Generate response variations
router.post('/generate-variations', generateVariationsValidation, aiController.generateVariations);

// Update response with human feedback
router.put('/response/:responseId/feedback', updateResponseFeedbackValidation, aiController.updateResponseFeedback);

// Get AI service statistics
router.get('/stats', aiController.getStats);

// Clear AI service caches (admin endpoint)
router.post('/clear-caches', aiController.clearCaches);

export default router;