# Firebase Admin SDK Setup Guide

To enable complete user deletion (including Firebase Authentication), follow these steps:

## 1. Install Firebase Admin SDK

```bash
cd backend
npm install firebase-admin
```

## 2. Get Firebase Service Account Credentials

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Click the gear icon ⚙️ → **Project Settings**
4. Go to **Service Accounts** tab
5. Click **Generate New Private Key**
6. Save the JSON file securely (DO NOT commit to git!)

## 3. Add Environment Variables

Add these to your `backend/.env` file:

```env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour-Private-Key-Here\n-----END PRIVATE KEY-----\n"
```

**Note:** The private key should be in quotes and keep the `\n` characters.

## 4. Uncomment the Firebase Admin Code

In `backend/server.js`, find the `/api/admin/delete-user` endpoint and:

1. Uncomment the Firebase Admin initialization code
2. Uncomment the user deletion code

## 5. Restart the Backend Server

```bash
npm start
```

## Current Behavior (Without Firebase Admin)

- ✅ Deletes user from local database (clients array)
- ✅ Removes from localStorage
- ❌ Does NOT delete Firebase Authentication account

## After Setup

- ✅ Deletes user from local database
- ✅ Removes from localStorage  
- ✅ Deletes Firebase Authentication account completely

## Security Notes

- Keep your service account JSON file secure
- Never commit credentials to version control
- Add `.env` and service account files to `.gitignore`
- Only admin users should have access to delete endpoints
