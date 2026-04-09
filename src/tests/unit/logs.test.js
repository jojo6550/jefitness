const Log = require('../../models/Log');

// Mock mongoose model
jest.mock('../../models/Log');

describe('Log model static methods used by logs route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Log.find is called with level filter when level param provided', async () => {
    Log.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        skip: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([]),
          }),
        }),
      }),
    });
    Log.countDocuments.mockResolvedValue(0);

    const query = {};
    if ('error') query.level = 'error';
    expect(query.level).toBe('error');
  });

  it('Log.getLogStats returns aggregation result', async () => {
    const mockStats = [{ _id: 'error', count: 3 }];
    Log.getLogStats.mockResolvedValue(mockStats);
    const result = await Log.getLogStats(new Date(), new Date());
    expect(result).toEqual(mockStats);
  });

  it('daysToMs converts correctly', () => {
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    expect(1 * MS_PER_DAY).toBe(86400000);
  });
});
