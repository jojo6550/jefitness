// WebSocket Chat Client
class ChatWebSocket {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.messageHandlers = {};
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
  }

  connect(token) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname === 'localhost' ? 'localhost:10000' : window.location.host;
    const wsUrl = `${protocol}//${host}?token=${token}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.isConnected = true;
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.isConnected = false;
      this.attemptReconnect(token);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
    }
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.error('WebSocket is not connected');
    }
  }

  handleMessage(message) {
    const handler = this.messageHandlers[message.type];
    if (handler) {
      handler(message);
    } else {
      console.log('Unhandled message type:', message.type);
    }
  }

  addMessageHandler(type, handler) {
    this.messageHandlers[type] = handler;
  }

  removeMessageHandler(type) {
    delete this.messageHandlers[type];
  }

  // Add method to check connection status
  isConnected() {
    return this.isConnected;
  }

  // Chat-specific methods
  sendChatMessage(receiverId, receiverRole, content) {
    this.send({
      type: 'chat_message',
      receiverId: receiverId,
      receiverRole: receiverRole,
      content: content
    });
  }

  attemptReconnect(token) {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      // Exponential backoff with jitter
      const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1) + Math.random() * 1000, 30000);
      console.log(`Attempting to reconnect in ${Math.round(delay/1000)}s... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

      setTimeout(() => {
        this.connect(token);
      }, delay);
    } else {
      console.error('Max reconnection attempts reached. Backend may be unavailable.');
    }
  }

  scheduleReconnect(token) {
    // Schedule a reconnection attempt after a longer delay when backend is unavailable
    setTimeout(() => {
      this.reconnectAttempts = 0; // Reset attempts for fresh start
      this.connect(token);
    }, 10000); // Wait 10 seconds before trying again
  }
}

// Initialize global chat WebSocket instance
const chatWS = new ChatWebSocket();

// Export for use in other modules
window.ChatWebSocket = ChatWebSocket;
window.chatWS = chatWS;
