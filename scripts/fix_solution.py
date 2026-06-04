#!/usr/bin/env python3
"""
Manually update a problem's solution in the DB.

Usage:
    python scripts/fix_solution.py 200

Paste your solution, then press Ctrl+D (Mac/Linux) or Ctrl+Z Enter (Windows) when done.
"""

import sqlite3
import sys
import os

DB_PATH = os.environ.get("VIZ_DB", os.path.join(os.path.dirname(__file__), "..", "problems.db"))

def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/fix_solution.py <problem_number>")
        sys.exit(1)

    num = sys.argv[1].strip()

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    row = conn.execute("SELECT num, title, solution FROM lc_problems WHERE num=?", (num,)).fetchone()

    if not row:
        print(f"✗ Problem #{num} not found in DB")
        conn.close()
        sys.exit(1)

    print(f"#{row['num']} — {row['title']}")
    if row['solution']:
        print(f"\nCurrent solution preview:\n{row['solution'][:200]}...\n")
    else:
        print("\n(no solution currently stored)\n")

    print("Paste your solution below, then press Ctrl+D when done:\n")
    try:
        solution = sys.stdin.read().strip()
    except KeyboardInterrupt:
        print("\nAborted.")
        sys.exit(0)

    if not solution:
        print("✗ No input received, aborting.")
        sys.exit(1)

    if "class Solution" not in solution:
        confirm = input("\n⚠  Solution doesn't contain 'class Solution'. Save anyway? [y/N] ").strip().lower()
        if confirm != 'y':
            print("Aborted.")
            sys.exit(0)

    conn.execute(
        "UPDATE lc_problems SET solution=?, source='manual' WHERE num=?",
        (solution, num)
    )
    conn.commit()
    conn.close()
    print(f"\n✓ Updated #{num} — {row['title']}")

if __name__ == "__main__":
    main()
