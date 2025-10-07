# API Integration Guide

## Overview
All Firebase dependencies have been removed from the Apollo Fire App. The application now uses a REST API for authentication and device management.

## Configuration

### 1. Set Your API Base URL
Update the environment variable in your `.env` file or app configuration:

```
EXPO_PUBLIC_API_BASE_URL=https://your-api-url.com/api
```

If not set, it defaults to `https://your-api-url.com/api` (update in `src/services/apiConfig.ts`).

## Required API Endpoints

### Authentication Endpoints

#### POST `/auth/login`
Login with email and password.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "token": "jwt-token-here",
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "name": "User Name"
  }
}
```

#### POST `/auth/signup`
Create a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:** Same as login

#### POST `/auth/guest`
Login as a guest user.

**Response:** Same as login

#### POST `/auth/logout`
Logout the current user (requires Authorization header).

#### GET `/auth/me`
Get current user information (requires Authorization header).

**Response:**
```json
{
  "id": "user-id",
  "email": "user@example.com",
  "name": "User Name"
}
```

### Device Endpoints

#### GET `/devices`
Get all devices for the authenticated user (requires Authorization header).

**Response:**
```json
{
  "devices": ["device-id-1", "device-id-2"]
}
```

#### GET `/devices/:deviceId/details`
Get device details (requires Authorization header).

**Response:**
```json
{
  "name": "Living Room Sensor",
  "location": "Living Room"
}
```

#### GET `/devices/:deviceId/readings`
Get current device sensor readings (requires Authorization header).

**Response:**
```json
{
  "temperature": 25.5,
  "gasValue": 500,
  "isFlameDetected": 0,
  "isCriticalAlert": 0,
  "lastUpdate": 1234567890000
}
```

#### GET `/devices/:deviceId/available`
Check if a device is available for claiming.

**Response:**
```json
{
  "available": true
}
```

#### POST `/devices/:deviceId/claim`
Claim a device for the authenticated user (requires Authorization header).

**Request Body:**
```json
{
  "userId": "user-id"
}
```

#### GET `/devices/:deviceId/thresholds`
Get device alert thresholds (requires Authorization header).

**Response:**
```json
{
  "temperature": 45.0,
  "gas": 1000
}
```

#### PUT `/devices/:deviceId/thresholds`
Update device alert thresholds (requires Authorization header).

**Request Body:**
```json
{
  "temperature": 45.0,
  "gas": 1000
}
```

#### PUT `/devices/:deviceId/stream-mode`
Set device streaming mode (requires Authorization header).

**Request Body:**
```json
{
  "mode": "local" // or "relay"
}
```

#### PUT `/devices/:deviceId/stream-request`
Request or cancel device streaming (requires Authorization header).

**Request Body:**
```json
{
  "requested": true
}
```

#### GET `/devices/:deviceId/relay-stream`
Get relay stream URL (requires Authorization header).

**Response:**
```json
{
  "streamUrl": "wss://relay-server.com/stream/device-id"
}
```

### Notification Endpoints

#### POST `/notifications/register`
Register a push notification token (requires Authorization header).

**Request Body:**
```json
{
  "token": "expo-push-token"
}
```

## Authentication

All authenticated endpoints require a Bearer token in the Authorization header:

```
Authorization: Bearer <jwt-token>
```

The token is automatically included by the `apiConfig.ts` service after successful login.

## Local Storage

The app stores the following in AsyncStorage:
- `@auth_token`: JWT authentication token
- `@user_data`: User information (JSON)

## Changes Made

### Files Modified:
1. ✅ `src/services/apiConfig.ts` - New API service (replaces firebaseConfig.ts)
2. ✅ `app/auth.tsx` - Updated to use API login
3. ✅ `src/state/pinGate.tsx` - Removed Firebase auth listener
4. ✅ `app/_layout.tsx` - Removed Firebase imports
5. ✅ `app/add-device.tsx` - Updated to use API
6. ✅ `app/device/settings.tsx` - Updated to use API
7. ✅ `app/camera.tsx` - Updated to use API
8. ✅ `package.json` - Removed Firebase dependency

### Files Deleted:
1. ✅ `src/services/firebaseConfig.ts`
2. ✅ `FirebaseConfig.ts`

## Next Steps

1. **Set up your API server** with the endpoints listed above
2. **Update the API base URL** in your environment configuration
3. **Test authentication** by running the app and trying to sign up/login
4. **Implement real-time updates** (optional) - Consider using WebSockets or polling for device readings if you need real-time updates

## Notes

- The `device/[id].tsx` file is mostly commented out and may need updates if you're using it
- Push notifications now register tokens via API instead of Firebase
- Device readings are fetched via API calls instead of real-time Firebase listeners
- Consider implementing WebSocket connections for real-time device data if needed
