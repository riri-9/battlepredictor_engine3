# Battle Predictor Engine 3

Dark Pokemon-themed React + Tailwind dashboard for the Battle Predictor Engine.

## What It Does

- `Predict` tab for pre-battle predictions
- `Ground Truth` tab for recording the real match result
- `History` tab for match logs and accuracy stats
- Screenshot upload support for proof of battle

## Frontend Setup

### Prerequisites

- Node.js 18+ recommended
- npm

### Install Dependencies

```powershell
npm install
```

### Run the Frontend

```powershell
npm run dev
```

Then open the local URL Vite prints, usually:

```text
http://localhost:5173
```

### Build for Production

```powershell
npm run build
```

### Preview the Production Build

```powershell
npm run preview
```

## Backend Setup

The frontend is already prepared to connect to a CSV + SQLite backend.

### Expected API Base URL

Set this environment variable in the frontend project:

```env
VITE_API_BASE_URL=http://localhost:3000
```

If this is not set, the UI runs in local fallback mode.

### Expected Backend Responsibilities

- Load Pokemon data from the assigned CSV file
- Store predictions in SQLite
- Store ground truth results in SQLite
- Return saved match history and stats through API endpoints
- Accept screenshot proof uploads for battle logging

### Suggested Backend Endpoints

- `GET /api/predictions`
- `POST /api/predictions`
- `POST /api/ground-truth`
- `GET /api/history`
- `GET /api/stats`

## Notes

- The frontend currently uses a local fallback mode if the backend is not available.
- Screenshot proof is handled as a real file upload in the UI.
- The app is structured so it can be connected to SQLite without redesigning the interface.

