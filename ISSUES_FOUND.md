# Integration Issues Found

## 🔴 Critical Issues (Must Fix Before Testing)

### 1. Login Response Format Mismatch
**Backend** (auth.py line 146-151):
```python
response = JSONResponse(
    content={
        "id": user.id,
        "email": user.email,
        "is_active": user.is_active,
    },
```

**Frontend** (AuthContext.tsx line 102):
```typescript
const data = await response.json()
setUser(data.user)  // ❌ WRONG: data.user is undefined
```

**Fix**: Frontend should use `setUser(data)` or backend should wrap in `user` property.

---

### 2. TOTP Required Error Handling Mismatch
**Backend** (auth.py line 96-98):
```python
raise HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="TOTP code required",
)
```

**Frontend** (AuthContext.tsx line 95):
```typescript
if (error.code === 'totp_required') {  // ❌ WRONG: no code field in FastAPI error
    return 'totp_required'
}
```

**Fix**: Frontend should check `error.detail === "TOTP code required"` or backend should add `code` field.

---

### 3. TOTP Payload Field Name Mismatch
**Login form sends**: `totp_code` (line 28 of Login.tsx doesn't exist, but we see totp variable)
**Backend expects**: `totp_code` (LoginRequest line 28)
**Frontend sends**: `totp` (AuthContext line 85)

**Issue**: The field names don't match!

**Fix**: Frontend should send `totp_code` not `totp`.

---

### 4. Auth/Me Response Format Mismatch
**Backend** (auth.py line 322-325):
```python
return UserResponse(
    id=user.id,
    email=user.email,
    is_active=user.is_active,
)
```

**Frontend** (AuthContext.tsx line 40):
```typescript
setUser(data.user)  // ❌ WRONG: data.user is undefined
```

**Fix**: Same as issue #1 - should use `setUser(data)`.

---

### 5. Missing totp_enabled Field
**Frontend** (AuthContext.tsx line 42, 104):
```typescript
setTotpEnabled(data.totp_enabled ?? false)
```

**Backend doesn't return**: `totp_enabled` field in any response.

**Fix**: Backend should include `totp_enabled: bool` in LoginResponse and UserResponse, OR frontend should derive it from `data.totp_secret` being non-null (not recommended - expose secrets).

**Better fix**: Have backend check if user has TOTP enabled and return the boolean flag.

---

## 🟡 Minor Issues

### 6. TOTP Code Validation
**Login component** (line 119):
```typescript
onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))}
```
This filters to digits only - ✅ Good.

**But**: When user presses enter, it auto-submits. The 6-digit requirement is `maxLength={6}` but not enforced by the form button. User could submit with fewer digits.

**Fix**: Add check `disabled={totp.length < 6}` to submit button when in TOTP mode.

---

### 7. Missing totp_code in Login Request Field Name
**Backend LoginRequest** (line 28):
```python
totp_code: str | None = None
```

**Frontend AuthContext** (line 85):
```python
payload.totp = totp  # ❌ Should be payload.totp_code
```

---

### 8. Error Response Structure
**Frontend** expects error to have `message` field (line 98):
```typescript
throw new Error(error.message || 'Login failed')
```

**FastAPI** returns `detail`, not `message`.

**Fix**: Change to `error.detail || 'Login failed'`.

---

## 🟢 Status: All Issues Are Small Fixable Bugs

None of these are architectural issues - just field name and response structure mismatches that are quick to fix.

---

## Required Fixes (Priority Order)

1. **AuthContext.tsx line 102, 40**: Change `data.user` → `data`
2. **AuthContext.tsx line 85**: Change `payload.totp` → `payload.totp_code`
3. **AuthContext.tsx line 95**: Change `error.code` → `error.detail`
4. **AuthContext.tsx line 98**: Change `error.message` → `error.detail`
5. **Backend LoginResponse + UserResponse**: Add `totp_enabled: bool` field
6. **Login.tsx**: Add disabled state to submit button when TOTP required: `disabled={totp.length !== 6}`

---

## Testing Plan After Fixes

1. ✅ Frontend compiles without errors
2. ✅ Backend imports work without errors
3. ✅ Login with valid credentials → redirects to calendar
4. ✅ Login with invalid credentials → shows error message
5. ✅ Login with wrong password 5 times → rate limit 429 error
6. ✅ Token refresh happens silently (check network tab)
7. ✅ Logout → redirects to login
8. ✅ Calendar month view loads events
9. ✅ Click event → shows detail panel

---

Generated: 2026-06-27
