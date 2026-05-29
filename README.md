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

The frontend is already prepared to connect to a PokéAPI-cached CSV + Supabase backend.

### Expected API Base URL

Set these environment variables in the frontend project:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

If the API URL is not set, the UI can infer the Supabase URL from the anon key project ref.

### Expected Backend Responsibilities

- Load Pokemon data from the PokéAPI-cached CSV file
- Store predictions in Supabase
- Store ground truth results in Supabase
- Return saved match history and stats through Supabase tables/views
- Accept screenshot proof uploads for battle logging
- Auto-generate battle predictions from matchup data and cached PokéAPI records

### Suggested Backend Endpoints

- `battles` table
- `audit_log` table

## Notes

- The frontend currently uses a local fallback mode if the backend is not available.
- Screenshot proof is handled as a real file upload in the UI.
- The app is structured so it can be connected to Supabase without redesigning the interface.

