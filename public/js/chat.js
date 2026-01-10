// Chat Widget Implementation
class ChatWidget {
  constructor() {
    this.currentConversation = null;
    this.conversations = [];
    this.unreadCount = 0;
    this.isMinimized = true;
    this.isConnected = false;

    // DOM elements
    this.toggleBtn = document.getElementById('chat-toggle-btn');
    this.widget = document.getElementById('chat-widget');
    this.minimizeBtn = document.getElementById('chat-minimize-btn');
    this.selection = document.getElementById('chat-selection');
    this.conversation = document.getElementById('chat-conversation');
    this.messagesContainer = document.getElementById('chat-messages');
    this.input = document.getElementById('chat-input');
    this.sendBtn = document.getElementById('chat-send-btn');
    this.unreadBadge = document.getElementById('unread-badge');
    this.limitWarning = document.getElementById('chat-limit-warning');

    this.init();
  }

  init() {
    this.bindEvents();
    this.loadConversations();
    this.connectWebSocket();
    this.updateUnreadBadge();
  }

  bindEvents() {
    // Toggle chat widget
    this.toggleBtn.addEventListener('click', () => this.toggleWidget());

    // Minimize chat widget
    this.minimizeBtn.addEventListener('click', () => this.minimizeWidget());

    // Chat option selection
    document.querySelectorAll('.chat-option-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.selectConversation(e.target.closest('.chat-option-btn').dataset.type));
    });

