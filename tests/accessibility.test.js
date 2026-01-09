// Mock DOM environment for testing
const dom = new JSDOM(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test Page</title>
</head>
<body>
    <header class="hero" role="banner">
        <h1>Test Header</h1>
        <a href="#test" role="button" aria-label="Test link">Test Link</a>
    </header>
    <section role="region" aria-labelledby="section-heading">
        <h2 id="section-heading">Test Section</h2>
        <div role="list">
            <div role="listitem">
                <button aria-label="Test button">Button</button>
            </div>
        </div>
    </section>
    <footer role="contentinfo">
        <p>Test Footer</p>
    </footer>
</body>
</html>
`, {
  url: 'http://localhost'
});

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
=======
// Mock DOM environment for testing
const mockDocument = {
  documentElement: {
    getAttribute: jest.fn(() => 'en'),
    setAttribute: jest.fn()
  },
  querySelector: jest.fn(),
  querySelectorAll: jest.fn(() => []),
  getElementById: jest.fn(),
  createElement: jest.fn(() => ({
    setAttribute: jest.fn(),
    getAttribute: jest.fn(),
    appendChild: jest.fn(),
    insertBefore: jest.fn(),
    addEventListener: jest.fn()
  })),
  body: {
    appendChild: jest.fn()
  },
  getElementsByTagName: jest.fn(() => [])
};

const mockWindow = {
  location: {
    protocol: 'http:',
    host: 'localhost'
  },
  addEventListener: jest.fn(),
  removeEventListener: jest.fn()
};

global.window = mockWindow;
global.document = mockDocument;
global.navigator = { userAgent: 'test' };
