# Subscription API - Code Examples

## JavaScript/Frontend Examples

### Get Available Plans

```javascript
async function getPlans() {
  try {
    const response = await fetch('/api/v1/subscriptions/plans');
    const data = await response.json();
    
    console.log(data.data);
    // Output: { '1-month': {...}, '3-month': {...}, ... }
    
    Object.entries(data.data).forEach(([plan, info]) => {
      console.log(`${plan}: ${info.displayPrice}/month`);
    });
  } catch (error) {
    console.error('Error:', error);
  }
}
```

### Create a Subscription

```javascript
async function createSubscription(email, paymentMethodId, plan) {
  const token = localStorage.getItem('token');
  
  try {
    const response = await fetch('/api/v1/subscriptions/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        email,
        paymentMethodId,
        plan // '1-month', '3-month', '6-month', '12-month'
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log('Subscription created:', data.data.subscription);
      return data.data.subscription;
    } else {
      console.error('Error:', data.error.message);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

// Usage
createSubscription('user@example.com', 'pm_xxxxx', '1-month');
```

### Get User Subscriptions

```javascript
async function getUserSubscriptions(userId) {
  const token = localStorage.getItem('token');
  
  try {
    const response = await fetch(`/api/v1/subscriptions/user/${userId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log('Active subscriptions:', data.data.subscriptions);
      return data.data.subscriptions;
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

// Usage
const subscriptions = await getUserSubscriptions('user_id');
subscriptions.forEach(sub => {
  console.log(`Plan: ${sub.plan}, Status: ${sub.status}`);
});
```

### Upgrade/Downgrade Plan

```javascript
async function changePlan(subscriptionId, newPlan) {
  const token = localStorage.getItem('token');
  
  try {
    const response = await fetch(
      `/api/v1/subscriptions/${subscriptionId}/update-plan`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ plan: newPlan })
      }
    );
    
    const data = await response.json();
    
    if (data.success) {
      console.log('Plan updated:', data.data.subscription);
      return data.data.subscription;
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

// Usage
changePlan('sub_xxxxx', '6-month');
```

### Cancel Subscription

```javascript
async function cancelSubscription(subscriptionId, atPeriodEnd = true) {
  const token = localStorage.getItem('token');
  
  try {
    const response = await fetch(
      `/api/v1/subscriptions/${subscriptionId}/cancel`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ atPeriodEnd })
      }
    );
    
    const data = await response.json();
    
    if (data.success) {
      console.log('Subscription canceled:', data.message);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

// Usage - Cancel at end of billing period (graceful)
cancelSubscription('sub_xxxxx', true);

// Usage - Cancel immediately
cancelSubscription('sub_xxxxx', false);
```

### Resume Subscription

```javascript
async function resumeSubscription(subscriptionId) {
  const token = localStorage.getItem('token');
  
  try {
    const response = await fetch(
      `/api/v1/subscriptions/${subscriptionId}/resume`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    const data = await response.json();
    
    if (data.success) {
      console.log('Subscription resumed:', data.message);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

// Usage
resumeSubscription('sub_xxxxx');
```

### Get Invoices

```javascript
async function getInvoices(subscriptionId) {
  const token = localStorage.getItem('token');
  
  try {
    const response = await fetch(
      `/api/v1/subscriptions/${subscriptionId}/invoices`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const data = await response.json();
    
    if (data.success) {
      console.log(`Found ${data.data.count} invoices:`);
      data.data.invoices.forEach(invoice => {
        console.log(`- ${invoice.id}: ${invoice.amount} ${invoice.currency.toUpperCase()}`);
      });
      return data.data.invoices;
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

// Usage
const invoices = await getInvoices('sub_xxxxx');
```

---

## Stripe Elements Integration Example

### Complete Payment Form

```html
<form id="paymentForm">
  <div>
    <label>Email:</label>
    <input type="email" id="email" required />
  </div>
  
  <div>
    <label>Cardholder Name:</label>
    <input type="text" id="cardholderName" required />
  </div>
  
  <div>
    <label>Card Details:</label>
    <div id="cardElement"></div>
  </div>
  
  <div id="cardErrors" style="color: red;"></div>
  
  <button type="submit">Pay</button>
</form>

<script src="https://js.stripe.com/v3/"></script>
<script>
  const stripe = Stripe('pk_test_YOUR_PUBLIC_KEY');
  const elements = stripe.elements();
  const cardElement = elements.create('card');
  
  cardElement.mount('#cardElement');
  
  // Handle card errors
  cardElement.on('change', (event) => {
    const displayError = document.getElementById('cardErrors');
    displayError.textContent = event.error ? event.error.message : '';
  });
  
  // Handle form submission
  document.getElementById('paymentForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    
    const email = document.getElementById('email').value;
    const cardholderName = document.getElementById('cardholderName').value;
    
    // Create payment method
    const { paymentMethod, error } = await stripe.createPaymentMethod({
      type: 'card',
      card: cardElement,
      billing_details: { name: cardholderName, email }
    });
    
    if (error) {
      console.error('Payment method creation failed:', error);
      return;
    }
    
    // Send to backend
    createSubscription(email, paymentMethod.id, '1-month');
  });
</script>
```

---

## Node.js/Express Backend Examples

### Use Stripe Service Methods

```javascript
const { 
  createOrRetrieveCustomer,
  createSubscription,
  getCustomerSubscriptions,
  updateSubscription,
  cancelSubscription
} = require('./services/stripe');

// Create or get customer
const customer = await createOrRetrieveCustomer(
  'user@example.com',
  'pm_xxxxx',
  { userId: 'user_id' }
);
console.log('Customer:', customer.id);

// Create subscription
const subscription = await createSubscription(customer.id, '3-month');
console.log('Subscription:', subscription.id, subscription.status);

// Get all subscriptions
const subscriptions = await getCustomerSubscriptions(customer.id);
console.log('Total subscriptions:', subscriptions.length);

// Update subscription plan
const updated = await updateSubscription(subscription.id, { plan: '6-month' });
console.log('Updated to:', updated.status);

// Cancel subscription
await cancelSubscription(subscription.id, true); // at period end
console.log('Subscription canceled');
```

### Query Subscription Database

```javascript
const Subscription = require('./models/Subscription');

// Find user's subscriptions
const userSubs = await Subscription.find({ userId: 'user_id' });
console.log('User subscriptions:', userSubs);

// Find by Stripe ID
const sub = await Subscription.findOne({ stripeSubscriptionId: 'sub_xxxxx' });
console.log('Subscription status:', sub.status);
console.log('Next billing:', sub.currentPeriodEnd);

// Find active subscriptions
const activeSubs = await Subscription.find({ status: 'active' });
console.log('Active subscriptions count:', activeSubs.length);

// Update status
await Subscription.findByIdAndUpdate(sub._id, { status: 'past_due' });

// Delete subscription record (after cancellation)
await Subscription.findByIdAndDelete(sub._id);
```

---

## React Component Example

```jsx
import React, { useState, useEffect } from 'react';

export default function SubscriptionManager() {
  const [plans, setPlans] = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Load plans
      const plansRes = await fetch('/api/v1/subscriptions/plans');
      const plansData = await plansRes.json();
      setPlans(plansData.data);

      // Load user subscriptions
      const userId = localStorage.getItem('userId');
      const subsRes = await fetch(`/api/v1/subscriptions/user/${userId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const subsData = await subsRes.json();
      setSubscriptions(subsData.data.subscriptions);
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async (subId, newPlan) => {
    const res = await fetch(`/api/v1/subscriptions/${subId}/update-plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ plan: newPlan })
    });

    if (res.ok) {
      loadData();
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h1>Subscription Plans</h1>
      
      {/* Display plans */}
      <div className="plans">
        {Object.entries(plans).map(([key, plan]) => (
          <div key={key} className="plan-card">
            <h3>{plan.duration}</h3>
            <p className="price">{plan.displayPrice}</p>
            <button onClick={() => selectPlan(key)}>
              Get Started
            </button>
          </div>
        ))}
      </div>

      {/* Display user's subscriptions */}
      <div className="subscriptions">
        <h2>Your Subscriptions</h2>
        {subscriptions.map(sub => (
          <div key={sub._id} className="subscription-item">
            <h4>{sub.plan.toUpperCase()}</h4>
            <p>Status: {sub.status}</p>
            <p>Next billing: {new Date(sub.currentPeriodEnd).toLocaleDateString()}</p>
            <button onClick={() => handleUpgrade(sub.stripeSubscriptionId, '6-month')}>
              Upgrade
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Vue.js Component Example

```vue
<template>
  <div class="subscription-manager">
    <h1>Subscription Plans</h1>
    
    <!-- Plans -->
    <div class="plans">
      <div v-for="(plan, key) in plans" :key="key" class="plan-card">
        <h3>{{ plan.duration }}</h3>
        <p class="price">{{ plan.displayPrice }}</p>
        <button @click="selectPlan(key)">Get Started</button>
      </div>
    </div>

    <!-- User Subscriptions -->
    <div v-if="subscriptions.length" class="subscriptions">
      <h2>Your Subscriptions</h2>
      <div v-for="sub in subscriptions" :key="sub._id" class="subscription-item">
        <h4>{{ sub.plan.toUpperCase() }}</h4>
        <p>Status: {{ sub.status }}</p>
        <p>Next billing: {{ formatDate(sub.currentPeriodEnd) }}</p>
        <button @click="handleUpgrade(sub.stripeSubscriptionId, '6-month')">
          Upgrade
        </button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      plans: null,
      subscriptions: []
    };
  },
  mounted() {
    this.loadData();
  },
  methods: {
    async loadData() {
      // Load plans
      const plansRes = await fetch('/api/v1/subscriptions/plans');
      const plansData = await plansRes.json();
      this.plans = plansData.data;

      // Load subscriptions
      const userId = localStorage.getItem('userId');
      const subsRes = await fetch(`/api/v1/subscriptions/user/${userId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const subsData = await subsRes.json();
      this.subscriptions = subsData.data.subscriptions;
    },
    async handleUpgrade(subId, newPlan) {
      const res = await fetch(`/api/v1/subscriptions/${subId}/update-plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ plan: newPlan })
      });

      if (res.ok) {
        this.loadData();
      }
    },
    formatDate(date) {
      return new Date(date).toLocaleDateString();
    },
    selectPlan(plan) {
      // Trigger payment modal
      this.$emit('select-plan', plan);
    }
  }
};
</script>
```

---

## Error Handling Example

```javascript
async function safeSubscriptionCall(apiCall) {
  try {
    const response = await apiCall();
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'API error');
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error?.message || 'Request failed');
    }
    
    return data;
  } catch (error) {
    console.error('Subscription API Error:', error.message);
    showNotification(error.message, 'error');
    return null;
  }
}

// Usage
const result = await safeSubscriptionCall(() =>
  fetch('/api/v1/subscriptions/plans')
);

if (result) {
  console.log('Plans:', result.data);
}
```
