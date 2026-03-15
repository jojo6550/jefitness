# Fix: Network error toast on login

## Status: ✅ In Progress

## Steps:
- [✅] 1. Create this TODO.md
- [✅] 2. Update CORS config to allow localhost:5500 (VSCode Live Server)
- [✅] 3. Replace raw fetch() in auth.js with API.auth.login()
- [✅] 4. Improve API health check timeout/error handling
- [ ] 5. Test: Verify OPTIONS preflight + POST in Network tab
- [ ] 6. Backend restart & manual login test
- [ ] 7. Update TODO.md to ✅ Complete
- [ ] 8. Production verification on Render

## Testing Commands:
```
# Backend (terminal 1)
cd c:/Users/josia/jefitness
npm start

# Frontend dev server (terminal 2)  
# Open http://localhost:5500/pages/login.html in browser
# DevTools > Network tab > Login attempt → expect OPTIONS 204 + POST 200
```

