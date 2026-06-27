# Local Testing Guide - Phase 0B + Phase 1

## Prerequisites
- Node.js 24+, npm, Python 3.13+, Docker, uv
- `.env` file already created with placeholders

---

## Setup Steps

### 1. Install Dependencies

```bash
# Frontend
npm install

# Backend
uv sync --project apps/api --dev
```

**Expected output:**
- npm: `added X packages, audited Y packages`
- uv: `Resolved X packages`

---

### 2. Start Docker Services

```bash
docker compose -f compose.yaml -f compose.dev.yaml up -d db minio
```

**Verify:**
```bash
docker ps | grep -E "secondbrain|postgres|minio"
```

Should see 3 containers: db, minio, (web/api come later)

---

### 3. Generate JWT Secret

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

Copy the output and update `.env`:
```env
JWT_SECRET_KEY=<paste-your-secret-here>
```

---

### 4. Run Database Migration

```bash
cd apps/api
alembic upgrade head
cd ../..
```

**Expected output:**
```
INFO  [alembic.runtime.migration] Context impl PostgresqlImpl.
INFO  [alembic.runtime.migration] Will assume transactional DDL is supported by backend
INFO  [alembic.runtime.migration] Running upgrade  -> 001_initial_schema, done
```

**Verify:** Check `.env` for `INITIAL_USER_EMAIL` and `INITIAL_USER_PASSWORD` values.

---

## Start Development Servers

Open **two terminals** (or use tmux/screen):

### Terminal 1: Backend (FastAPI)
```bash
npm run dev:api
```

**Expected output:**
```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
```

**Test backend health:**
```bash
curl http://localhost:8000/health
# Should return: {"status":"ok"}
```

---

### Terminal 2: Frontend (Vite)
```bash
npm run dev:web
```

**Expected output:**
```
  VITE v8.1.0  ready in 234 ms

  ➜  Local:   http://localhost:5173/
  ➜  press h to show help
```

---

## Test Scenarios

### Test 1: Login Flow ✅

1. Open browser to `http://localhost:5173`
2. You should see **Login page** (not redirected to /calendar)
3. Enter credentials from `.env`:
   - Email: `INITIAL_USER_EMAIL`
   - Password: `INITIAL_USER_PASSWORD`
4. Click **Sign In**
5. **Expected**: Redirects to `/calendar` page (month view)
6. **Check**: Browser shows current month calendar

**Success Criteria:**
- [ ] Form displays without errors
- [ ] No console errors (press F12)
- [ ] Redirects to `/calendar` after login
- [ ] Page shows month view grid
- [ ] URL changes to `http://localhost:5173/calendar`

---

### Test 2: Invalid Credentials ✅

1. On login page, enter:
   - Email: `invalid@example.com`
   - Password: `wrong`
2. Click **Sign In**
3. **Expected**: Error message appears below email field
4. Message should be: "Invalid credentials"

**Success Criteria:**
- [ ] Error displays without page crash
- [ ] Stays on login page (no redirect)
- [ ] Password field is cleared
- [ ] Can retry login

---

### Test 3: Rate Limiting ✅

