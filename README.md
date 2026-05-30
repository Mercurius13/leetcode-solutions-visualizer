# Code Visualiser

A database of solutions to LeetCode problems with a visualiser that helps beginners understand the data structures and algorithms they are learning.

> **Note:** Solutions are AI-generated and not fully verified. All users are welcome to correct any faulty solutions or contribute improvements.

---

## How It Works

Import any problem using its LeetCode problem number. The solution is loaded from a local database (`problems.db`) and rendered step-by-step in an interactive visualiser — showing variable state, data structures (linked lists, trees, arrays, queues, graphs), and execution flow at each line.

## Setup

```bash
# Install dependencies
pip install -r requirements.txt

# (First time only) Populate the solutions database
python scripts/populate_problems.py

# Start the API server
uvicorn server:app --port 5050
```

Then open `index.html` in your browser.

## Contributing

Corrections and improvements to solutions are welcome. Open a PR with the fix and the problem number.

## License

MIT
