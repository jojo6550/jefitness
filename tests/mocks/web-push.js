// Mock web-push module
const mockWebPush = {
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn().mockResolvedValue({
    statusCode: 201,
    headers: {},
    body: 'OK'
  })
};

module.exports = mockWebPush;