    // Send message
    this.sendBtn.addEventListener('click', () => this.sendMessage());
    this.input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Input validation
    this.input.addEventListener('input', () => this.validateInput());
  }

  toggleWidget() {
    if (this.widget.style.display === 'none' || this.widget.style.display === '') {
      this.widget.style.display = 'flex';
      this.isMinimized = false;
      this.input.focus();
      this.markCurrentConversationAsRead();
    } else {
      this.minimizeWidget();
    }
  }

  minimizeWidget() {
    this.widget.style.display = 'none';
    this.isMinimized = true;
  }

  selectConversation(type) {
    this.currentConversation = { type };
    this.selection.style.display = 'none';
    this.conversation.style.display = 'flex';
    this.loadChatHistory();
    this.input.focus();
  }

  async loadConversations() {
    try {
      const response = await fetch('/api/chat/conversations', {
        headers: {
          'Authorization': `Bearer ${this.getAuthToken()}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        this.conversations = data.conversations;
        this.updateUnreadCount();
      }
    } catch (error) {
      console.error('Error loading conversations:', error);
    }
  }

  async loadChatHistory() {
    if (!this.currentConversation) return;

    try {
      // For demo purposes, we'll load history for the first conversation
      // In a real app, you'd determine the partner based on type and user role
      const partnerId = this.conversations.length > 0 ? this.conversations[0].partnerId : null;
      if (!partnerId) return;

      const response = await fetch(`/api/chat/history/${partnerId}`, {
        headers: {
          'Authorization': `Bearer ${this.getAuthToken()}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        this.displayMessages(data.messages);
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
    }
  }

  displayMessages(messages) {
    this.messagesContainer.innerHTML = '';
    messages.forEach(message => {
      this.addMessageToUI(message);
    });
    this.scrollToBottom();
  }

  addMessageToUI(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${message.senderId === this.getCurrentUserId() ? 'sent' : 'received'}`;

    const contentDiv = document.createElement('div');
    contentDiv.textContent = message.message;

    const timeDiv = document.createElement('div');
    timeDiv.className = 'chat-message-time';
    timeDiv.textContent = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    messageDiv.appendChild(contentDiv);
    messageDiv.appendChild(timeDiv);
    this.messagesContainer.appendChild(messageDiv);
  }

  sendMessage() {
    const content = this.input.value.trim();
    if (!content || !this.currentConversation) return;

    // Send via WebSocket if connected, otherwise via HTTP
    if (this.isConnected && window.chatWS) {
      this.sendViaWebSocket(content);
    } else {
      this.sendViaHTTP(content);
    }

    // Add message to UI immediately
    const message = {
      senderId: this.getCurrentUserId(),
      message: content,
      timestamp: new Date()
    };
    this.addMessageToUI(message);

    this.input.value = '';
    this.validateInput();
    this.scrollToBottom();
  }

  sendViaWebSocket(content) {
    // Determine receiver based on conversation type
    const receiverId = this.getReceiverId();
    const receiverRole = this.currentConversation.type === 'trainer' ? 'trainer' : 'admin';

    window.chatWS.sendChatMessage(receiverId, receiverRole, content);
  }

  async sendViaHTTP(content) {
    try {
      const receiverId = this.getReceiverId();
      const response = await fetch('/api/chat/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getAuthToken()}`
        },
        body: JSON.stringify({
          receiverId,
          message: content,
          messageType: this.getMessageType()
        })
      });

      if (!response.ok) {
        console.error('Failed to send message via HTTP');
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }

  getReceiverId() {
    // For demo, return first conversation partner
    // In real app, determine based on user role and conversation type
    return this.conversations.length > 0 ? this.conversations[0].partnerId : null;
  }

  getMessageType() {
    const userRole = this.getUserRole();
    const targetRole = this.currentConversation.type;

    if (userRole === 'user' && targetRole === 'trainer') return 'user_to_trainer';
    if (userRole === 'user' && targetRole === 'admin') return 'user_to_admin';
    if (userRole === 'trainer' && targetRole === 'user') return 'trainer_to_user';
    if (userRole === 'admin' && targetRole === 'user') return 'admin_to_user';

    return 'user_to_admin'; // fallback
  }

  connectWebSocket() {
    const token = this.getAuthToken();
    if (token && window.chatWS) {
      window.chatWS.connect(token);
      window.chatWS.addMessageHandler('chat_message', (message) => this.handleIncomingMessage(message));
      this.isConnected = true;
    }
  }

  handleIncomingMessage(message) {
    // Add incoming message to UI
    this.addMessageToUI(message);
    this.scrollToBottom();

    // Update unread count if widget is minimized
    if (this.isMinimized) {
      this.unreadCount++;
      this.updateUnreadBadge();
    }
  }

  validateInput() {
    const content = this.input.value;
    const isValid = content.trim().length > 0 && content.length <= 500;

    this.sendBtn.disabled = !isValid;

    if (content.length > 450) {
      this.limitWarning.style.display = 'block';
    } else {
      this.limitWarning.style.display = 'none';
    }
  }

  updateUnreadCount() {
    this.unreadCount = this.conversations.reduce((total, conv) => total + conv.unreadCount, 0);
    this.updateUnreadBadge();
  }

  updateUnreadBadge() {
    if (this.unreadCount > 0) {
      this.unreadBadge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
      this.unreadBadge.style.display = 'flex';
    } else {
      this.unreadBadge.style.display = 'none';
    }
  }

  markCurrentConversationAsRead() {
    if (this.currentConversation && this.conversations.length > 0) {
      const partnerId = this.conversations[0].partnerId;
      fetch(`/api/chat/mark-read/${partnerId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.getAuthToken()}`
        }
      }).then(() => {
        this.unreadCount = Math.max(0, this.unreadCount - (this.conversations[0].unreadCount || 0));
        this.conversations[0].unreadCount = 0;
        this.updateUnreadBadge();
      });
    }
  }

  scrollToBottom() {
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  getAuthToken() {
    return localStorage.getItem('token') || sessionStorage.getItem('token');
  }

  getCurrentUserId() {
    // This should be stored when user logs in
    return localStorage.getItem('userId') || sessionStorage.getItem('userId');
  }

  getUserRole() {
    return localStorage.getItem('userRole') || sessionStorage.getItem('userRole') || 'user';
  }
}

// Initialize chat widget when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.chatWidget = new ChatWidget();
});
