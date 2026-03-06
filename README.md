# Trakr — Habits & Tasks

A lightweight personal productivity app that combines **daily habit tracking** and **task management** in one place. Designed for solo use: no accounts, no email, just enter your name and start tracking.

---

## What the App Does

### Welcome Screen
First-time visitors enter a display name. That name is looked up (or created) in the database and a user ID is stored in the browser's `localStorage`. From that point on, the app loads your data automatically on every visit.

### Dashboard
- **Behaviour ring** — an SVG circular progress ring showing how many of today's habits you have completed (e.g. `3/5 · 60%`).
- **Task counters** — three at-a-glance numbers: Overdue, Due Today, and Upcoming. Tapping any counter navigates to the Tasks tab.
- **Streak banner** — appears when you have completed at least one behaviour on two or more consecutive days.

### Behaviours Tab
- Checklist of all your tracked habits for today.
- Each row shows a **7-day dot history**: filled dot = completed, ring dot = today, dark dot = missed, faded dot = behaviour didn't exist yet.
- Tap the circle checkbox to mark a behaviour done/undone (animated, synced to the database instantly).
- Incomplete behaviours sort to the top; completed ones sink to the bottom with a strikethrough.
- Long-press or hover to reveal the delete button.
- The **+ Add Behaviour** button (or FAB) opens a bottom-sheet modal.

### Tasks Tab
- Tasks are grouped into **Overdue**, **Due Today**, and **Upcoming** sections.
- Within each section tasks are sorted: High priority first, then by due date.
- Each task card shows the task name, a colour-coded priority pill (High / Medium / Low), and the due date.
- Tap the checkbox to mark complete; completed tasks are hidden by default — toggle **Show completed** at the top right to reveal them.
- Hover to reveal the delete button.
- The **+ Add Task** FAB opens a bottom-sheet modal with a name field, priority selector, and date picker.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML / CSS / JavaScript (single file, no build step) |
| Backend | Node.js + Express |
| Database | Google Cloud Firestore (NoSQL, serverless) |
| Hosting | Google Cloud Run (containerised, auto-scaling) |
| Container | Docker |

---

## Project Structure

```
trakr/
├── public/
│   └── index.html        # Complete frontend — all HTML, CSS, and JS
├── server.js             # Express REST API + Firestore integration
├── package.json
├── Dockerfile            # Production container for Cloud Run
├── .dockerignore
├── .env.example          # Environment variable reference
└── README.md
```

---

## Firestore Data Model

```
users/
  {userId}                          username, createdAt
    behaviours/
      {behaviourId}                 name, createdDate, completedDates[]
    tasks/
      {taskId}                      name, priority, dueDate, completed, createdDate
```

Each user's behaviours and tasks are stored in Firestore **subcollections**, so reads are always scoped to a single user — no cross-user data leakage.

---

## REST API

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/users` | Find or create a user by username |
| `GET` | `/api/users/:id` | Get user profile |
| `GET` | `/api/users/:id/behaviours` | List all behaviours |
| `POST` | `/api/users/:id/behaviours` | Create a behaviour |
| `PATCH` | `/api/users/:id/behaviours/:bid` | Update `completedDates` array |
| `DELETE` | `/api/users/:id/behaviours/:bid` | Delete a behaviour |
| `GET` | `/api/users/:id/tasks` | List all tasks |
| `POST` | `/api/users/:id/tasks` | Create a task |
| `PATCH` | `/api/users/:id/tasks/:tid` | Toggle `completed` |
| `DELETE` | `/api/users/:id/tasks/:tid` | Delete a task |

---

## Local Development

### Prerequisites
- Node.js 20+
- A Google Cloud project with **Firestore in Native mode** enabled
- A service account key with the **Cloud Datastore User** role

### Steps

1. **Clone and install**
   ```bash
   git clone <repo-url>
   cd trakr
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env — set GOOGLE_CLOUD_PROJECT and GOOGLE_APPLICATION_CREDENTIALS
   ```

3. **Run**
   ```bash
   npm run dev   # uses node --watch for auto-restart
   # or
   npm start
   ```

4. Open [http://localhost:8080](http://localhost:8080).

---

## Google Cloud Deployment

### 1. Enable required APIs
```bash
gcloud services enable run.googleapis.com firestore.googleapis.com
```

### 2. Create Firestore database (once per project)
```bash
gcloud firestore databases create --location=us-central1
```

### 3. Build and push the container image
```bash
PROJECT_ID=$(gcloud config get-value project)

gcloud builds submit \
  --tag gcr.io/$PROJECT_ID/trakr
```

### 4. Deploy to Cloud Run
```bash
gcloud run deploy trakr \
  --image gcr.io/$PROJECT_ID/trakr \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GOOGLE_CLOUD_PROJECT=$PROJECT_ID
```

Cloud Run automatically:
- Sets the `PORT` environment variable.
- Authenticates to Firestore using the service account attached to the Cloud Run service (no key file needed in production).
- Provides a public HTTPS URL.

### 5. (Optional) Grant least-privilege Firestore access

By default Cloud Run uses the Compute Engine default service account. For better security, create a dedicated service account:

```bash
gcloud iam service-accounts create trakr-sa \
  --display-name "Trakr Service Account"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member "serviceAccount:trakr-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --role "roles/datastore.user"

# Re-deploy with the dedicated SA
gcloud run deploy trakr \
  --image gcr.io/$PROJECT_ID/trakr \
  --service-account trakr-sa@$PROJECT_ID.iam.gserviceaccount.com \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GOOGLE_CLOUD_PROJECT=$PROJECT_ID
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_CLOUD_PROJECT` | Yes | GCP project ID used by the Firestore client |
| `GOOGLE_APPLICATION_CREDENTIALS` | Local dev only | Path to service account JSON key |
| `PORT` | No | Server port (defaults to `8080`; set automatically by Cloud Run) |

---

## Security Notes

- User data is scoped to a Firestore subcollection per user ID — users cannot access each other's data through the API.
- All user-supplied strings are HTML-escaped before being rendered in the browser to prevent XSS.
- Input is validated and length-capped on both the client and the server.
- The app has no password authentication — it is intended as a personal, single-user tool. If you expose it publicly, consider adding [Cloud IAP](https://cloud.google.com/iap) or a simple auth layer.
