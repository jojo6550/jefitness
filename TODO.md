# TODO: Fix Jest Test Timeouts

## Completed Tasks
- [x] Increase global test timeout in jest.config.js from 10000ms to 30000ms
- [x] Add timeout to beforeAll hook in tests/setup.js (20000ms)
- [x] Optimize afterEach hook to use dropDatabase() instead of looping through collections
- [x] Add timeout to afterAll hook in tests/setup.js (10000ms)

## Next Steps
- [ ] Run tests to verify timeouts are resolved
- [ ] Monitor test execution time for improvements
