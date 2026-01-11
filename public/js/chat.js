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
    this.backBtn = document.getElementById('chat-back-btn');
    this.partnerProfile = document.getElementById('chat-partner-profile');
    this.partnerImage = document.getElementById('chat-partner-image');
    this.partnerName = document.getElementById('chat-partner-name');
    this.partnerRole = document.getElementById('chat-partner-role');

    this.init();
  }

  init() {
    this.bindEvents();
    this.loadConversations();
    this.connectWebSocket();
    this.updateUnreadBadge();
    this.buildProfileCards();
  }

  bindEvents() {
    // Toggle chat widget
    this.toggleBtn.addEventListener('click', () => this.toggleWidget());

    // Minimize chat widget
    this.minimizeBtn.addEventListener('click', () => this.minimizeWidget());

    // Back button
    if (this.backBtn) {
      this.backBtn.addEventListener('click', () => this.goBackToSelection());
    }

    // Partner profile click
    if (this.partnerProfile) {
      this.partnerProfile.addEventListener('click', () => this.navigateToPartnerPage());
    }

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

  selectConversation(type, partnerData = null) {
    this.currentConversation = { type, partnerData, partnerId: partnerData?.id };
    this.selection.style.display = 'none';
    this.conversation.style.display = 'flex';
    this.updateConversationHeader();
    this.loadChatHistory();
    this.input.focus();
  }

  async loadConversations() {
    try {
      const data = await window.API.chat.getConversations();
      this.conversations = data.conversations;
      this.updateUnreadCount();
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

      const data = await window.API.chat.getHistory(partnerId);
      this.displayMessages(data.messages);
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
      await window.API.chat.sendMessage({
        receiverId,
        message: content,
        messageType: this.getMessageType()
      });
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }

  getReceiverId() {
    // Return the partner ID from the current conversation
    return this.currentConversation?.partnerId || null;
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

  async markCurrentConversationAsRead() {
    if (this.currentConversation && this.currentConversation.partnerId) {
      const partnerId = this.currentConversation.partnerId;
      try {
        await window.API.chat.markAsRead(partnerId);
        // Find and update the conversation in the list
        const conversation = this.conversations.find(conv => conv.partnerId === partnerId);
        if (conversation) {
          this.unreadCount = Math.max(0, this.unreadCount - (conversation.unreadCount || 0));
          conversation.unreadCount = 0;
          this.updateUnreadBadge();
        }
      } catch (error) {
        console.error('Error marking conversation as read:', error);
      }
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

  goBackToSelection() {
    this.conversation.style.display = 'none';
    this.selection.style.display = 'flex';
    this.currentConversation = null;
  }

  updateConversationHeader() {
    if (!this.currentConversation) return;

    const partnerData = this.currentConversation.partnerData || this.getDefaultPartnerData();
    if (this.partnerImage) this.partnerImage.src = partnerData.image;
    if (this.partnerName) this.partnerName.textContent = partnerData.name;
    if (this.partnerRole) this.partnerRole.textContent = partnerData.role;
  }

  getDefaultPartnerData() {
    const type = this.currentConversation.type;
    if (type === 'trainer') {
      return {
        name: 'Jamol Elliot',
        role: 'Trainer',
        image: '../images/logo.jpg'
      };
    } else if (type === 'admin') {
      return {
        name: 'Technical Support',
        role: 'Admin',
        image: '../favicons/favicon-32x32.png'
      };
    }
    return {
      name: 'Support',
      role: 'Assistant',
      image: '../favicons/favicon-32x32.png'
    };
  }

  navigateToPartnerPage() {
    if (!this.currentConversation) return;

    const type = this.currentConversation.type;
    const partnerData = this.currentConversation.partnerData;

    if (type === 'trainer') {
      // Link to specific trainer account page
      const trainerSlug = partnerData.name.toLowerCase().replace(' ', '-');
      window.location.href = `trainer-${trainerSlug}.html`;
    } else if (type === 'admin') {
      window.location.href = 'admin-dashboard.html';
    }
  }

  async buildProfileCards() {
    const chatOptions = document.querySelector('.chat-options');
    if (!chatOptions) return;

    chatOptions.innerHTML = '<div class="loading">Loading chat partners...</div>';

    try {
      // Fetch trainers and admins from API
      const [trainers, admins] = await Promise.all([
        window.API.users.getTrainers(),
        window.API.users.getAdmins()
      ]);

      chatOptions.innerHTML = '';

      // Create trainer cards
      trainers.forEach(trainer => {
        const trainerData = {
          name: `${trainer.firstName} ${trainer.lastName}`,
          role: 'Trainer',
          specialty: 'Fitness Training',
          image: '../images/logo.jpg',
          id: trainer._id,
          email: trainer.email
        };
        const card = this.createProfileCard(trainerData, 'trainer');
        chatOptions.appendChild(card);
      });

      // Create admin cards
      admins.forEach(admin => {
        const adminData = {
          name: `${admin.firstName} ${admin.lastName}`,
          role: 'Admin',
          specialty: 'Support & Administration',
          image: '../favicons/favicon-32x32.png',
          id: admin._id,
          email: admin.email
        };
        const card = this.createProfileCard(adminData, 'admin');
        chatOptions.appendChild(card);
      });

      // If no users found, show fallback options
      if (trainers.length === 0 && admins.length === 0) {
        chatOptions.innerHTML = '<div class="no-users">No chat partners available at the moment.</div>';
      }

    } catch (error) {
      console.error('Error loading chat partners:', error);
      chatOptions.innerHTML = '<div class="error">Failed to load chat partners. Please try again.</div>';
    }
  }

  createProfileCard(data, type) {
    const card = document.createElement('div');
    card.className = 'chat-profile-card';
    card.dataset.type = type;
    card.addEventListener('click', () => this.selectConversation(type, data));

    const img = document.createElement('img');
    img.src = data.image;
    img.alt = data.name;
    img.className = 'chat-profile-image';

    const info = document.createElement('div');
    info.className = 'chat-profile-info';

    const name = document.createElement('div');
    name.className = 'chat-profile-name';
    name.textContent = data.name;

    const role = document.createElement('div');
    role.className = 'chat-profile-role';
    role.textContent = data.role;

    const specialty = document.createElement('div');
    specialty.className = 'chat-profile-specialty';
    specialty.textContent = data.specialty;

    info.appendChild(name);
    info.appendChild(role);
    info.appendChild(specialty);

    card.appendChild(img);
    card.appendChild(info);

    return card;
  }
}

// Initialize chat widget when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.chatWidget = new ChatWidget();
});
