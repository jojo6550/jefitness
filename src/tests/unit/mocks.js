const mockUser = {
  _id: new mongoose.Types.ObjectId(),
  stripeCustomerId: 'cus_test',
};

const mockSubscription = {
  _id: new mongoose.Types.ObjectId(),
  userId: mockUser._id,
  stripeCustomerId: 'cus_test',
  stripeSubscriptionId: 'sub_test',
  plan: '1-month',
  status: 'active'
};

module.exports = { mockUser, mockSubscription };
