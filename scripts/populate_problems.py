#!/usr/bin/env python3
"""
Populate lc_problems table using Ollama for all solutions.

Pipeline:
  1. Fetch all problem metadata from alfa-leetcode-api (40 requests, done once)
  2. For each problem, generate a Python 3 solution with Ollama (qwen3:8b)
  3. Store in DB — skips problems that already have a solution

Resumable: re-running picks up where it left off.

Run from yeetcode-api/:
    source venv/bin/activate
    python scripts/populate_problems.py
"""

import asyncio
import aiohttp
import sqlite3
import json
import os
import re
import sys

# ── Config ────────────────────────────────────────────────────────────────────
DB_PATH      = os.environ.get("VIZ_DB", os.path.join(os.path.dirname(__file__), "..", "problems.db"))
LC_API       = "https://alfa-leetcode-api.onrender.com"
OLLAMA_URL   = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "qwen2.5-coder:14b"
PAGE_SIZE    = 100

# ── DB ────────────────────────────────────────────────────────────────────────
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def load_done(conn) -> set:
    """Load all problem nums that already have a solution into a set."""
    rows = conn.execute("SELECT num FROM lc_problems WHERE solution != ''").fetchall()
    return {row["num"] for row in rows}

def upsert(conn, row: dict):
    conn.execute("""
        INSERT INTO lc_problems (num, slug, title, difficulty, solution, source, tags)
        VALUES (:num, :slug, :title, :difficulty, :solution, :source, :tags)
        ON CONFLICT(num) DO UPDATE SET
            solution = excluded.solution,
            source   = excluded.source
    """, row)
    conn.commit()

# ── Metadata ──────────────────────────────────────────────────────────────────
async def fetch_page(session: aiohttp.ClientSession, skip: int) -> list[dict]:
    url = f"{LC_API}/problems?limit={PAGE_SIZE}&skip={skip}"
    for attempt in range(3):
        try:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as r:
                if r.status == 200:
                    return (await r.json()).get("problemsetQuestionList", [])
        except Exception:
            pass
        await asyncio.sleep(2 ** attempt)
    return []

async def fetch_all_metadata(session: aiohttp.ClientSession) -> list[dict]:
    print("📋 Fetching problem list…")
    async with session.get(f"{LC_API}/problems?limit=1&skip=0", timeout=aiohttp.ClientTimeout(total=20)) as r:
        total = (await r.json()).get("totalQuestions", 3000)
    pages = (total + PAGE_SIZE - 1) // PAGE_SIZE
    print(f"  {total} problems, {pages} pages")

    all_meta: list[dict] = []
    for batch_start in range(0, pages, 5):
        skips = [i * PAGE_SIZE for i in range(batch_start, min(batch_start + 5, pages))]
        results = await asyncio.gather(*[fetch_page(session, s) for s in skips])
        for r in results:
            all_meta.extend(r)
        print(f"  {len(all_meta)}/{total}", end="\r")

    print(f"\n  got {len(all_meta)} problems\n")
    return all_meta

# ── Ollama ────────────────────────────────────────────────────────────────────
async def generate_ollama(session: aiohttp.ClientSession, title: str) -> str | None:
    prompt = (
        f"Solve the LeetCode problem '{title}' in Python 3.\n"
        "Return ONLY the Python code. No explanation, no markdown fences, no comments.\n"
        "Requirements:\n"
        "- class Solution with the correct method name\n"
        "- proper Python 3 type hints (List[int], Optional[ListNode], TreeNode, etc.)\n"
        "- working solution (not just a stub)\n"
        "- include 'from typing import ...' if needed"
    )
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.1, "num_predict": 1024},
    }
    try:
        async with session.post(OLLAMA_URL, json=payload, timeout=aiohttp.ClientTimeout(total=120)) as r:
            if r.status != 200:
                return None
            raw = (await r.json()).get("response", "").strip()
            raw = re.sub(r"^```(?:python)?\n?", "", raw)
            raw = re.sub(r"\n?```$", "", raw)
            raw = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
            return raw if "class Solution" in raw else None
    except Exception as e:
        print(f" ⚠ Ollama error: {e}")
        return None

# ── Main ──────────────────────────────────────────────────────────────────────
async def main():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS lc_problems (
            num         TEXT PRIMARY KEY,
            slug        TEXT UNIQUE NOT NULL,
            title       TEXT NOT NULL,
            difficulty  TEXT,
            description TEXT,
            starter     TEXT,
            solution    TEXT,
            source      TEXT,
            tags        TEXT DEFAULT '[]'
        );
        CREATE INDEX IF NOT EXISTS idx_lc_problems_slug ON lc_problems(slug);
    """)
    conn.commit()

    done = load_done(conn)
    stats = {"done": 0, "skipped": len(done), "failed": 0}

    async with aiohttp.ClientSession() as session:
        all_meta = await fetch_all_metadata(session)
        total = len(all_meta)
        remaining = [m for m in all_meta if str(m.get("questionFrontendId", "")) not in done]
        print(f"  {len(done)} already done, {len(remaining)} to generate\n")

        print(f"🤖 Generating solutions with {OLLAMA_MODEL}…\n")
        for i, meta in enumerate(remaining, 1):
            num   = str(meta.get("questionFrontendId", ""))
            slug  = meta.get("titleSlug", "")
            title = meta.get("title", slug)
            tags  = json.dumps([t["name"] for t in meta.get("topicTags", [])])
            diff  = (meta.get("difficulty") or "").lower()

            if not num or not slug:
                continue

            print(f"  [{i}/{len(remaining)}] #{num} {title}… ", end="", flush=True)
            solution = await generate_ollama(session, title)

            upsert(conn, {
                "num":        num,
                "slug":       slug,
                "title":      title,
                "difficulty": diff,
                "solution":   solution or "",
                "source":     "ollama" if solution else "none",
                "tags":       tags,
            })

            if solution:
                stats["done"] += 1
                print("✓")
            else:
                stats["failed"] += 1
                print("✗")

    print(f"""
✅ Done
   Generated:  {stats['done']}
   Skipped:    {stats['skipped']}
   Failed:     {stats['failed']}
""")
    conn.close()

if __name__ == "__main__":
    asyncio.run(main())
