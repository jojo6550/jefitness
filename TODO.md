why does my 1 year plan currently show 90 days left even thought it should be 30 days. investigate and fix, stadnardzie for all subscription plans aswell. i suspect there is a mix up with the stripe sync.
sample of subscription data: 
{
  _id: ObjectId('69c1c2058f946c9f59e56241'),
  stripePriceId: 'price_1TEH5GDZMERb0GrC6fHZmIgJ',
  __v: NumberInt('0'),
  active: true,
  createdAt: ISODate('2026-03-23T22:42:45.096Z'),
  currency: 'jmd',
  description: null,
  interval: 'year',
  intervalCount: NumberInt('1'),
  lastSyncedAt: ISODate('2026-03-26T01:14:35.037Z'),
  lookupKey: '1-year',
  metadata: {},
  name: '1 Year Subscription',
  nickname: '1-year',
  productImages: [],
  stripeProductId: 'prod_UCgSJvSKETfXr6',
  type: 'recurring',
  unitAmount: NumberInt('12000000'),
  updatedAt: ISODate('2026-03-26T01:14:35.039Z')
}

investigate the sync data perhaps?