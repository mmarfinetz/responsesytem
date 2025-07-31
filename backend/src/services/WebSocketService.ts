import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { logger } from '../utils/logger';
import { DatabaseService } from './DatabaseService';
import jwt from 'jsonwebtoken';

export interface WebSocketUser {
  id: string;
  name: string;
  role: 'admin' | 'manager' | 'technician' | 'dispatcher';
  socketId: string;
  connectedAt: Date;
  lastActivity: Date;
  rooms: string[];
}

export interface WebSocketEvent {
  type: string;
  data: any;
  userId?: string;
  room?: string;
  broadcast?: boolean;
}

export interface DashboardUpdate {
  type: 'notification' | 'conversation_update' | 'job_update' | 'customer_update' | 'system_alert' | 'user_activity';
  data: any;
  timestamp: Date;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export class WebSocketService {
  private io: SocketIOServer;
  private connectedUsers = new Map<string, WebSocketUser>();
  private userSockets = new Map<string, string[]>(); // userId -> socketIds[]
  private roomUsers = new Map<string, Set<string>>(); // room -> userIds
  
  // Activity tracking
  private activityTimeoutMs = 5 * 60 * 1000; // 5 minutes
  private activityCheckInterval?: NodeJS.Timeout;
  
  // Performance metrics
  private metrics = {
    totalConnections: 0,
    activeConnections: 0,
    messagesSent: 0,
    messagesReceived: 0,
    lastActivity: new Date()
  };

  constructor(private httpServer: HttpServer, private db: DatabaseService) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000
    });

    this.setupEventHandlers();
    this.startActivityMonitoring();
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupEventHandlers(): void {
    this.io.use(this.authenticateSocket.bind(this));

    this.io.on('connection', (socket: Socket) => {
      this.handleConnection(socket);
    });

    logger.info('WebSocket service initialized');
  }

  /**
   * Authenticate socket connection using JWT
   */
  private async authenticateSocket(socket: Socket, next: (err?: Error) => void): Promise<void> {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      
      // Get user details from database
      const knex = await this.db.getKnex();
      const user = await knex('users').where({ id: decoded.userId }).first();
      
      if (!user || !user.is_active) {
        return next(new Error('Invalid or inactive user'));
      }

      // Attach user to socket
      socket.data.user = {
        id: user.id,
        name: user.name,
        role: user.role,
        email: user.email
      };

      next();
    } catch (error) {
      logger.error('Socket authentication failed', { error: error.message });
      next(new Error('Authentication failed'));
    }
  }

  /**
   * Handle new socket connection
   */
  private handleConnection(socket: Socket): void {
    const user = socket.data.user;
    this.metrics.totalConnections++;
    this.metrics.activeConnections++;
    this.metrics.lastActivity = new Date();

    logger.info('User connected to WebSocket', {
      userId: user.id,
      userName: user.name,
      socketId: socket.id,
      totalConnections: this.metrics.activeConnections
    });

    // Register user connection
    this.registerUser(socket, user);

    // Setup socket event handlers
    this.setupSocketHandlers(socket);

    // Send initial data
    this.sendInitialData(socket, user);

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      this.handleDisconnection(socket, reason);
    });
  }

  /**
   * Register user connection
   */
  private registerUser(socket: Socket, user: any): void {
    const webSocketUser: WebSocketUser = {
      id: user.id,
      name: user.name,
      role: user.role,
      socketId: socket.id,
      connectedAt: new Date(),
      lastActivity: new Date(),
      rooms: []
    };

    this.connectedUsers.set(socket.id, webSocketUser);

    // Track multiple sockets per user
    if (!this.userSockets.has(user.id)) {
      this.userSockets.set(user.id, []);
    }
    this.userSockets.get(user.id)!.push(socket.id);

    // Join user to their personal room
    socket.join(user.id);
    webSocketUser.rooms.push(user.id);

    // Join role-based rooms
    socket.join(`role:${user.role}`);
    webSocketUser.rooms.push(`role:${user.role}`);

    // Join general dashboard room
    socket.join('dashboard');
    webSocketUser.rooms.push('dashboard');

    // Update room user tracking
    this.updateRoomUsers(user.id, webSocketUser.rooms, 'join');

    // Broadcast user connection to other users
    socket.broadcast.emit('user_connected', {
      userId: user.id,
      userName: user.name,
      timestamp: new Date()
    });
  }

  /**
   * Setup individual socket event handlers
   */
  private setupSocketHandlers(socket: Socket): void {
    const user = socket.data.user;

    // Handle activity tracking
    socket.on('activity', () => {
      this.updateUserActivity(socket.id);
    });

    // Handle joining custom rooms (e.g., specific job or customer)
    socket.on('join_room', (room: string) => {
      this.joinRoom(socket, room);
    });

    socket.on('leave_room', (room: string) => {
      this.leaveRoom(socket, room);
    });

    // Handle dashboard actions
    socket.on('dashboard_action', (action: any) => {
      this.handleDashboardAction(socket, action);
    });

    // Handle notification actions
    socket.on('notification_action', (action: any) => {
      this.handleNotificationAction(socket, action);
    });

    // Handle conversation updates
    socket.on('conversation_update', (update: any) => {
      this.handleConversationUpdate(socket, update);
    });

    // Handle typing indicators
    socket.on('typing_start', (data: any) => {
      socket.broadcast.to(data.conversationId).emit('user_typing', {
        userId: user.id,
        userName: user.name,
        conversationId: data.conversationId
      });
    });

    socket.on('typing_stop', (data: any) => {
      socket.broadcast.to(data.conversationId).emit('user_stopped_typing', {
        userId: user.id,
        conversationId: data.conversationId
      });
    });

    // Handle generic message routing
    socket.on('message', (message: any) => {
      this.handleMessage(socket, message);
      this.metrics.messagesReceived++;
    });
  }

  /**
   * Send initial data to newly connected user
   */
  private async sendInitialData(socket: Socket, user: any): Promise<void> {
    try {
      // Send user profile
      socket.emit('user_profile', {
        id: user.id,
        name: user.name,
        role: user.role,
        connectedAt: new Date()
      });

      // Send active users count
      socket.emit('system_status', {
        activeUsers: this.metrics.activeConnections,
        serverTime: new Date()
      });

      // Send recent notifications (if any)
      // This would integrate with NotificationService
      const recentNotifications = await this.getRecentNotifications(user.id);
      if (recentNotifications.length > 0) {
        socket.emit('recent_notifications', recentNotifications);
      }

      logger.debug('Sent initial data to user', { userId: user.id, socketId: socket.id });
    } catch (error) {
      logger.error('Failed to send initial data', { error, userId: user.id });
    }
  }

  /**
   * Handle socket disconnection
   */
  private handleDisconnection(socket: Socket, reason: string): void {
    const user = this.connectedUsers.get(socket.id);
    if (!user) return;

    this.metrics.activeConnections--;

    logger.info('User disconnected from WebSocket', {
      userId: user.id,
      userName: user.name,
      socketId: socket.id,
      reason,
      connectedDuration: Date.now() - user.connectedAt.getTime(),
      activeConnections: this.metrics.activeConnections
    });

    // Update user socket tracking
    const userSocketIds = this.userSockets.get(user.id) || [];
    const updatedSocketIds = userSocketIds.filter(id => id !== socket.id);
    
    if (updatedSocketIds.length === 0) {
      // User has no more active connections
      this.userSockets.delete(user.id);
      this.updateRoomUsers(user.id, user.rooms, 'leave');
      
      // Broadcast user disconnection
      socket.broadcast.emit('user_disconnected', {
        userId: user.id,
        userName: user.name,
        timestamp: new Date()
      });
    } else {
      this.userSockets.set(user.id, updatedSocketIds);
    }

    // Remove from connected users
    this.connectedUsers.delete(socket.id);
  }

  /**
   * Send message to specific user
   */
  sendToUser(userId: string, event: string, data: any): boolean {
    const socketIds = this.userSockets.get(userId);
    if (!socketIds || socketIds.length === 0) {
      logger.debug('User not connected', { userId, event });
      return false;
    }

    let sent = false;
    socketIds.forEach(socketId => {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit(event, {
          ...data,
          timestamp: new Date(),
          userId: userId
        });
        sent = true;
      }
    });

    if (sent) {
      this.metrics.messagesSent++;
      logger.debug('Message sent to user', { userId, event, socketCount: socketIds.length });
    }

    return sent;
  }

  /**
   * Send message to room
   */
  sendToRoom(room: string, event: string, data: any): number {
    const userIds = this.roomUsers.get(room);
    if (!userIds || userIds.size === 0) {
      logger.debug('Room is empty', { room, event });
      return 0;
    }

    this.io.to(room).emit(event, {
      ...data,
      timestamp: new Date(),
      room: room
    });

    this.metrics.messagesSent++;
    logger.debug('Message sent to room', { room, event, userCount: userIds.size });

    return userIds.size;
  }

  /**
   * Broadcast message to all connected users
   */
  broadcast(event: string, data: any): number {
    this.io.emit(event, {
      ...data,
      timestamp: new Date()
    });

    this.metrics.messagesSent++;
    logger.debug('Message broadcasted', { event, userCount: this.metrics.activeConnections });

    return this.metrics.activeConnections;
  }

  /**
   * Send dashboard update
   */
  sendDashboardUpdate(update: DashboardUpdate): number {
    const eventData = {
      type: update.type,
      data: update.data,
      timestamp: update.timestamp,
      priority: update.priority
    };

    // Send to all dashboard users
    return this.sendToRoom('dashboard', 'dashboard_update', eventData);
  }

  /**
   * Send real-time notification
   */
  sendNotification(
    userId: string | string[] | 'all',
    notification: {
      id: string;
      type: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      title: string;
      message: string;
      data?: any;
    }
  ): number {
    const eventData = {
      ...notification,
      timestamp: new Date()
    };

    let recipientCount = 0;

    if (userId === 'all') {
      recipientCount = this.broadcast('notification', eventData);
    } else if (Array.isArray(userId)) {
      userId.forEach(id => {
        if (this.sendToUser(id, 'notification', eventData)) {
          recipientCount++;
        }
      });
    } else {
      recipientCount = this.sendToUser(userId, 'notification', eventData) ? 1 : 0;
    }

    logger.info('Notification sent via WebSocket', {
      notificationId: notification.id,
      severity: notification.severity,
      recipientCount
    });

    return recipientCount;
  }

  /**
   * Get connected users
   */
  getConnectedUsers(): WebSocketUser[] {
    return Array.from(this.connectedUsers.values());
  }

  /**
   * Get user connection status
   */
  isUserConnected(userId: string): boolean {
    return this.userSockets.has(userId);
  }

  /**
   * Get service metrics
   */
  getMetrics(): typeof this.metrics {
    return { ...this.metrics };
  }

  /**
   * Get users in room
   */
  getUsersInRoom(room: string): string[] {
    return Array.from(this.roomUsers.get(room) || []);
  }

  // Private helper methods

  private joinRoom(socket: Socket, room: string): void {
    const user = this.connectedUsers.get(socket.id);
    if (!user) return;

    socket.join(room);
    user.rooms.push(room);
    this.updateRoomUsers(user.id, [room], 'join');

    logger.debug('User joined room', { userId: user.id, room });
  }

  private leaveRoom(socket: Socket, room: string): void {
    const user = this.connectedUsers.get(socket.id);
    if (!user) return;

    socket.leave(room);
    user.rooms = user.rooms.filter(r => r !== room);
    this.updateRoomUsers(user.id, [room], 'leave');

    logger.debug('User left room', { userId: user.id, room });
  }

  private updateRoomUsers(userId: string, rooms: string[], action: 'join' | 'leave'): void {
    rooms.forEach(room => {
      if (!this.roomUsers.has(room)) {
        this.roomUsers.set(room, new Set());
      }

      const roomUsers = this.roomUsers.get(room)!;
      if (action === 'join') {
        roomUsers.add(userId);
      } else {
        roomUsers.delete(userId);
        if (roomUsers.size === 0) {
          this.roomUsers.delete(room);
        }
      }
    });
  }

  private updateUserActivity(socketId: string): void {
    const user = this.connectedUsers.get(socketId);
    if (user) {
      user.lastActivity = new Date();
    }
  }

  private startActivityMonitoring(): void {
    this.activityCheckInterval = setInterval(() => {
      this.checkInactiveUsers();
    }, this.activityTimeoutMs);
  }

  private checkInactiveUsers(): void {
    const now = Date.now();
    const inactiveThreshold = now - this.activityTimeoutMs;

    this.connectedUsers.forEach((user, socketId) => {
      if (user.lastActivity.getTime() < inactiveThreshold) {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          logger.info('Disconnecting inactive user', {
            userId: user.id,
            inactiveMinutes: (now - user.lastActivity.getTime()) / (1000 * 60)
          });
          socket.disconnect(true);
        }
      }
    });
  }

  private async getRecentNotifications(userId: string): Promise<any[]> {
    try {
      const knex = await this.db.getKnex();
      const notifications = await knex('notification_deliveries as nd')
        .join('notifications as n', 'nd.notification_id', 'n.id')
        .where('nd.user_id', userId)
        .where('nd.status', 'sent')
        .where('n.created_at', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
        .select('n.*')
        .orderBy('n.created_at', 'desc')
        .limit(10);

      return notifications.map(row => ({
        id: row.id,
        type: row.type,
        severity: row.severity,
        title: row.title,
        message: row.message,
        data: JSON.parse(row.data || '{}'),
        createdAt: row.created_at
      }));
    } catch (error) {
      logger.error('Failed to get recent notifications', { error, userId });
      return [];
    }
  }

  private handleDashboardAction(socket: Socket, action: any): void {
    const user = socket.data.user;
    logger.debug('Dashboard action received', { userId: user.id, action });
    
    // Handle specific dashboard actions like refreshing data, filtering, etc.
    switch (action.type) {
      case 'refresh_data':
        this.sendInitialData(socket, user);
        break;
      case 'filter_change':
        // Handle filter changes
        break;
      default:
        logger.warn('Unknown dashboard action', { action: action.type });
    }
  }

  private handleNotificationAction(socket: Socket, action: any): void {
    const user = socket.data.user;
    logger.debug('Notification action received', { userId: user.id, action });
    
    // Handle notification-specific actions like mark as read, dismiss, etc.
    // This would integrate with NotificationService
  }

  private handleConversationUpdate(socket: Socket, update: any): void {
    const user = socket.data.user;
    logger.debug('Conversation update received', { userId: user.id, update });
    
    // Broadcast conversation updates to relevant users
    if (update.conversationId) {
      socket.broadcast.to(update.conversationId).emit('conversation_updated', {
        ...update,
        updatedBy: {
          id: user.id,
          name: user.name
        },
        timestamp: new Date()
      });
    }
  }

  private handleMessage(socket: Socket, message: any): void {
    const user = socket.data.user;
    logger.debug('Generic message received', { userId: user.id, messageType: message.type });
    
    // Handle generic message routing based on type
    if (message.room) {
      socket.broadcast.to(message.room).emit('message', {
        ...message,
        from: {
          id: user.id,
          name: user.name
        },
        timestamp: new Date()
      });
    }
  }

  /**
   * Cleanup on service shutdown
   */
  shutdown(): void {
    if (this.activityCheckInterval) {
      clearInterval(this.activityCheckInterval);
    }

    this.io.close();
    logger.info('WebSocket service shut down');
  }
}