1. On login page, enter:
   - Email: `test@test.com` (doesn't exist)
   - Password: `wrong`
2. Click **Sign In** **5 times** rapidly
3. On 5th attempt: **Expected** `429 Too Many Requests` error
4. Wait 5 minutes or restart to test again

**Success Criteria:**
- [ ] After 5 failed attempts, get rate limit error
- [ ] Error message is clear
- [ ] Can still load page (not blocked at server level)

---

### Test 4: Token Auto-Refresh ✅

1. Login successfully (you're at `/calendar`)
2. Open browser DevTools (F12)
3. Go to **Network** tab
4. Filter by `XHR` (XMLHttpRequest)
5. Wait ~14 minutes
6. **Expected**: See `POST /api/auth/refresh` request
7. Check response: Should have status 200 + return user data

**What to look for:**
- Request URL: `http://localhost:8000/api/auth/refresh`
- Request method: `POST`
- Response status: `200`
- Response body: `{ "id": "...", "email": "..." }`
- Cookies: Should see new `access_token` and `refresh_token`

**Success Criteria:**
- [ ] Auto-refresh happens without user interaction
- [ ] No errors in console during refresh
- [ ] Page stays responsive after refresh
- [ ] Cookies are updated with new tokens

---

### Test 5: Logout ✅

1. At `/calendar` page
2. Look for **top-right** corner (should show email + logout button)
3. Click **Logout** button
4. **Expected**: Redirects to `/login`
5. Try accessing `/calendar` by typing URL directly
6. **Expected**: Redirects back to `/login`

**Success Criteria:**
- [ ] Logout button is visible
- [ ] Clicking logout redirects to login
- [ ] Cannot access `/calendar` without login
- [ ] Refresh token is revoked server-side

---

### Test 6: Calendar Month View ✅

1. Login successfully
2. You should see **month grid**:
   - Header with month/year and navigation arrows
   - 7 columns (Sun-Sat)
   - Current day highlighted
3. Click **navigation arrows** to change months
4. **Expected**: Month updates, events may show (initially empty or with seed data)

**Success Criteria:**
- [ ] Calendar grid displays correctly
- [ ] Days are in correct positions (Sun on left, Sat on right)
- [ ] Month/year header is accurate
- [ ] Navigation works (prev/next month buttons)
- [ ] Current day is visually distinct

---

### Test 7: Calendar Sidebar ✅

1. At `/calendar` page
2. Look for **left sidebar**
3. Should show:
   - "Personal" calendar (orange/warm color)
   - "Work" calendar (blue color)
4. Each should have a colored dot + checkbox
5. Click checkbox to toggle visibility
6. **Expected**: Events on that calendar hide/show

**Success Criteria:**
- [ ] Sidebar displays both calendars
- [ ] Colors are correct (Personal=orange, Work=blue)
- [ ] Checkboxes are clickable
- [ ] Visual feedback when toggling (✓ appears)

---

### Test 8: Event Detail Panel ✅

1. At `/calendar` page with some events showing
2. Click on any event
3. **Expected**: Side panel slides in from right
4. Panel shows:
   - Event title
   - Date/time
   - Calendar name
   - Description (if any)
5. Click **background or X button** to close
6. **Expected**: Panel closes

**Note:** If no events, skip this test for MVP. Events come from database seed or later CRUD operations.

**Success Criteria:**
- [ ] Clicking event opens panel (or at least doesn't crash)
- [ ] Panel has close button
- [ ] Can close panel by clicking background or button

---

## Troubleshooting

### Error: "Cannot find npm"
```bash
which node
# If not found, install Node.js 24 first
```

### Error: "Database connection refused"
```bash
docker ps
# Check if db container is running
docker logs <container-id>
```

### Error: "Module not found: AuthContext"
```bash
# Clear node_modules and reinstall
rm -rf apps/web/node_modules package-lock.json
npm install
```

### Error: "CORS error accessing /api"
- Backend should be running on port 8000
- Frontend proxies /api to backend
- Check both servers are running in separate terminals

### Error: "Invalid TOTP code required" on login
- This is normal if user has TOTP enabled (Phase 2)
- For now, seed user doesn't have TOTP, so skip this

### Error: "401 Unauthorized" after login
- Check JWT_SECRET_KEY is set in `.env`
- Check database migration ran successfully
- Check frontend is sending cookies with requests (credentials: 'include')

---

## Network Inspection

### Check API Calls in DevTools

Open DevTools (F12) → Network tab:

**On page load:**
```
GET /         200 (HTML)
GET /assets/... 200 (JS/CSS)
POST /api/auth/me  200 (check auth status)
```

**On login:**
```
POST /api/auth/login  200
Response: { "id": "...", "email": "...", "is_active": true, "totp_enabled": false }
Cookies: access_token (httpOnly), refresh_token (httpOnly)
```

**On calendar view:**
```
GET /api/calendars  200
Response: [{ "id": "...", "name": "Personal", "color": "#..." }, ...]

GET /api/events?from=2026-06-01&to=2026-06-30  200
Response: { "events": [...] }
```

---

## Performance Check

### Frontend Performance
- Page load: < 2s
- Login: < 500ms
- Calendar navigation: < 200ms

### Backend Performance
- Login: < 100ms (excluding DB write)
- Refresh: < 50ms
- Events query: < 200ms

---

## Security Verification

### Check httpOnly Cookies

DevTools → Application → Cookies → localhost:5173:

```
Cookie Name: access_token
httpOnly: ✓ (checked)
Secure: ✓ (if using HTTPS in prod)
SameSite: strict
Max-Age: ~15 minutes
```

```
Cookie Name: refresh_token
httpOnly: ✓ (checked)
Secure: ✓ (if using HTTPS in prod)
SameSite: strict
Max-Age: ~30 days
```

### Check JWT Token Content

Paste token to https://jwt.io (or decode locally):
```
Header: { "alg": "HS256", "typ": "JWT" }
Payload: { "user_id": "...", "type": "access", "iat": ..., "exp": ... }
```

---

## Final Checklist

- [ ] All dependencies installed
- [ ] Docker services running (db, minio)
- [ ] Database migration completed
- [ ] JWT_SECRET_KEY set in `.env`
- [ ] Backend running on localhost:8000
- [ ] Frontend running on localhost:5173
- [ ] Can login with `.env` credentials
- [ ] Calendar month view displays
- [ ] Token auto-refresh works
- [ ] Logout works
- [ ] Rate limiting works after 5 attempts
- [ ] No console errors or warnings
- [ ] No API 5xx errors in Network tab

---

## What to Report If Tests Fail

Run this diagnostic command:

```bash
echo "=== Frontend ===" && \
npm run check:web 2>&1 | tail -20 && \
echo "=== Backend ===" && \
npm run check:api 2>&1 | tail -20
```

Then share:
1. **Exact error message** from console or DevTools
2. **Screenshot** of error (if visual)
3. **Network tab** response details
4. **Terminal output** from dev servers

---

## Next Steps After Tests Pass

1. ✅ All tests pass → Proceed to Phase 2 (Event CRUD)
2. ⚠️ Some tests fail → Review ISSUES_FOUND.md and check fixes applied
3. 📖 Review code → Check implementation quality in `IMPLEMENTATION_SUMMARY.md`

---

Generated: 2026-06-27  
Est. time to complete all tests: **30-45 minutes**
