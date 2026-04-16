const mongoose = require('mongoose');

const Subscription = require('../../models/Subscription');

describe('Subscription Schema', () => {
  it('should validate required fields', async () => {
    const sub = new Subscription({
      userId: new mongoose.Types.ObjectId(),
      status: 'trialing',
    });
    expect(sub.userId).toBeDefined();
    expect(sub.status).toBe('trialing');
  });

  it('should accept valid statuses', () => {
    const validStatuses = ['active', 'cancelled', 'trialing'];
    validStatuses.forEach(status => {
      const sub = new Subscription({
        userId: new mongoose.Types.ObjectId(),
        status,
      });
      expect(sub.status).toBe(status);
    });
  });

  it('should default status to trialing', () => {
    const sub = new Subscription({
      userId: new mongoose.Types.ObjectId(),
    });
    expect(sub.status).toBe('trialing');
  });

  it('should store queuedPlan as nested doc', () => {
    const sub = new Subscription({
      userId: new mongoose.Types.ObjectId(),
      queuedPlan: {
        plan: '12-month',
        currentPeriodEnd: new Date(),
      },
    });
    expect(sub.queuedPlan.plan).toBe('12-month');
  });
});
