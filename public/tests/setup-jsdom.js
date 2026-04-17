// jsdom provides window.location automatically (origin: 'http://localhost')
// Attempting to override causes errors — rely on jsdom defaults in tests

global.fetch = jest.fn();

afterEach(() => {
  jest.clearAllMocks();
});
