# Database Query Optimization Tasks

## 1. Add Compound Indexes to Appointment Model
- Add indexes for trainerId + date, clientId + date, trainerId + clientId, etc.

## 2. Optimize Trainer Dashboard Route
- Replace multiple queries with aggregation pipeline for stats
- Use lean() for read-only operations

## 3. Optimize Trainer Clients Route
- Avoid fetching all appointments to get clientIds
- Use aggregation to get clients directly

## 4. Optimize Trainer Appointments Route
- Fix N+1 query problem in search
- Use aggregation with $lookup for search

## 5. Fix Appointments Search Route
- Replace broken populate-based search with proper $lookup
- Use aggregation pipeline for filtering and pagination

## 6. General Optimizations
- Add lean() to read-only queries
- Ensure proper error handling
- Test performance improvements
