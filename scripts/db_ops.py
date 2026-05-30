#!/usr/bin/env python3
"""
Database operations for lc_problems.

Usage examples:
    python scripts/db_ops.py get 200
    python scripts/db_ops.py list --page 0
    python scripts/db_ops.py search "two sum"
    python scripts/db_ops.py update 200 --solution "class Solution:..."
    python scripts/db_ops.py update 200 --source manual
    python scripts/db_ops.py insert --num 9999 --slug my-problem --title "My Problem" --difficulty easy
    python scripts/db_ops.py stats
    python scripts/db_ops.py missing
"""

import sqlite3
import json
import os
import argparse
import sys

DB_PATH = os.environ.get("VIZ_DB", os.path.join(os.path.dirname(__file__), "..", "problems.db"))


# ── Connection ─────────────────────────────────────────────────────────────────

def get_db() -> sqlite3.Connection:
    if not os.path.exists(DB_PATH):
        print(f"✗ Database not found at {DB_PATH}", file=sys.stderr)
        sys.exit(1)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# ── Retrieve ───────────────────────────────────────────────────────────────────

def get_problem(num: str) -> dict | None:
    """Fetch a single problem by number."""
    conn = get_db()
    row = conn.execute("SELECT * FROM lc_problems WHERE num=?", (num,)).fetchone()
    conn.close()
    if not row:
        return None
    data = dict(row)
    try:
        data["tags"] = json.loads(data.get("tags") or "[]")
    except Exception:
        data["tags"] = []
    return data


