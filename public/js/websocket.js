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
    const wsUrl = `${protocol}//${window.location.host}?token=${token}`;

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
      console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

      setTimeout(() => {
        this.connect(token);
      }, this.reconnectDelay * this.reconnectAttempts);
    } else {
      console.error('Max reconnection attempts reached');
    }
  }
}

// Initialize global chat WebSocket instance
const chatWS = new ChatWebSocket();

// Export for use in other modules
window.ChatWebSocket = ChatWebSocket;
window.chatWS = chatWS;
