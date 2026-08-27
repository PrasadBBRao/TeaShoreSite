# Teashore

A Gen Z-focused healthy café ordering & reservation website.

---

## Setup

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs the Vite + React dev server at `http://localhost:5173`.

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Runs the FastAPI server at `http://localhost:8000`.  
Visit `http://localhost:8000/` to confirm the backend is running.

> **Note:** Copy `.env.example` to `.env` and fill in your values before running the backend.
