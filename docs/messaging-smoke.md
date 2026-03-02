# Messaging smoke test

## Preconditions
- App is running with latest Prisma migration applied.
- You have:
  - one client user who is a member of the project's client
  - one admin user
  - a project id to test

## Steps
1. **Client view loads messages**
   - Login as client user.
   - Open `/project/<projectId>`.
   - Confirm **Project messages** section renders.
   - If no messages exist, you should see "No messages yet."

2. **Client sends message**
   - In `/project/<projectId>`, submit a message.
   - Verify it appears in the list with sender and timestamp.

3. **Admin sees same thread**
   - Login as admin user.
   - Open `/admin/projects/<projectId>`.
   - Confirm the message from step 2 is visible in **Project messages**.

4. **Admin replies**
   - In `/admin/projects/<projectId>`, submit a message.
   - Verify it appears in admin list.

5. **Client sees admin reply**
   - Refresh `/project/<projectId>` as client.
   - Verify admin message is visible.

6. **Authorization checks**
   - As an unauthenticated user, call `GET /api/projects/<projectId>/messages` and expect `401`.
   - As a non-member non-admin authenticated user, call same endpoint and expect `404`.

## Expected API behavior
- `GET /api/projects/[id]/messages`
  - Returns messages ordered by `createdAt` ascending.
- `POST /api/projects/[id]/messages`
  - Accepts `{ "body": "..." }`.
  - Rejects empty bodies and bodies over 2000 characters with `400`.
  - Allows project members and admins.