def list_problems(page: int = 0, page_size: int = 100) -> list[dict]:
    """List problems paginated, ordered by number."""
    conn = get_db()
    rows = conn.execute(
        "SELECT num, slug, title, difficulty, source FROM lc_problems "
        "ORDER BY CAST(num AS INTEGER) LIMIT ? OFFSET ?",
        (page_size, page * page_size),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def search_problems(query: str, limit: int = 20) -> list[dict]:
    """Search problems by title or slug (case-insensitive substring)."""
    conn = get_db()
    q = f"%{query.lower()}%"
    rows = conn.execute(
        "SELECT num, slug, title, difficulty, source FROM lc_problems "
        "WHERE LOWER(title) LIKE ? OR slug LIKE ? "
        "ORDER BY CAST(num AS INTEGER) LIMIT ?",
        (q, q, limit),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_stats() -> dict:
    """Return counts by source and total."""
    conn = get_db()
    total     = conn.execute("SELECT COUNT(*) FROM lc_problems").fetchone()[0]
    with_sol  = conn.execute("SELECT COUNT(*) FROM lc_problems WHERE solution != ''").fetchone()[0]
    by_source = conn.execute(
        "SELECT source, COUNT(*) as n FROM lc_problems GROUP BY source ORDER BY n DESC"
    ).fetchall()
    conn.close()
    return {
        "total":      total,
        "with_solution": with_sol,
        "missing_solution": total - with_sol,
        "by_source":  [dict(r) for r in by_source],
    }


def get_missing() -> list[dict]:
    """Return all problems that have no solution."""
    conn = get_db()
    rows = conn.execute(
        "SELECT num, slug, title, difficulty FROM lc_problems "
        "WHERE solution = '' OR solution IS NULL "
        "ORDER BY CAST(num AS INTEGER)"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ── Insert ─────────────────────────────────────────────────────────────────────

def insert_problem(
    num: str,
    slug: str,
    title: str,
    difficulty: str = "",
    description: str = "",
    starter: str = "",
    solution: str = "",
    source: str = "manual",
    tags: list[str] | None = None,
) -> bool:
    """
    Insert a new problem. Returns False if num already exists (use update instead).
    """
    conn = get_db()
    existing = conn.execute("SELECT num FROM lc_problems WHERE num=?", (num,)).fetchone()
    if existing:
        conn.close()
        print(f"✗ Problem #{num} already exists. Use update instead.")
        return False
    conn.execute(
        """INSERT INTO lc_problems (num, slug, title, difficulty, description, starter, solution, source, tags)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        (num, slug, title, difficulty, description, starter, solution, source, json.dumps(tags or [])),
    )
    conn.commit()
    conn.close()
    print(f"✓ Inserted #{num} — {title}")
    return True


# ── Update ─────────────────────────────────────────────────────────────────────

def update_problem(num: str, **fields) -> bool:
    """
    Update one or more fields on an existing problem.
    Allowed fields: solution, starter, description, source, title, difficulty, tags
    """
    allowed = {"solution", "starter", "description", "source", "title", "difficulty", "tags"}
    updates = {k: v for k, v in fields.items() if k in allowed and v is not None}
    if not updates:
        print("✗ No valid fields to update.")
        return False

    conn = get_db()
    existing = conn.execute("SELECT num FROM lc_problems WHERE num=?", (num,)).fetchone()
    if not existing:
        conn.close()
        print(f"✗ Problem #{num} not found.")
        return False

    if "tags" in updates and isinstance(updates["tags"], list):
        updates["tags"] = json.dumps(updates["tags"])

    set_clause = ", ".join(f"{k}=?" for k in updates)
    values = list(updates.values()) + [num]
    conn.execute(f"UPDATE lc_problems SET {set_clause} WHERE num=?", values)
    conn.commit()
    conn.close()
    print(f"✓ Updated #{num}: {', '.join(updates.keys())}")
    return True


# ── CLI ────────────────────────────────────────────────────────────────────────

def _print_problem(data: dict):
    print(f"\n#{data['num']}  {data['title']}  [{data.get('difficulty','')}]")
    print(f"  slug:   {data['slug']}")
    print(f"  source: {data.get('source','')}")
    print(f"  tags:   {', '.join(data.get('tags', []))}")
    has_sol = bool(data.get('solution'))
    print(f"  solution: {'✓ present' if has_sol else '✗ missing'}")
    if has_sol:
        preview = data['solution'][:120].replace('\n', ' ')
        print(f"  preview: {preview}…")


def main():
    parser = argparse.ArgumentParser(description="lc_problems DB operations")
    sub = parser.add_subparsers(dest="cmd", required=True)

    # get
    p_get = sub.add_parser("get", help="Fetch one problem by number")
    p_get.add_argument("num")

    # list
    p_list = sub.add_parser("list", help="List problems (paginated)")
    p_list.add_argument("--page", type=int, default=0)
    p_list.add_argument("--size", type=int, default=20)

    # search
    p_search = sub.add_parser("search", help="Search by title/slug")
    p_search.add_argument("query")
    p_search.add_argument("--limit", type=int, default=20)

    # stats
    sub.add_parser("stats", help="Show DB statistics")

    # missing
    sub.add_parser("missing", help="List problems with no solution")

    # insert
    p_ins = sub.add_parser("insert", help="Insert a new problem")
    p_ins.add_argument("--num",        required=True)
    p_ins.add_argument("--slug",       required=True)
    p_ins.add_argument("--title",      required=True)
    p_ins.add_argument("--difficulty", default="")
    p_ins.add_argument("--solution",   default="")
    p_ins.add_argument("--source",     default="manual")

    # update
    p_upd = sub.add_parser("update", help="Update fields on an existing problem")
    p_upd.add_argument("num")
    p_upd.add_argument("--solution",    default=None)
    p_upd.add_argument("--starter",     default=None)
    p_upd.add_argument("--description", default=None)
    p_upd.add_argument("--source",      default=None)
    p_upd.add_argument("--title",       default=None)
    p_upd.add_argument("--difficulty",  default=None)

    args = parser.parse_args()

    if args.cmd == "get":
        data = get_problem(args.num)
        if data: _print_problem(data)
        else: print(f"✗ Problem #{args.num} not found")

    elif args.cmd == "list":
        rows = list_problems(args.page, args.size)
        print(f"Page {args.page} ({len(rows)} problems):")
        for r in rows:
            sol = "✓" if r.get("source") not in ("none", "") else "✗"
            print(f"  {sol} #{r['num']:>4}  {r['title'][:50]:<50}  {r.get('difficulty',''):>6}  [{r.get('source','')}]")

    elif args.cmd == "search":
        rows = search_problems(args.query, args.limit)
        print(f"{len(rows)} result(s) for '{args.query}':")
        for r in rows:
            sol = "✓" if r.get("source") not in ("none", "") else "✗"
            print(f"  {sol} #{r['num']:>4}  {r['title']}")

    elif args.cmd == "stats":
        s = get_stats()
        print(f"\nTotal problems:    {s['total']}")
        print(f"With solution:     {s['with_solution']}")
        print(f"Missing solution:  {s['missing_solution']}")
        print("\nBy source:")
        for row in s["by_source"]:
            print(f"  {row['source'] or 'none':>12}  {row['n']}")

    elif args.cmd == "missing":
        rows = get_missing()
        print(f"{len(rows)} problems missing a solution:")
        for r in rows:
            print(f"  #{r['num']:>4}  {r['title']}")

    elif args.cmd == "insert":
        insert_problem(
            num=args.num, slug=args.slug, title=args.title,
            difficulty=args.difficulty, solution=args.solution, source=args.source,
        )

    elif args.cmd == "update":
        update_problem(
            args.num,
            solution=args.solution,
            starter=args.starter,
            description=args.description,
            source=args.source,
            title=args.title,
            difficulty=args.difficulty,
        )


if __name__ == "__main__":
    main()
