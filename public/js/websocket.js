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
=======
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
