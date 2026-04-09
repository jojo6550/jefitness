const { createSubscription, bulkDeleteClients, getMonthlyRevenue } = require('../../controllers/adminController');
const User = require('../../models/User');
const Subscription = require('../../models/Subscription');
const stripe = require('stripe');

jest.mock('../../models/User');
jest.mock('../../models/Subscription');
jest.mock('stripe');
jest.mock('../../services/logger', () => ({
  logAdminAction: jest.fn(),
  error: jest.fn(),
}));

describe('adminController.getMonthlyRevenue', () => {
  it('returns 0 when no active subscriptions', async () => {
    Subscription.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([]),
    });
    const req = {};
    const res = { json: jest.fn() };
    await getMonthlyRevenue(req, res);
    expect(res.json).toHaveBeenCalledWith({ revenue: 0, currency: 'jmd', month: expect.any(String) });
  });
});

describe('adminController.bulkDeleteClients', () => {
  it('returns 400 when userIds is not an array', async () => {
    const req = { body: { userIds: 'not-array' }, user: { id: 'adminId' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await bulkDeleteClients(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when userIds exceeds 50', async () => {
    const req = { body: { userIds: new Array(51).fill('id') }, user: { id: 'adminId' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await bulkDeleteClients(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
