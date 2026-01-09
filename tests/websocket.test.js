// Mock WebSocket for Node.js environment
global.WebSocket = jest.fn();

describe('WebSocketManager', () => {
  let wsManager;
  let mockWebSocket;

  beforeEach(() => {
    // Reset WebSocket mock
    global.WebSocket.mockClear();

    // Mock WebSocket constants
    global.WebSocket.OPEN = 1;
    global.WebSocket.CLOSED = 3;

    // Mock WebSocket instance
    mockWebSocket = {
      readyState: WebSocket.OPEN,
      send: jest.fn(),
      close: jest.fn(),
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null
    };

    global.WebSocket.mockImplementation(() => mockWebSocket);

    // Import and create WebSocketManager instance
    // Since it's a browser script, we'll simulate the class
    const WebSocketManagerClass = class WebSocketManager {
      constructor() {
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectInterval = 3000;
        this.isConnected = false;
        this.messageHandlers = {};
      }

      connect(token = null) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const url = token ? `${protocol}//${host}?token=${token}` : `${protocol}//${host}`;

        try {
          this.ws = new WebSocket(url);

          this.ws.onopen = (event) => {
            console.log('WebSocket connected');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.onConnect(event);
          };

          this.ws.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              this.onMessage(data);
            } catch (error) {
              console.error('Error parsing WebSocket message:', error);
            }
          };

          this.ws.onclose = (event) => {
            console.log('WebSocket disconnected:', event.code, event.reason);
            this.isConnected = false;
            this.onDisconnect(event);
            if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
              this.attemptReconnect(token);
            }
          };

          this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.onError(error);
          };

        } catch (error) {
          console.error('Failed to create WebSocket connection:', error);
        }
      }

      attemptReconnect(token) {
        this.reconnectAttempts++;
        console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        setTimeout(() => {
          this.connect(token);
        }, this.reconnectInterval);
      }

      disconnect() {
        if (this.ws) {
          this.ws.close(1000, 'Client disconnect');
        }
      }

      send(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify(message));
        } else {
          console.warn('WebSocket is not connected. Message not sent:', message);
        }
      }

      onConnect(event) {
        // Override in subclasses or set via callback
      }

      onMessage(data) {
        if (data.type && this.messageHandlers[data.type]) {
          this.messageHandlers[data.type](data);
        }
      }

      onDisconnect(event) {
        // Override in subclasses or set via callback
      }

      onError(error) {
        // Override in subclasses or set via callback
      }

      addMessageHandler(type, handler) {
        this.messageHandlers[type] = handler;
      }

      removeMessageHandler(type) {
        delete this.messageHandlers[type];
      }
    };

    wsManager = new WebSocketManagerClass();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('connect', () => {
    test('should create WebSocket connection with token', () => {
      const token = 'test-token';
      wsManager.connect(token);

      expect(global.WebSocket).toHaveBeenCalledWith('ws://localhost/?token=test-token');
    });

    test('should create WebSocket connection without token', () => {
      wsManager.connect();

      expect(global.WebSocket).toHaveBeenCalledWith('ws://localhost/');
    });

    test('should handle connection open', () => {
      wsManager.connect();
      mockWebSocket.onopen();

      expect(wsManager.isConnected).toBe(true);
    });

    test('should handle connection close and attempt reconnection', () => {
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
      wsManager.connect();

      mockWebSocket.onclose({ code: 1006, reason: 'Connection lost', wasClean: false });

      expect(wsManager.isConnected).toBe(false);
      expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 3000);

      setTimeoutSpy.mockRestore();
    });
  });

  describe('send', () => {
    test('should send message when connected', () => {
      wsManager.connect();
      mockWebSocket.onopen();

      const message = { type: 'test', data: 'hello' };
      wsManager.send(message);

      expect(mockWebSocket.send).toHaveBeenCalledWith(JSON.stringify(message));
    });

    test('should not send message when not connected', () => {
      const message = { type: 'test', data: 'hello' };
      wsManager.send(message);

      expect(mockWebSocket.send).not.toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    test('should close WebSocket connection', () => {
      wsManager.connect();
      wsManager.disconnect();

      expect(mockWebSocket.close).toHaveBeenCalledWith(1000, 'Client disconnect');
    });
  });

  describe('message handling', () => {
    test('should handle notification messages', () => {
      const mockHandler = jest.fn();
      wsManager.addMessageHandler('notification', mockHandler);

      wsManager.connect();
      mockWebSocket.onopen();

      const messageData = { type: 'notification', notification: { title: 'Test' } };
      mockWebSocket.onmessage({ data: JSON.stringify(messageData) });

      expect(mockHandler).toHaveBeenCalledWith(messageData);
    });

    test('should handle appointment_update messages', () => {
      const mockHandler = jest.fn();
      wsManager.addMessageHandler('appointment_update', mockHandler);

      wsManager.connect();
      mockWebSocket.onopen();

      const messageData = { type: 'appointment_update', appointment: { id: 1, status: 'confirmed' } };
      mockWebSocket.onmessage({ data: JSON.stringify(messageData) });

      expect(mockHandler).toHaveBeenCalledWith(messageData);
    });

    test('should handle message messages', () => {
      const mockHandler = jest.fn();
      wsManager.addMessageHandler('message', mockHandler);

      wsManager.connect();
      mockWebSocket.onopen();

      const messageData = { type: 'message', message: { sender: 'John', content: 'Hello' } };
      mockWebSocket.onmessage({ data: JSON.stringify(messageData) });

      expect(mockHandler).toHaveBeenCalledWith(messageData);
    });
  });

  describe('error handling', () => {
    test('should handle WebSocket errors', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      wsManager.connect();

      const error = new Error('WebSocket error');
      mockWebSocket.onerror(error);

      expect(consoleSpy).toHaveBeenCalledWith('WebSocket error:', error);

      consoleSpy.mockRestore();
    });

    test('should handle invalid JSON messages', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      wsManager.connect();
      mockWebSocket.onopen();

      mockWebSocket.onmessage({ data: 'invalid json' });

      expect(consoleSpy).toHaveBeenCalledWith('Error parsing WebSocket message:', expect.any(SyntaxError));

      consoleSpy.mockRestore();
    });
  });
});
