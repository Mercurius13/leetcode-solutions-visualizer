#!/usr/bin/env python3
"""
Standalone FastAPI server for the code visualizer.

Endpoints:
  GET  /problems?page=N    → 100 problem metadata rows (for frontend page cache)
  GET  /problems/{num}     → full problem: description, starter, solution, tags

Local:
    uvicorn server:app --reload --port 5050

Production (Render picks up $PORT automatically):
    uvicorn server:app --host 0.0.0.0 --port $PORT
"""

import sqlite3
import json
import os
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

DB_PATH   = os.environ.get("VIZ_DB", os.path.join(os.path.dirname(__file__), "problems.db"))
PAGE_SIZE = 100
HERE      = os.path.dirname(os.path.abspath(__file__))

app = FastAPI(title="Code Visualizer API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# ── API routes (must be registered BEFORE the static-file catch-all) ──────────

@app.get("/problems")
def list_problems(page: int = Query(0, ge=0)):
    conn = get_db()
    rows = conn.execute(
        """
        SELECT num, slug, title, difficulty
        FROM lc_problems
        ORDER BY CAST(num AS INTEGER)
        LIMIT ? OFFSET ?
        """,
        (PAGE_SIZE, page * PAGE_SIZE),
    ).fetchall()
    conn.close()
    return {"page": page, "problems": [dict(r) for r in rows]}


@app.get("/problems/{num}")
def get_problem(num: str):
    conn = get_db()
    row = conn.execute("SELECT * FROM lc_problems WHERE num=?", (num,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail=f"Problem #{num} not in DB yet")
    data = dict(row)
    try:
        data["tags"] = json.loads(data.get("tags") or "[]")
    except Exception:
        data["tags"] = []
    return data


# ── Serve frontend as static files (catch-all, must come last) ────────────────
app.mount("/", StaticFiles(directory=HERE, html=True), name="static")
