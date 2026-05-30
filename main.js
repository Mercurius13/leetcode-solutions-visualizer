// ── State ──────────────────────────────────────────────────────────────────────
let pyodide       = null;
let trace         = [];
let step          = 0;
let playTimer     = null;
let userLineCount = 0;
let blockStructure   = null;  // { blocks, lineToBlocks }
let iterCounts       = [];    // per-step iteration counts
let initialHeap      = {};    // heap snapshot from first trace step (full tree captured here)
let initialTreeRoots = {};    // varName -> nodeId for tree vars at step 0

// ── LeetCode built-in types ───────────────────────────────────────────────────
const PRELUDE_CODE = `
from typing import List, Optional, Dict, Set, Tuple, Any, Union
from collections import defaultdict, deque, Counter, OrderedDict
import heapq, math, functools, itertools

class ListNode:
    def __init__(self, val=0, next=None):
        self.val  = val
        self.next = next
    def __repr__(self):
        vals, cur = [], self
        while cur and len(vals) < 20:
            vals.append(str(cur.val))
            cur = cur.next
        return '->'.join(vals) + ('->...' if cur else '->None')

class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val   = val
        self.left  = left
        self.right = right
    def __repr__(self):
        return f'TreeNode({self.val})'

class Node:
    def __init__(self, val=0, children=None, next=None, random=None,
                 neighbors=None, left=None, right=None, prev=None, child=None):
        self.val = val
        if children  is not None: self.children  = children
        if next      is not None: self.next      = next
        if random    is not None: self.random    = random
        if neighbors is not None: self.neighbors = neighbors
        if left      is not None: self.left      = left
        if right     is not None: self.right     = right
        if prev      is not None: self.prev      = prev
        if child     is not None: self.child     = child
    def __repr__(self):
        return f'Node({self.val})'
`;

// ── Examples ──────────────────────────────────────────────────────────────────
const EXAMPLES = {
  twosum: {
    code: `class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        seen = {}
        for i in range(len(nums)):
            comp = target - nums[i]
            if comp in seen:
                return [seen[comp], i]
            seen[nums[i]] = i
        return []`,
    params: { nums: '[2, 7, 11, 15]', target: '9' },
    slug: 'two-sum'
  },
  palindrome: {
    code: `class Solution:
    def isPalindrome(self, s: str) -> bool:
        cleaned = ''
        for ch in s:
            if ch.isalnum():
                cleaned += ch.lower()
        left, right = 0, len(cleaned) - 1
        while left < right:
            if cleaned[left] != cleaned[right]:
                return False
            left += 1
            right -= 1
        return True`,
    params: { s: '"racecar"' },
    slug: 'valid-palindrome'
  },
  maxsubarray: {
    code: `class Solution:
    def maxSubArray(self, nums: List[int]) -> int:
        max_sum = nums[0]
        curr = nums[0]
        for i in range(1, len(nums)):
            curr = max(nums[i], curr + nums[i])
            max_sum = max(max_sum, curr)
        return max_sum`,
    params: { nums: '[-2, 1, -3, 4, -1, 2, 1, -5, 4]' },
    slug: 'maximum-subarray'
  },
  linkedlist: {
    code: `class Solution:
    def reverseList(self, head: ListNode) -> ListNode:
        prev = None
        curr = head
        while curr:
            nxt       = curr.next
            curr.next = prev
            prev      = curr
            curr      = nxt
        return prev`,
    params: { head: '[1, 2, 3, 4, 5]' },
    slug: 'reverse-linked-list'
  },
  binarytree: {
    code: `class Solution:
    def maxDepth(self, root: TreeNode) -> int:
        if not root:
            return 0
        left  = self.maxDepth(root.left)
        right = self.maxDepth(root.right)
        return 1 + max(left, right)`,
    params: { root: '[3, 9, 20, null, null, 15, 7]' },
    slug: 'maximum-depth-of-binary-tree'
  },
  bfs: {
    code: `from collections import deque
class Solution:
    def levelOrder(self, root: TreeNode) -> List[List[int]]:
        if not root:
            return []
        result = []
        queue  = deque([root])
        while queue:
            level = []
            for _ in range(len(queue)):
                node = queue.popleft()
                level.append(node.val)
                if node.left:  queue.append(node.left)
                if node.right: queue.append(node.right)
            result.append(level)
        return result`,
    params: { root: '[3, 9, 20, null, null, 15, 7]' },
    slug: 'binary-tree-level-order-traversal'
  },
  dp: {
    code: `class Solution:
    def climbStairs(self, n: int) -> int:
        if n <= 2:
            return n
        dp = [0] * (n + 1)
        dp[1] = 1
        dp[2] = 2
        for i in range(3, n + 1):
            dp[i] = dp[i - 1] + dp[i - 2]
        return dp[n]`,
    params: { n: '6' },
    slug: 'climbing-stairs'
  },
  islands: {
    code: `class Solution:
    def numIslands(self, grid: List[List[int]]) -> int:
        rows, cols = len(grid), len(grid[0])
        count = 0
        def dfs(grid, r, c):
            if r < 0 or r >= rows: return
            if c < 0 or c >= cols: return
            if grid[r][c] != 1: return
            grid[r][c] = 0
            dfs(grid, r+1, c); dfs(grid, r-1, c)
            dfs(grid, r, c+1); dfs(grid, r, c-1)
        for r in range(rows):
            for c in range(cols):
                if grid[r][c] == 1:
                    dfs(grid, r, c)
                    count += 1
        return count`,
    params: { grid: '[[1,1,0,0],[1,1,0,0],[0,0,1,0],[0,0,0,1]]' },
    slug: 'number-of-islands'
  },
  heap: {
    code: `import heapq
class Solution:
    def findKthLargest(self, nums: List[int], k: int) -> int:
        heap = []
        for num in nums:
            heapq.heappush(heap, num)
            if len(heap) > k:
                heapq.heappop(heap)
        return heap[0]`,
    params: { nums: '[3, 2, 1, 5, 6, 4]', k: '2' },
    slug: 'kth-largest-element-in-an-array'
  },
  strpointers: {
    code: `class Solution:
    def lengthOfLongestSubstring(self, s: str) -> int:
        char_set = set()
        left = 0
        max_len = 0
        for right in range(len(s)):
            while s[right] in char_set:
                char_set.remove(s[left])
                left += 1
            char_set.add(s[right])
            max_len = max(max_len, right - left + 1)
        return max_len`,
    params: { s: '"abcabcbb"' },
    slug: 'longest-substring-without-repeating-characters'
  },
  intervals: {
    code: `class Solution:
    def merge(self, intervals: List[List[int]]) -> List[List[int]]:
        intervals.sort(key=lambda x: x[0])
        merged = []
        for interval in intervals:
            if not merged or merged[-1][1] < interval[0]:
                merged.append(interval)
            else:
                merged[-1][1] = max(merged[-1][1], interval[1])
        return merged`,
    params: { intervals: '[[1,3],[2,6],[8,10],[15,18]]' },
    slug: 'merge-intervals'
  },
  adjgraph: {
    code: `class Solution:
    def canFinish(self, numCourses: int, prerequisites: List[List[int]]) -> bool:
        graph = [[] for _ in range(numCourses)]
        for a, b in prerequisites:
            graph[b].append(a)
        visited = set()
        path    = set()
        def dfs(node):
            if node in path:    return False
            if node in visited: return True
            path.add(node)
            for nb in graph[node]:
                if not dfs(nb): return False
            path.discard(node)
            visited.add(node)
            return True
        return all(dfs(i) for i in range(numCourses))`,
    params: { numCourses: '4', prerequisites: '[[1,0],[2,0],[3,1],[3,2]]' },
    slug: 'course-schedule'
  },
  binarysearch: {
    code: `class Solution:
    def search(self, nums: List[int], target: int) -> int:
        lo, hi = 0, len(nums) - 1
        while lo <= hi:
            mid = lo + (hi - lo) // 2
            if nums[mid] == target:
                return mid
            elif nums[mid] < target:
                lo = mid + 1
            else:
                hi = mid - 1
        return -1`,
    params: { nums: '[-1, 0, 3, 5, 9, 12]', target: '9' },
    slug: 'binary-search'
  },
  stackproblem: {
    code: `class Solution:
    def isValid(self, s: str) -> bool:
        stack = []
        pairs = {')': '(', '}': '{', ']': '['}
        for ch in s:
            if ch in '([{':
                stack.append(ch)
            elif ch in ')]}':
                if not stack or stack[-1] != pairs[ch]:
                    return False
                stack.pop()
        return not stack`,
    params: { s: '"()[]{}"' },
    slug: 'valid-parentheses'
  },
  dp2d: {
    code: `class Solution:
    def uniquePaths(self, m: int, n: int) -> int:
        dp = [[1] * n for _ in range(m)]
        for i in range(1, m):
            for j in range(1, n):
                dp[i][j] = dp[i - 1][j] + dp[i][j - 1]
        return dp[m - 1][n - 1]`,
    params: { m: '3', n: '4' },
    slug: 'unique-paths'
  },
  narytree: {
    code: `class Solution:
    def maxDepth(self, root: Node) -> int:
        if not root:
            return 0
        if not root.children:
            return 1
        return 1 + max(self.maxDepth(c) for c in root.children)`,
    params: { root: '[1, null, 3, 2, 4, null, 5, 6]' },
    slug: 'maximum-depth-of-n-ary-tree'
  },
  twopointers: {
    code: `class Solution:
    def twoSum(self, numbers: List[int], target: int) -> List[int]:
        left, right = 0, len(numbers) - 1
        while left < right:
            s = numbers[left] + numbers[right]
            if s == target:
                return [left + 1, right + 1]
            elif s < target:
                left += 1
            else:
                right -= 1
        return []`,
    params: { numbers: '[2, 7, 11, 15]', target: '9' },
    slug: 'two-sum-ii-input-array-is-sorted'
  },
  matrix: {
    code: `class Solution:
    def floodFill(self, image: List[List[int]], sr: int, sc: int, color: int) -> List[List[int]]:
        orig = image[sr][sc]
        if orig == color:
            return image
        def dfs(image, r, c):
            if r < 0 or r >= len(image): return
            if c < 0 or c >= len(image[0]): return
            if image[r][c] != orig: return
            image[r][c] = color
            dfs(image, r+1, c); dfs(image, r-1, c)
            dfs(image, r, c+1); dfs(image, r, c-1)
        dfs(image, sr, sc)
        return image`,
    params: { image: '[[1,1,1],[1,1,0],[1,0,1]]', sr: '1', sc: '1', color: '2' },
    slug: 'flood-fill'
  },
  middlell: {
    code: `class Solution:
    def middleNode(self, head: ListNode) -> ListNode:
        slow = head
        fast = head
        while fast and fast.next:
            slow = slow.next
            fast = fast.next.next
        return slow`,
    params: { head: '[1, 2, 3, 4, 5]' },
    slug: 'middle-of-the-linked-list'
  },
  lca: {
    code: `class Solution:
    def lowestCommonAncestor(self, root: TreeNode, p: int, q: int) -> TreeNode:
        if not root:
            return None
        if root.val == p or root.val == q:
            return root
        left  = self.lowestCommonAncestor(root.left, p, q)
        right = self.lowestCommonAncestor(root.right, p, q)
        if left and right:
            lca = root
            return lca
        return left or right`,
    params: { root: '[3, 5, 1, 6, 2, 0, 8, null, null, 7, 4]', p: '5', q: '1' },
    slug: 'lowest-common-ancestor-of-a-binary-tree'
  },
  inverttree: {
    code: `class Solution:
    def invertTree(self, root: TreeNode) -> TreeNode:
        if not root:
            return None
        root.left, root.right = root.right, root.left
        self.invertTree(root.left)
        self.invertTree(root.right)
        return root`,
    params: { root: '[4, 2, 7, 1, 3, 6, 9]' },
    slug: 'invert-binary-tree'
  },
  coinchange: {
    code: `class Solution:
    def coinChange(self, coins: List[int], amount: int) -> int:
        INF = amount + 1
        dp  = [INF] * (amount + 1)
        dp[0] = 0
        for i in range(1, amount + 1):
            for coin in coins:
                if coin <= i:
                    dp[i] = min(dp[i], dp[i - coin] + 1)
        return dp[amount] if dp[amount] != INF else -1`,
    params: { coins: '[1, 5, 11]', amount: '11' },
    slug: 'coin-change'
  }
};

// ── Python AST tracer ─────────────────────────────────────────────────────────
const TRACER = `
import ast, inspect, sys, io, json

_trace = []
_buf   = io.StringIO()
_MAX   = 800
_PRIM  = (bool, int, float, str, type(None))
_heap  = {}

def _ser(v):
    t   = type(v).__name__
    ip  = isinstance(v, _PRIM)
    oid = id(v)
    if not ip and oid in _heap:
        return {'t': t, 'r': _heap[oid].get('r', '?'), 'id': oid, 'p': False}
    try:    r = repr(v)[:120]
    except: r = f'<{t}>'
    o = {'t': t, 'r': r, 'id': oid, 'p': ip}
    if isinstance(v, bool): o['t'] = 'bool'
    elif isinstance(v, str) and len(v) <= 80: o['chars'] = list(v)
    elif isinstance(v, (list, tuple)):
        o['items'] = [_ser(x) for x in v[:40]]
    elif isinstance(v, dict):
        o['items'] = [[repr(k), _ser(vv)] for k, vv in list(v.items())[:30]]
    elif isinstance(v, set):
        o['items'] = [_ser(x) for x in sorted(v, key=str)[:30]]
    elif type(v).__name__ == 'deque':
        o['t'] = 'deque'
        o['items'] = [_ser(x) for x in list(v)[:40]]
    elif not ip:
        _heap[oid] = o
        try:
            o['attrs'] = {k2: _ser(v2) for k2, v2 in list(vars(v).items()) if not k2.startswith('_')}
        except: pass
        _heap[oid] = o
    return o

_last_access = [None]
def __access__(obj, key):
    _last_access[0] = {
        'id':  id(obj),
        'key': key if isinstance(key, (int, str, float, bool, type(None))) else repr(key)
    }
    return obj[key]

_HIDDEN = {
    '__snap__', '__access__', '__builtins__', '_solution', '_result', 'self',
    '_build_ll', '_build_tree', '_build_nary', '_DRIVER_FNS',
    '_heap', '_buf', '_trace', '_MAX', '_PRIM', '_last_access',
    'ListNode', 'TreeNode', 'Node', 'deque', 'json', 'ast', 'inspect', 'sys', 'io',
    'heapq', 'math', 'functools', 'itertools', 'defaultdict', 'Counter', 'OrderedDict',
    'List', 'Optional', 'Dict', 'Set', 'Tuple', 'Any', 'Union',
}

_DRIVER_FNS = {'_build_ll', '_build_tree', '_build_nary', '<module>', '__snap__'}

def __snap__(ln, fn):
    global _heap
    if len(_trace) >= _MAX: return
    _heap = {}
    frame = inspect.currentframe().f_back
    locs  = {}
    for k, v in frame.f_locals.items():
        if k.startswith('__') or k in _HIDDEN: continue
        try:    locs[k] = _ser(v)
        except: locs[k] = {'t': 'error', 'r': '?', 'id': 0, 'p': True}
    # Capture caller info so recursive call sites can be highlighted
    caller = None
    pf = frame.f_back
    if pf is not None:
        cfn = getattr(pf.f_code, 'co_name', None)
        if cfn and cfn not in _DRIVER_FNS:
            caller = {'ln': pf.f_lineno, 'fn': cfn}
    acc = _last_access[0]
    _last_access[0] = None
    _trace.append({'ln': ln, 'fn': fn, 'lc': locs, 'caller': caller,
                   'hp': {str(k): v for k, v in _heap.items()},
                   'out': _buf.getvalue(), 'acc': acc})

class _SubVis(ast.NodeTransformer):
    def visit_Subscript(self, node):
        self.generic_visit(node)
        if isinstance(node.ctx, ast.Load):
            new = ast.Call(func=ast.Name(id='__access__', ctx=ast.Load()),
                           args=[node.value, node.slice], keywords=[])
            ast.copy_location(new, node); ast.fix_missing_locations(new)
            return new
        return node

class _Inst(ast.NodeTransformer):
    def __init__(self): self._fn = '<module>'
    def _snap(self, ln):
        call = ast.Call(func=ast.Name(id='__snap__', ctx=ast.Load()),
                        args=[ast.Constant(value=ln), ast.Constant(value=self._fn)], keywords=[])
        expr = ast.Expr(value=call)
        expr.lineno = expr.col_offset = expr.end_lineno = expr.end_col_offset = ln
        ast.fix_missing_locations(expr)
        return expr
    def _body(self, stmts):
        out = []
        for s in (stmts or []): out.extend(self._stmt(s))
        return out or [ast.Pass()]
    def _stmt(self, s):
        ln = getattr(s, 'lineno', 0)
        t  = type(s).__name__
        if t in ('FunctionDef','AsyncFunctionDef'): return [self._func(s)]
        if t == 'ClassDef': s.body = self._body(s.body); return [s]
        if t == 'Return': return [self._snap(ln), s]
        if t == 'For':
            s.body = [self._snap(ln)] + self._body(s.body)
            s.orelse = self._body(s.orelse) if s.orelse else []
            return [s]
        if t == 'While':
            s.body = [self._snap(ln)] + self._body(s.body)
            s.orelse = self._body(s.orelse) if s.orelse else []
            return [s]
        if t == 'If':
            s.body = self._body(s.body); s.orelse = self._body(s.orelse) if s.orelse else []
            return [self._snap(ln), s]
        if t in ('Assign','AugAssign','AnnAssign'): return [s, self._snap(ln)]
        if t in ('Expr','Delete','Global','Nonlocal'): return [s, self._snap(ln)]
        if t in ('Import','ImportFrom'): return [s, self._snap(ln)]
        if t in ('Break','Continue','Raise'): return [self._snap(ln), s]
        if t == 'Pass': return [self._snap(ln)]
        if t == 'With': s.body = self._body(s.body); return [self._snap(ln), s]
        if t == 'Try':
            s.body = self._body(s.body)
            for h in s.handlers: h.body = self._body(h.body)
            s.orelse = self._body(s.orelse)
            s.finalbody = self._body(s.finalbody) if s.finalbody else []
            return [s]
        return [s]
    def _func(self, node):
        old, self._fn = self._fn, node.name
        node.body = [self._snap(node.lineno)] + self._body(node.body)
        self._fn = old
        return node
    def visit_Module(self, node):
        node.body = self._body(node.body); return node

sys.stdout = _buf
_err = None
try:
    tree = ast.parse(_code)
    _SubVis().visit(tree); _Inst().visit(tree); ast.fix_missing_locations(tree)
    compiled = compile(tree, '<string>', 'exec')
    globs = {
        '__snap__': __snap__, '__access__': __access__,
        '__name__': '__main__', '__builtins__': __builtins__,
        # LeetCode built-in types
        'ListNode': ListNode, 'TreeNode': TreeNode, 'Node': Node,
        # typing
        'List': List, 'Optional': Optional, 'Dict': Dict, 'Set': Set,
        'Tuple': Tuple, 'Any': Any, 'Union': Union,
        # collections / stdlib
        'defaultdict': defaultdict, 'deque': deque, 'Counter': Counter,
        'OrderedDict': OrderedDict,
        'heapq': heapq, 'math': math, 'functools': functools, 'itertools': itertools,
    }
    exec(compiled, globs)
except SyntaxError as e:
    _err = f'SyntaxError line {e.lineno}: {e.msg}'
except (ImportError, ModuleNotFoundError) as e:
    _err = (f'{e}\\n\\nOnly these modules are available in the browser runtime: '
            'typing, collections (deque, defaultdict, Counter, OrderedDict), '
            'heapq, math, functools, itertools. '
            'Remove any other imports.')
except Exception as e:
    _err = f'{type(e).__name__}: {e}'
finally:
    sys.stdout = sys.__stdout__

json.dumps({'trace': _trace, 'error': _err, 'out': _buf.getvalue(), 'truncated': len(_trace) >= _MAX})
`;

// ══════════════════════════════════════════════════════════════════════════════
// BLOCK STRUCTURE PARSER
// ══════════════════════════════════════════════════════════════════════════════
function parseBlockStructure(code) {
  const lines = code.split('\n');
  const blocks = [];
  const stack  = [];  // {type, header, startLine, indent}

  lines.forEach((raw, i) => {
    const lineNum = i + 1;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const indent = raw.match(/^(\s*)/)[0].length;

    // Close blocks whose indent is >= current (they ended before this line)
    while (stack.length && indent <= stack[stack.length - 1].indent) {
      const closed = stack.pop();
      closed.endLine = lineNum - 1;
      blocks.push(closed);
    }

    // Detect openers
    const forM   = trimmed.match(/^(for\s+.+?):\s*$/);
    const whileM = trimmed.match(/^(while\s+.+?):\s*$/);
    const ifM    = trimmed.match(/^(if\s+.+?):\s*$/);
    const elifM  = trimmed.match(/^(elif\s+.+?):\s*$/);
    const elseM  = /^else\s*:/.test(trimmed);
    const defM   = trimmed.match(/^(def\s+\w+.*?):\s*$/);

    let type = null, header = trimmed.replace(/:$/, '');
    if (forM)   type = 'for';
    if (whileM) type = 'while';
    if (ifM)    type = 'if';
    if (elifM)  type = 'elif';
    if (elseM)  { type = 'else'; header = 'else'; }
    if (defM)   type = 'def';

    if (type) stack.push({ type, header, startLine: lineNum, indent, endLine: lines.length });
  });

  // Flush remaining open blocks
  while (stack.length) {
    const closed = stack.pop();
    closed.endLine = lines.length;
    blocks.push(closed);
  }

  // Build line → [blocks] map (sorted outer→inner)
  const lineToBlocks = {};
  blocks.forEach(b => {
    for (let ln = b.startLine; ln <= b.endLine; ln++) {
      if (!lineToBlocks[ln]) lineToBlocks[ln] = [];
      lineToBlocks[ln].push(b);
    }
  });
  for (const ln in lineToBlocks) {
    lineToBlocks[ln].sort((a, b) => a.indent - b.indent);
  }

  return { blocks, lineToBlocks };
}

// ══════════════════════════════════════════════════════════════════════════════
// ITERATION COUNT BUILDER
// Pass through trace once, incrementing per-loop counters each time we hit
// a loop header line (the snap fires there every iteration).
// ══════════════════════════════════════════════════════════════════════════════
function buildIterCounts(traceArr, blocks) {
  const loopHeaderLines = new Set(
    blocks.filter(b => b.type === 'for' || b.type === 'while').map(b => b.startLine)
  );
  const counts = {};  // headerLine -> cumulative count
  loopHeaderLines.forEach(ln => { counts[ln] = 0; });

  return traceArr.map(s => {
    if (loopHeaderLines.has(s.ln)) counts[s.ln]++;
    return { ...counts };
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// DIFF ENGINE
// ══════════════════════════════════════════════════════════════════════════════
function computeDiff(prev, curr) {
  if (!prev) return [];
  const changes = [];
  for (const [name, val] of Object.entries(curr || {})) {
    const old = prev[name];
    if (!old)                changes.push({ name, type: 'new',     to: val.r, toObj: val });
    else if (old.r !== val.r) changes.push({ name, type: 'changed', from: old.r, to: val.r, fromObj: old, toObj: val });
  }
  for (const name of Object.keys(prev || {})) {
    if (!(name in (curr || {}))) changes.push({ name, type: 'deleted', from: prev[name].r });
  }
  return changes;
}

// ══════════════════════════════════════════════════════════════════════════════
// RANGE RESOLVER  (for loop progress bars)
// ══════════════════════════════════════════════════════════════════════════════
function resolveInt(expr, locals) {
  const n = Number(expr.trim());
  if (!isNaN(n)) return n;
  // simple var name
  if (/^\w+$/.test(expr.trim())) {
    const v = locals[expr.trim()];
    if (v && v.p) { const n2 = Number(v.r); if (!isNaN(n2)) return n2; }
  }
  // len(arr)
  const lenM = expr.trim().match(/^len\((\w+)\)$/);
  if (lenM) {
    const v = locals[lenM[1]];
    if (v && v.items) return v.items.length;
  }
  return null;
}

function parseRangeArgs(header, locals) {
  // "for X in range(...)"
  const m = header.match(/\brange\((.+)\)/);
  if (!m) return null;
  const raw = m[1];
  // Split args respecting nesting
  const args = [];
  let depth = 0, start = 0;
  for (let i = 0; i <= raw.length; i++) {
    const c = raw[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if ((c === ',' || i === raw.length) && depth === 0) {
      args.push(raw.slice(start, i).trim());
      start = i + 1;
    }
  }
  if (args.length === 1) {
    const stop = resolveInt(args[0], locals);
    return stop !== null ? { start: 0, stop, step: 1 } : null;
  }
  if (args.length >= 2) {
    const s = resolveInt(args[0], locals), e = resolveInt(args[1], locals);
    const st = args[2] ? resolveInt(args[2], locals) : 1;
    if (s !== null && e !== null) return { start: s, stop: e, step: st || 1 };
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════════════
// RENDER CONTEXT  (main right-panel renderer)
// ══════════════════════════════════════════════════════════════════════════════
function renderContext(stepIdx) {
  const s      = trace[stepIdx];
  const prev   = stepIdx > 0 ? trace[stepIdx - 1] : null;
  const iters  = iterCounts[stepIdx] || {};
  const locals = s.lc || {};
  const heap   = s.hp || {};
  const diff   = computeDiff(prev?.lc, locals);
  const activeBlocks = blockStructure ? (blockStructure.lineToBlocks[s.ln] || []) : [];

  const scroll = $('exec-scroll');
  scroll.innerHTML = '';

  // ── func label in header
  const fl = $('exec-func-label');
  if (s.fn && s.fn !== '<module>') {
    fl.textContent = `in  ${s.fn}()`;
    fl.style.display = '';
  } else {
    fl.style.display = 'none';
  }

  // ── 1. Scope frame: primitive variables in current scope
  const prims = Object.entries(locals).filter(([, v]) => v.p);
  const refs  = Object.entries(locals).filter(([, v]) => !v.p);

  if (prims.length || refs.length) {
    const frame = el('div', 'scope-frame');
    const hdr   = el('div', 'scope-frame-header');
    const isRecursiveCall = s.caller && s.caller.fn === s.fn;
    const recBadge = isRecursiveCall ? ` <span style="font-size:0.6rem;background:#f97316;color:white;border-radius:3px;padding:0 4px;font-weight:900;margin-left:4px">recursive</span>` : '';
    hdr.innerHTML = `<span style="color:#facc15;font-size:0.8rem">◆</span> ${esc(s.fn && s.fn !== '<module>' ? s.fn + '()' : 'global')}${recBadge}`;
    frame.appendChild(hdr);

    const varsDiv = el('div', 'scope-frame-vars');
    prims.forEach(([name, val]) => {
      const row = el('div', 'scope-var-row');
      const cls = val.t === 'str' ? 'scope-var-val t-str'
                : val.t === 'bool' ? 'scope-var-val t-bool'
                : val.t === 'NoneType' ? 'scope-var-val t-none'
                : 'scope-var-val';
      row.innerHTML = `<span class="scope-var-name">${esc(name)}</span><span class="scope-var-eq">=</span><span class="${cls}" title="${esc(val.r)}">${esc(val.r)}</span>`;
      varsDiv.appendChild(row);
    });
    refs.forEach(([name, val]) => {
      const row = el('div', 'scope-var-row');
      const display = val.r && val.r !== '?' ? esc(truncate(val.r, 28)) : `→ ${esc(val.t)}`;
      row.innerHTML = `<span class="scope-var-name">${esc(name)}</span><span class="scope-var-eq">=</span><span class="scope-var-ref" title="${esc(val.r)}">${display}</span>`;
      varsDiv.appendChild(row);
    });
    frame.appendChild(varsDiv);
    scroll.appendChild(frame);
  }

  // ── 2. Data structures (LL chains, trees, arrays with pointers, matrices)
  const structItems = buildStructures(locals, heap, s.acc, s, stepIdx);
  if (structItems.length) {
    const section = el('div', 'structures-section');
    const hdr     = el('div', 'structures-header');
    hdr.textContent = '◆ Data';
    section.appendChild(hdr);
    const body = el('div', 'structures-body');
    structItems.forEach(item => body.appendChild(item));
    section.appendChild(body);
    scroll.appendChild(section);
  }

  // ── 3. Active loop cards (innermost first — was 2)
  const next = stepIdx + 1 < trace.length ? trace[stepIdx + 1] : null;
  const activeLoops = activeBlocks
    .filter(b => b.type === 'for' || b.type === 'while')
    .slice()
    .reverse();  // innermost first

  activeLoops.forEach(block => {
    const iterNum = iters[block.startLine] || 1;
    const card = el('div', 'loop-card');

    // Header
    const hdr = el('div', 'loop-card-header');
    const condText = block.header.replace(/^(for|while)\s+/, '');
    hdr.innerHTML =
      `<span class="loop-icon">↻</span>` +
      `<span class="loop-keyword">${esc(block.type)}</span>` +
      `<span class="loop-cond" title="${esc(condText)}">${esc(condText)}</span>`;
    card.appendChild(hdr);

    // Detect if the loop body is never entered (condition false / empty iterable)
    const atHeader   = s.ln === block.startLine;
    const bodyEntered = next && next.ln > block.startLine && next.ln <= block.endLine;
    if (atHeader && !bodyEntered) {
      const verdict = el('div', 'branch-result branch-false');
      verdict.innerHTML = `<span>✗ skipped  →  0 iterations</span>`;
      card.appendChild(verdict);
      scroll.appendChild(card);
      return;
    }

    const body = el('div', 'loop-card-body');

    // Iteration row
    const iterRow = el('div', 'loop-iter-row');
    const badge   = el('span', 'iter-badge');
    badge.textContent = `pass ${iterNum}`;
    iterRow.appendChild(badge);

    // Progress bar for range() loops
    if (block.type === 'for') {
      const range = parseRangeArgs(block.header, locals);
      if (range) {
        const forVarM = block.header.match(/^for\s+(\w+)\s+in/);
        const curVar  = forVarM ? locals[forVarM[1]] : null;
        const cur     = curVar ? Number(curVar.r) : null;
        if (cur !== null) {
          const total = Math.abs(range.stop - range.start);
          const done  = Math.abs(cur - range.start);
          const pct   = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
          const track = el('div', 'progress-track');
          const fill  = el('div', 'progress-fill');
          fill.style.width = pct + '%';
          track.appendChild(fill);
          const lbl = el('span', 'progress-label');
          lbl.textContent = `${cur} / ${range.stop}`;
          iterRow.appendChild(track);
          iterRow.appendChild(lbl);
        }
      }
    }
    body.appendChild(iterRow);

    // Loop variable chips
    if (block.type === 'for') {
      const forVarsM = block.header.match(/^for\s+(.+?)\s+in/);
      if (forVarsM) {
        const varNames = forVarsM[1].split(',').map(s => s.trim());
        const chips = el('div', 'loop-var-row');
        varNames.forEach(vname => {
          if (locals[vname]) {
            const chip = el('span', 'loop-var-chip');
            chip.textContent = `${vname} = ${locals[vname].r}`;
            chips.appendChild(chip);
          }
        });
        if (chips.children.length) body.appendChild(chips);
      }
    } else {
      // while: show condition variables as chips
      const condVars = extractCondVars(block.header, locals);
      if (condVars.length) {
        const chips = el('div', 'loop-var-row');
        condVars.forEach(({ name, val }) => {
          const chip = el('span', 'loop-var-chip');
          chip.textContent = `${name} = ${val.r}`;
          chips.appendChild(chip);
        });
        body.appendChild(chips);
      }
    }

    card.appendChild(body);
    scroll.appendChild(card);
  });

  // ── 3. Active branch card — show at header line AND inside body
  const activeBranch = activeBlocks
    .filter(b => b.type === 'if' || b.type === 'elif' || b.type === 'else')
    .pop();
  if (activeBranch && s.ln >= activeBranch.startLine) {
    const isElse      = activeBranch.type === 'else';
    const atHeader    = s.ln === activeBranch.startLine;
    const condText    = activeBranch.header.replace(/^(if|elif)\s+/, '');

    // Look one step ahead to know the condition result even at the header
    let condTrue = null;
    if (!isElse) {
      const next = trace[stepIdx + 1];
      if (next) {
        condTrue = next.ln > activeBranch.startLine && next.ln <= activeBranch.endLine;
      } else {
        // No next step — we're in the body already
        condTrue = !atHeader;
      }
    }

    const card = el('div', 'branch-card');
    const hdr  = el('div', 'branch-card-header');
    hdr.innerHTML =
      `<span class="branch-icon">?</span>` +
      `<span class="branch-keyword">${esc(activeBranch.type)}</span>` +
      `<span class="branch-cond" title="${esc(condText)}">${esc(condText)}</span>`;
    card.appendChild(hdr);

    // Condition variables (always show for if/elif, not for else)
    if (!isElse) {
      const condVars = extractCondVars(condText, locals);
      if (condVars.length) {
        const varsDiv = el('div', 'branch-vars');
        condVars.forEach(({ name, val }) => {
          const row = el('div', 'branch-var-row');
          const cls = val.p ? 'branch-var-val' : 'branch-var-ref';
          row.innerHTML =
            `<span class="branch-var-name">${esc(name)}</span>` +
            `<span class="branch-var-eq">=</span>` +
            `<span class="${cls}" title="${esc(val.r)}">${esc(truncate(val.r, 32))}</span>`;
          varsDiv.appendChild(row);
        });
        card.appendChild(varsDiv);
      }
    }

    // Result verdict
    const result = el('div', 'branch-result');
    if (isElse) {
      result.classList.add('branch-false');
      result.innerHTML = `<span>✗ condition was false</span>`;
    } else if (condTrue === true) {
      result.classList.add('branch-true');
      result.innerHTML = `<span>✓ true</span>`;
    } else if (condTrue === false) {
      result.classList.add('branch-false');
      result.innerHTML = `<span>✗ false  →  skip</span>`;
    } else {
      result.style.color = '#6b7280';
      result.innerHTML = `<span>→ evaluating</span>`;
    }
    card.appendChild(result);
    scroll.appendChild(card);
  }

  // ── 4. Diff panel
  if (diff.length) {
    const section = el('div', 'diff-section');
    const hdr     = el('div', 'diff-header');
    hdr.textContent = '▲ Changes this step';
    section.appendChild(hdr);

    const body = el('div', 'diff-body');
    diff.forEach(({ name, type, from, to }) => {
      const row = el('div', `diff-row diff-${type}`);
      const sign = type === 'new' ? '+' : type === 'changed' ? '~' : '-';
      if (type === 'new') {
        row.innerHTML =
          `<span class="diff-sign">${sign}</span>` +
          `<span class="diff-name">${esc(name)}</span>` +
          `<span class="diff-arrow">←</span>` +
          `<span class="diff-to">${esc(to)}</span>`;
      } else if (type === 'changed') {
        row.innerHTML =
          `<span class="diff-sign">${sign}</span>` +
          `<span class="diff-name">${esc(name)}</span>` +
          `<span class="diff-arrow">←</span>` +
          `<span class="diff-to">${esc(to)}</span>` +
          `<span class="diff-from">(was ${esc(truncate(from, 28))})</span>`;
      } else {
        row.innerHTML =
          `<span class="diff-sign">${sign}</span>` +
          `<span class="diff-name">${esc(name)}</span>` +
          `<span class="diff-from">(gone)</span>`;
      }
      body.appendChild(row);
    });
    section.appendChild(body);
    scroll.appendChild(section);
  }

}

// ── Extract variables mentioned in a condition string ────────────────────────
function extractCondVars(condStr, locals) {
  const mentioned = [];
  const words = condStr.match(/\b[a-zA-Z_]\w*\b/g) || [];
  const seen = new Set();
  words.forEach(w => {
    if (!seen.has(w) && locals[w]) { mentioned.push({ name: w, val: locals[w] }); seen.add(w); }
  });
  return mentioned.slice(0, 4);
}

// ══════════════════════════════════════════════════════════════════════════════
// DETECTION HELPERS
// ══════════════════════════════════════════════════════════════════════════════

// Is this a 2D list (matrix)?
function isMatrix(obj) {
  return obj && !obj.p && obj.t === 'list'
    && obj.items?.length > 0
    && obj.items[0]?.t === 'list'
    && Array.isArray(obj.items[0]?.items);
}

// Common variable names that suggest "index into an array"
// HIGH_CONF: unambiguous index variables — shown with just one match
// Tree node variable roles — used to colour nodes differently per semantic role
const TREE_NODE_NAMES  = ['root','node','cur','curr','n','p','q','parent','child',
                           'left','right','a','b','s','t','u','v','x','y'];
const TREE_RESULT_VARS = new Set(['ans','res','result','lca','found','ret','output',
                                   'successor','predecessor','mid','prev']);
const TREE_QUERY_VARS  = new Set(['p','q','target','other','t','s','a','b']);

// LOW_CONF:  context-dependent — only shown when corroborated by a HIGH_CONF or another LOW_CONF on the same array
// Excluded intentionally: k (count), n/m (size), a/b/x/y (values), p/q (often node refs)
const HIGH_CONF_PTR = new Set(['i','j','l','r','left','right','lo','hi','mid','idx','p1','p2','slow','fast']);
const LOW_CONF_PTR  = new Set(['start','end','ptr','row','col','pos','cur','top','bot','front','back','begin','last','head','tail']);
const PTR_NAMES     = new Set([...HIGH_CONF_PTR, ...LOW_CONF_PTR]);

// Returns { arrayVarName -> [{name, val}] }
function findArrayPointers(locals, heap) {
  // Collect 1-D array variables (non-nested lists)
  const arrays = [];
  for (const [name, val] of Object.entries(locals)) {
    if (val.p || val.t !== 'list') continue;
    const obj = heap[String(val.id)] || val;
    if (!obj.items?.length) continue;
    if (obj.items.some(item => item.t === 'list' && item.items)) continue; // skip matrices
    arrays.push({ name, obj, len: obj.items.length });
  }
  if (!arrays.length) return {};

  // Pass 1: gather ALL candidates per array
  const candidates = {}; // arrName -> [{name, val, isHigh}]
  for (const [name, val] of Object.entries(locals)) {
    if (!val.p || val.t !== 'int') continue;
    if (!PTR_NAMES.has(name)) continue;
    const n = parseInt(val.r);
    if (isNaN(n) || n < 0) continue;
    const isHigh = HIGH_CONF_PTR.has(name);
    for (const arr of arrays) {
      if (n < arr.len) {
        if (!candidates[arr.name]) candidates[arr.name] = [];
        candidates[arr.name].push({ name, val, isHigh });
      }
    }
  }
  // Pass 2: only include arrays with at least one HIGH_CONF match OR ≥2 candidates.
  // This prevents lone LOW_CONF vars (e.g. `end=3` in range by coincidence) from firing.
  const result = {};
  for (const [arrName, cands] of Object.entries(candidates)) {
    if (cands.some(c => c.isHigh) || cands.length >= 2) {
      result[arrName] = cands.map(({ name, val }) => ({ name, val }));
    }
  }
  return result;
}

// Detect window bounds: left+right / lo+hi / start+end pairs in same array
function detectWindow(pointers) {
  const LEFT  = ['left','lo','start','l','front','a'];
  const RIGHT = ['right','hi','end','r','back','b'];
  const lp = pointers.find(p => LEFT.includes(p.name));
  const rp = pointers.find(p => RIGHT.includes(p.name));
  if (lp && rp) return { lo: parseInt(lp.val.r), hi: parseInt(rp.val.r) };
  return null;
}

// ══════════════════════════════════════════════════════════════════════════════
// ARRAY WITH POINTER OVERLAY
// ══════════════════════════════════════════════════════════════════════════════
function buildArrayWithPointers(varName, arrObj, pointerVars) {
  const items  = arrObj.items || [];
  const window = detectWindow(pointerVars);

  // Map index -> pointer labels
  const ptrAt = {};
  for (const { name, val } of pointerVars) {
    const idx = parseInt(val.r);
    if (!isNaN(idx)) { if (!ptrAt[idx]) ptrAt[idx] = []; ptrAt[idx].push(name); }
  }

  const container = el('div', 'arr-viz');

  // Var name label
  const nameLbl = el('div', 'arr-var-name');
  nameLbl.textContent = varName;
  container.appendChild(nameLbl);

  // Pointer labels row (only if any pointers)
  if (Object.keys(ptrAt).length) {
    const ptrRow = el('div', 'arr-ptr-row');
    items.forEach((_, i) => {
      const cell = el('div', 'arr-ptr-cell');
      const ptrs = ptrAt[i] || [];
      if (ptrs.length) {
        ptrs.forEach(name => {
          const lbl = el('span', 'arr-ptr-label'); lbl.textContent = name; cell.appendChild(lbl);
        });
        const arrow = el('div', 'arr-ptr-arrow'); arrow.textContent = '↓'; cell.appendChild(arrow);
      }
      ptrRow.appendChild(cell);
    });
    container.appendChild(ptrRow);
  }

  // Cells row
  const cellsRow = el('div', 'arr-cells-row');
  items.forEach((item, i) => {
    const cell = el('div', 'arr-cell');
    cell.dataset.idx = i;
    cell.dataset.arrName = varName;
    if (ptrAt[i])                                              cell.classList.add('pointed');
    if (window && i >= window.lo && i <= window.hi)           cell.classList.add('in-window');
    const valDiv = el('div', 'arr-cell-val'); valDiv.textContent = item.r;
    const idxDiv = el('div', 'arr-cell-idx'); idxDiv.textContent = i;
    cell.appendChild(valDiv); cell.appendChild(idxDiv);
    cellsRow.appendChild(cell);
  });
  container.appendChild(cellsRow);
  return container;
}

// ══════════════════════════════════════════════════════════════════════════════
// MATRIX VISUALIZATION
// ══════════════════════════════════════════════════════════════════════════════
function buildMatrixViz(varName, matObj, locals, lastAcc) {
  const rows  = matObj.items || [];
  const nRows = rows.length;
  const nCols = rows[0]?.items?.length || 0;
  if (!nRows || !nCols) return null;

  // Cap large matrices
  const MAX_ROWS = 20, MAX_COLS = 20;
  const showRows = Math.min(nRows, MAX_ROWS);
  const showCols = Math.min(nCols, MAX_COLS);

  // Detect row/col pointer variables
  const ROW_NAMES = new Set(['row','r','i','x']);
  const COL_NAMES = new Set(['col','c','j','y']);
  const highlightCells = new Set(); // "r,c"

  for (const [name, val] of Object.entries(locals)) {
    if (!val.p || val.t !== 'int') continue;
    const n = parseInt(val.r); if (isNaN(n) || n < 0) continue;
    const isRow = ROW_NAMES.has(name) && n < nRows;
    const isCol = COL_NAMES.has(name) && n < nCols;
    if (isRow && isCol) { highlightCells.add(`${n},${n}`); }  // same var can't be both realistically
  }
  // Highlight (row,col) pairs
  const rowPtrs = [], colPtrs = [];
  for (const [name, val] of Object.entries(locals)) {
    if (!val.p || val.t !== 'int') continue;
    const n = parseInt(val.r); if (isNaN(n) || n < 0) continue;
    if (ROW_NAMES.has(name) && n < nRows) rowPtrs.push(n);
    if (COL_NAMES.has(name) && n < nCols) colPtrs.push(n);
  }
  rowPtrs.forEach(r => colPtrs.forEach(c => highlightCells.add(`${r},${c}`)));

  // Last-access cell highlight
  let accRow = -1, accCol = -1;
  if (lastAcc) {
    const rowIdx = rows.findIndex(row => row.id === lastAcc.id);
    if (rowIdx >= 0) { accRow = rowIdx; accCol = lastAcc.key; }
  }

  const container = el('div', 'matrix-viz');
  const nameLbl = el('div', 'matrix-var-name');
  nameLbl.textContent = `${varName}  (${nRows}×${nCols})`;
  container.appendChild(nameLbl);

  const grid = el('div', 'matrix-grid');
  grid.style.gridTemplateColumns = `24px repeat(${showCols}, minmax(32px, 1fr))`;

  // Header row: corner + col indices
  grid.appendChild(Object.assign(el('div', 'matrix-cell corner'), { textContent: '' }));
  for (let c = 0; c < showCols; c++) {
    const hdr = el('div', 'matrix-cell col-header'); hdr.textContent = c; grid.appendChild(hdr);
  }

  // Data rows
  for (let r = 0; r < showRows; r++) {
    const rowHdr = el('div', 'matrix-cell row-header'); rowHdr.textContent = r; grid.appendChild(rowHdr);
    const rowItems = rows[r].items || [];
    for (let c = 0; c < showCols; c++) {
      const cell = el('div', 'matrix-cell');
      cell.dataset.row = r; cell.dataset.col = c; cell.dataset.matId = matObj.id;
      if (highlightCells.has(`${r},${c}`)) cell.classList.add('cell-pointed');
      if (r === accRow && c === accCol)     cell.classList.add('accessed');
      cell.textContent = rowItems[c]?.r ?? '';
      grid.appendChild(cell);
    }
  }
  if (nRows > MAX_ROWS || nCols > MAX_COLS) {
    const note = el('div', 'matrix-cell'); note.style.cssText = 'grid-column:1/-1;text-align:center;color:#9ca3af;font-size:0.65rem;padding:3px;';
    note.textContent = `… ${nRows}×${nCols} (truncated)`; grid.appendChild(note);
  }

  container.appendChild(grid);
  return container;
}

// ══════════════════════════════════════════════════════════════════════════════
// DATA STRUCTURE BUILDERS
// ══════════════════════════════════════════════════════════════════════════════
function isLLNode(obj) {
  return obj && !obj.p && obj.attrs && 'next' in obj.attrs
    && ('val' in obj.attrs || 'data' in obj.attrs)
    && !('left' in obj.attrs) && !('children' in obj.attrs);
}
function isTreeNode(obj) {
  // Binary tree only — N-ary trees have children but no left/right
  return obj && !obj.p && obj.attrs
    && ('left' in obj.attrs || 'right' in obj.attrs)
    && ('val' in obj.attrs || 'data' in obj.attrs || 'value' in obj.attrs);
}

// ── Detection helpers ─────────────────────────────────────────────────────────
function isGraphNode(obj) {
  return obj && !obj.p && obj.attrs
    && 'neighbors' in obj.attrs
    && ('val' in obj.attrs || 'value' in obj.attrs)
    && !('next' in obj.attrs) && !('left' in obj.attrs);
}
function isDeque(obj)  { return obj && obj.t === 'deque'; }
const STACK_NAMES = new Set(['stack','stk','path','res','result']);
const QUEUE_NAMES = new Set(['queue','q','bfs','level','frontier','todo','buf']);
function stackOrQueue(varName, obj) {
  if (!obj || obj.t !== 'list') return null;
  if (STACK_NAMES.has(varName)) return 'stack';
  if (QUEUE_NAMES.has(varName)) return 'queue';
  return null;
}
function isDP(varName) { return varName === 'dp' || varName.startsWith('dp_') || varName === 'memo'; }

// ── Graph visualization (circular layout) ────────────────────────────────────
function buildGraphViz(rootId, heap, locals) {
  // BFS-collect all graph nodes reachable from root
  const nodes = new Map(); // id -> {id, val, neighborIds}
  const queue = [rootId];
  const seen  = new Set();
  while (queue.length && nodes.size < 30) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    const obj = heap[String(id)];
    if (!obj || !isGraphNode(obj)) continue;
    const valAttr = obj.attrs?.val ?? obj.attrs?.value;
    const nbAttr  = obj.attrs?.neighbors;
    const nbIds   = (nbAttr?.items || []).filter(n => n && !n.p).map(n => n.id);
    nodes.set(id, { id, val: valAttr?.r ?? '?', neighborIds: nbIds });
    nbIds.forEach(nid => { if (!seen.has(nid)) queue.push(nid); });
  }
  if (!nodes.size) return null;

  const nodeArr = [...nodes.values()];
  const N = nodeArr.length;
  const R = Math.max(55, N * 14);
  const cx = R + 28, cy = R + 28;
  nodeArr.forEach((node, i) => {
    const a = (i / N) * 2 * Math.PI - Math.PI / 2;
    node.x = cx + R * Math.cos(a);
    node.y = cy + R * Math.sin(a);
  });

  // Pointer labels
  const ptrs = {};
  for (const [name, val] of Object.entries(locals)) {
    if (!val.p && nodes.has(val.id)) {
      if (!ptrs[val.id]) ptrs[val.id] = [];
      ptrs[val.id].push(name);
    }
  }

  const NS  = 'http://www.w3.org/2000/svg';
  const svgW = (R + 28) * 2 + 10, svgH = (R + 28) * 2 + 10;
  const svg  = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', svgW); svg.setAttribute('height', svgH);
  svg.classList.add('graph-svg');

  // Deduplicate edges (undirected)
  const edgeSeen = new Set();
  nodeArr.forEach(node => {
    node.neighborIds.forEach(nid => {
      const key = [Math.min(node.id,nid), Math.max(node.id,nid)].join(',');
      if (edgeSeen.has(key)) return; edgeSeen.add(key);
      const target = nodes.get(nid); if (!target) return;
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', node.x); line.setAttribute('y1', node.y);
      line.setAttribute('x2', target.x); line.setAttribute('y2', target.y);
      line.setAttribute('stroke', '#d1d5db'); line.setAttribute('stroke-width', '2');
      svg.appendChild(line);
    });
  });

  const NR = 17;
  nodeArr.forEach(node => {
    const p  = ptrs[node.id] || [];
    const cx2 = node.x, cy2 = node.y;
    const circ = document.createElementNS(NS, 'circle');
    circ.setAttribute('cx', cx2); circ.setAttribute('cy', cy2); circ.setAttribute('r', NR);
    circ.setAttribute('fill', p.length ? '#fef9c3' : 'white');
    circ.setAttribute('stroke', p.length ? '#ca8a04' : '#374151');
    circ.setAttribute('stroke-width', '2.5');
    circ.dataset.obj = node.id;
    svg.appendChild(circ);
    const txt = document.createElementNS(NS, 'text');
    txt.setAttribute('x', cx2); txt.setAttribute('y', cy2 + 4);
    txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('font-family', 'monospace');
    txt.setAttribute('font-size', '12'); txt.setAttribute('font-weight', '800'); txt.setAttribute('fill', '#111');
    txt.textContent = node.val; svg.appendChild(txt);
    if (p.length) {
      const lbl = document.createElementNS(NS, 'text');
      lbl.setAttribute('x', cx2); lbl.setAttribute('y', cy2 - NR - 4);
      lbl.setAttribute('text-anchor', 'middle'); lbl.setAttribute('font-family', 'monospace');
      lbl.setAttribute('font-size', '9'); lbl.setAttribute('fill', '#1d4ed8'); lbl.setAttribute('font-weight', '800');
      lbl.textContent = p.join(','); svg.appendChild(lbl);
    }
  });

  const wrap = el('div', 'graph-viz'); wrap.appendChild(svg); return wrap;
}

// ── Stack visualization (vertical) ───────────────────────────────────────────
function buildStackViz(varName, obj) {
  const items = obj.items || [];
  const wrap  = el('div', 'deque-viz');
  const hdr   = el('div', 'deque-var-name');
  hdr.innerHTML = `${esc(varName)}<span class="deque-type-badge t-stack">stack</span>`;
  wrap.appendChild(hdr);
  if (!items.length) { const e = el('div','empty-obj'); e.textContent='empty'; wrap.appendChild(e); return wrap; }
  const topLbl = el('div', 'stack-top-label'); topLbl.textContent = '↑ top'; wrap.appendChild(topLbl);
  const cells  = el('div', 'stack-cells');
  items.forEach((item, i) => {
    const cell = el('div', i === items.length - 1 ? 'stack-cell top-cell' : 'stack-cell');
    cell.textContent = item.r; cells.appendChild(cell);
  });
  wrap.appendChild(cells);
  return wrap;
}

// ── Queue / Deque visualization (horizontal) ─────────────────────────────────
function buildQueueViz(varName, obj, type = 'queue') {
  const items = obj.items || [];
  const wrap  = el('div', 'deque-viz');
  const hdr   = el('div', 'deque-var-name');
  hdr.innerHTML = `${esc(varName)}<span class="deque-type-badge t-${type}">${type}</span>`;
  wrap.appendChild(hdr);
  if (!items.length) { const e = el('div','empty-obj'); e.textContent='empty'; wrap.appendChild(e); return wrap; }
  const labels = el('div', 'deque-labels-row');
  labels.innerHTML = `<span class="deque-end-label">front →</span><span class="deque-end-label">← back</span>`;
  const scroll = el('div', 'queue-scroll');
  const cells  = el('div', 'queue-cells');
  items.forEach((item, i) => {
    const cell = el('div',
      i === 0              ? 'queue-cell front-cell' :
      i === items.length-1 ? 'queue-cell back-cell'  : 'queue-cell');
    cell.textContent = item.r; cells.appendChild(cell);
  });
  scroll.appendChild(cells);
  const inner = el('div');
  inner.style.cssText = 'display: inline-flex; flex-direction: column;';
  inner.appendChild(labels);
  inner.appendChild(scroll);
  wrap.appendChild(inner);
  return wrap;
}

// ── DP array wrapper (reuses arr-with-pointers but adds dp class) ─────────────
function buildDPArrayViz(varName, arrObj, pointerVars) {
  const viz = buildArrayWithPointers(varName, arrObj, pointerVars);
  viz.classList.add('dp-arr-viz');
  viz.querySelector('.arr-var-name').innerHTML =
    `${esc(varName)}<span class="dp-badge">DP</span>`;
  return viz;
}
function buildDPMatrixViz(varName, matObj, locals, lastAcc) {
  const viz = buildMatrixViz(varName, matObj, locals, lastAcc);
  if (!viz) return null;
  viz.classList.add('dp-mat-viz');
  viz.querySelector('.matrix-var-name').innerHTML =
    `${esc(varName)}  (${matObj.items.length}×${matObj.items[0]?.items?.length ?? '?'})<span class="dp-badge">DP</span>`;
  return viz;
}

// ══════════════════════════════════════════════════════════════════════════════
// HEAP VISUALIZATION
// ══════════════════════════════════════════════════════════════════════════════
const HEAP_NAMES = new Set(['heap','pq','min_heap','max_heap','h','minheap','maxheap','hq','priority_queue']);
function isHeapList(varName, obj) {
  return obj && obj.t === 'list' && HEAP_NAMES.has(varName)
    && obj.items?.length > 0 && obj.items.length <= 31
    && !obj.items.some(item => item.t === 'list');
}
function buildHeapViz(varName, obj) {
  const items = obj.items || []; if (!items.length) return null;
  function makeNode(i) {
    if (i >= items.length) return null;
    return { idx: i, val: items[i].r, left: makeNode(2*i+1), right: makeNode(2*i+2) };
  }
  const root = makeNode(0);
  function compW(n) { if (!n) return; if (!n.left && !n.right) { n.width=1; return; } compW(n.left); compW(n.right); n.width=(n.left?.width||0)+(n.right?.width||0); }
  function assX(n, off=0) { if (!n) return; if (!n.left && !n.right) { n.x=off; return; } let c=off; if(n.left){assX(n.left,c);c+=n.left.width;} if(n.right){assX(n.right,c);} n.x=((n.left?.x??n.right?.x??0)+(n.right?.x??n.left?.x??0))/2; }
  function assY(n,d=0) { if (!n) return; n.y=d; assY(n.left,d+1); assY(n.right,d+1); }
  compW(root); assX(root,0); assY(root);
  const all=[]; function col(n){if(!n)return; all.push(n); col(n.left); col(n.right);} col(root);
  const NW=36,NH=26,XG=44,YG=46,PAD=14;
  const maxX=Math.max(...all.map(n=>n.x)), maxY=Math.max(...all.map(n=>n.y));
  const NS='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(NS,'svg');
  svg.setAttribute('width', PAD*2+(maxX+1)*XG); svg.setAttribute('height', PAD*2+(maxY+1)*YG+18); svg.classList.add('tree-svg');
  all.forEach(node => {
    [node.left,node.right].filter(Boolean).forEach(child=>{
      const line=document.createElementNS(NS,'line');
      line.setAttribute('x1',PAD+node.x*XG+NW/2); line.setAttribute('y1',PAD+node.y*YG+NH);
      line.setAttribute('x2',PAD+child.x*XG+NW/2); line.setAttribute('y2',PAD+child.y*YG);
      line.setAttribute('stroke','#9ca3af'); line.setAttribute('stroke-width','1.5'); svg.appendChild(line);
    });
  });
  all.forEach(node => {
    const nx=PAD+node.x*XG, ny=PAD+node.y*YG;
    const isRoot=node.idx===0;
    const rect=document.createElementNS(NS,'rect');
    rect.setAttribute('x',nx); rect.setAttribute('y',ny); rect.setAttribute('width',NW); rect.setAttribute('height',NH); rect.setAttribute('rx',5);
    rect.setAttribute('fill', isRoot?'#dbeafe':'white'); rect.setAttribute('stroke', isRoot?'#3b82f6':'#374151'); rect.setAttribute('stroke-width', isRoot?'2.5':'1.5'); svg.appendChild(rect);
    const txt=document.createElementNS(NS,'text');
    txt.setAttribute('x',nx+NW/2); txt.setAttribute('y',ny+NH/2+4); txt.setAttribute('text-anchor','middle'); txt.setAttribute('font-family','monospace'); txt.setAttribute('font-size','11'); txt.setAttribute('font-weight', isRoot?'900':'700'); txt.setAttribute('fill', isRoot?'#1d4ed8':'#111'); txt.textContent=node.val; svg.appendChild(txt);
    const idxT=document.createElementNS(NS,'text');
    idxT.setAttribute('x',nx+NW/2); idxT.setAttribute('y',ny+NH+10); idxT.setAttribute('text-anchor','middle'); idxT.setAttribute('font-family','monospace'); idxT.setAttribute('font-size','8'); idxT.setAttribute('fill','#9ca3af'); idxT.textContent=`[${node.idx}]`; svg.appendChild(idxT);
  });
  const wrap=el('div','heap-viz');
  const lbl=el('div','arr-var-name');
  lbl.innerHTML=`${esc(varName)}<span class="heap-min-label">▲ min at [0]</span>`;
  wrap.appendChild(lbl); wrap.appendChild(svg); return wrap;
}

// ══════════════════════════════════════════════════════════════════════════════
// STRING CHARACTER VISUALIZATION
// ══════════════════════════════════════════════════════════════════════════════
function buildStringCharViz(varName, chars, pointerVars) {
  const window = detectWindow(pointerVars);
  const ptrAt  = {};
  for (const { name, val } of pointerVars) {
    const idx = parseInt(val.r);
    if (!isNaN(idx)) { if (!ptrAt[idx]) ptrAt[idx]=[]; ptrAt[idx].push(name); }
  }
  const container = el('div','arr-viz');
  const nameLbl = el('div','arr-var-name'); nameLbl.textContent = varName; container.appendChild(nameLbl);
  if (Object.keys(ptrAt).length) {
    const ptrRow = el('div','arr-ptr-row');
    chars.forEach((_,i) => {
      const cell=el('div','arr-ptr-cell');
      const ptrs=ptrAt[i]||[];
      if (ptrs.length) { ptrs.forEach(n=>{const l=el('span','arr-ptr-label');l.textContent=n;cell.appendChild(l);}); const a=el('div','arr-ptr-arrow');a.textContent='↓';cell.appendChild(a); }
      ptrRow.appendChild(cell);
    });
    container.appendChild(ptrRow);
  }
  const cellsRow=el('div','arr-cells-row str-cells-row');
  chars.forEach((ch,i) => {
    const cell=el('div','arr-cell');
    if (ptrAt[i]) cell.classList.add('pointed');
    if (window && i>=window.lo && i<=window.hi) cell.classList.add('in-window');
    const v=el('div','arr-cell-val'); v.textContent=ch;
    const ix=el('div','arr-cell-idx'); ix.textContent=i;
    cell.appendChild(v); cell.appendChild(ix); cellsRow.appendChild(cell);
  });
  container.appendChild(cellsRow);
  return container;
}

// ══════════════════════════════════════════════════════════════════════════════
// INTERVALS TIMELINE
// ══════════════════════════════════════════════════════════════════════════════
const INTERVAL_NAMES = new Set(['intervals','events','meetings','jobs','tasks','ranges','bookings','slots','pairs']);
function isIntervals(varName, obj) {
  if (!obj || obj.t !== 'list' || !obj.items?.length) return false;
  if (!INTERVAL_NAMES.has(varName) && !varName.includes('interval') && !varName.includes('range')) return false;
  return obj.items.slice(0,4).every(item =>
    item.t==='list' && item.items?.length===2 &&
    item.items.every(x => x.t==='int' || x.t==='float')
  );
}
function buildIntervalsViz(varName, obj) {
  const rows=obj.items||[]; if (!rows.length) return null;
  const ivs=rows.map(r=>{const it=r.items||[];return{start:parseFloat(it[0]?.r??0),end:parseFloat(it[1]?.r??0)};}).filter(iv=>!isNaN(iv.start)&&!isNaN(iv.end));
  if (!ivs.length) return null;
  const minV=Math.min(...ivs.map(iv=>iv.start)), maxV=Math.max(...ivs.map(iv=>iv.end)), rng=maxV-minV||1;
  const COLORS=['#6366f1','#f59e0b','#10b981','#ef4444','#8b5cf6','#3b82f6','#ec4899'];
  const container=el('div','interval-viz');
  const nameLbl=el('div','arr-var-name'); nameLbl.textContent=varName; container.appendChild(nameLbl);
  const timeline=el('div','interval-timeline');
  ivs.forEach((iv,i)=>{
    const row=el('div','interval-row');
    const lbl=el('span','interval-label'); lbl.textContent=`[${iv.start},${iv.end}]`;
    const track=el('div','interval-track');
    const bar=el('div','interval-bar');
    bar.style.cssText=`left:${((iv.start-minV)/rng*100).toFixed(1)}%;width:${Math.max(2,(iv.end-iv.start)/rng*100).toFixed(1)}%;background:${COLORS[i%COLORS.length]};opacity:0.85`;
    track.appendChild(bar); row.appendChild(lbl); row.appendChild(track); timeline.appendChild(row);
  });
  const axis=el('div','interval-axis');
  const NUM_TICKS=5;
  for (let t=0;t<=NUM_TICKS;t++){
    const val=minV+(rng/NUM_TICKS)*t;
    const tick=el('span','interval-tick');
    tick.style.left=`${(t/NUM_TICKS*100).toFixed(1)}%`;
    tick.textContent=Math.round(val*10)/10;
    axis.appendChild(tick);
  }
  container.appendChild(timeline); container.appendChild(axis); return container;
}

// ══════════════════════════════════════════════════════════════════════════════
// ADJACENCY LIST GRAPH (directed, index-based)
// ══════════════════════════════════════════════════════════════════════════════
const ADJ_LIST_NAMES = new Set(['graph','adj','adj_list','adjacency','g','graph_list','neighbors_list']);
const NODE_IDX_NAMES = new Set(['node','u','v','cur','curr','src','dst','course','i','j']);

function isAdjList(varName, obj) {
  return obj && obj.t==='list'
    && (ADJ_LIST_NAMES.has(varName) || varName.startsWith('adj'))
    && obj.items?.length>1 && obj.items.length<=25
    && obj.items.every(item => item.t==='list' && Array.isArray(item.items));
}

// Semantic color for a set/state variable name
function setColorFor(name) {
  const n = name.toLowerCase();
  if (['path','onpath','inpath','cycle','recursing','stack'].some(s=>n.includes(s)))
    return { fill:'#fed7aa', stroke:'#d97706' };   // orange  = currently exploring
  if (['visit','seen','done','finish','black','complet'].some(s=>n.includes(s)))
    return { fill:'#bbf7d0', stroke:'#16a34a' };   // green   = fully processed
  if (['gray','grey','process','temp','active','current'].some(s=>n.includes(s)))
    return { fill:'#fef9c3', stroke:'#ca8a04' };   // yellow  = in-progress
  const EXTRA=[{fill:'#bfdbfe',stroke:'#3b82f6'},{fill:'#c7d2fe',stroke:'#7c3aed'},{fill:'#fce7f3',stroke:'#db2777'}];
  return EXTRA[Math.abs(name.split('').reduce((h,c)=>h+c.charCodeAt(0),0))%EXTRA.length];
}

function buildAdjListViz(varName, obj, locals) {
  const adjList=obj.items||[]; const n=adjList.length; if (!n) return null;
  const R=Math.max(55,n*13), cx=R+30, cy=R+30, NR=16;

  // ── Active node (integer variable pointing to a node index) ─────────────────
  const activeNodes=new Set();
  for (const [name,val] of Object.entries(locals)) {
    if (!val.p||val.t!=='int') continue;
    const idx=parseInt(val.r);
    if (!isNaN(idx)&&idx>=0&&idx<n&&NODE_IDX_NAMES.has(name)) activeNodes.add(idx);
  }

  // ── Set memberships (sets of node indices → color coding) ───────────────────
  const legendItems = {};                          // name -> {fill,stroke}
  const nodeSetColor = new Map();                  // nodeIdx -> primary {fill,stroke}
  const nodeSetNames = new Map();                  // nodeIdx -> [setName,...]

  // 1. Named sets  (visited, path, etc.)
  for (const [name,val] of Object.entries(locals)) {
    if (val.p || val.t !== 'set' || !val.items?.length) continue;
    const idxs = val.items.map(x=>parseInt(x.r)).filter(x=>!isNaN(x)&&x>=0&&x<n);
    if (!idxs.length) continue;
    const col = setColorFor(name);
    legendItems[name] = col;
    idxs.forEach(idx=>{
      if (!nodeSetColor.has(idx)) nodeSetColor.set(idx, col);   // first set wins
      if (!nodeSetNames.has(idx)) nodeSetNames.set(idx,[]);
      nodeSetNames.get(idx).push(name);
    });
  }

  // 2. Color/state array (e.g. color=[0,1,2] with WHITE/GRAY/BLACK semantics)
  const STATE_NAMES = ['color','colour','state','status','vis','visited_arr'];
  for (const [name,val] of Object.entries(locals)) {
    if (!val.p && val.t==='list' && STATE_NAMES.some(s=>name===s||name.startsWith(s))) {
      const stateObj = (initialHeap[String(val.id)] || val);
      const items = stateObj.items || [];
      if (items.length===n && items.every(x=>['0','1','2'].includes(x.r))) {
        const STATE_COLS = [null, {fill:'#fef9c3',stroke:'#ca8a04'}, {fill:'#bbf7d0',stroke:'#16a34a'}];
        const STATE_LABELS = ['','in-progress','done'];
        items.forEach((x,i)=>{
          const s=parseInt(x.r);
          if (s>0 && !nodeSetColor.has(i)) {
            nodeSetColor.set(i, STATE_COLS[s]);
            if (!nodeSetNames.has(i)) nodeSetNames.set(i,[]);
            nodeSetNames.get(i).push(`${name}=${STATE_LABELS[s]}`);
          }
        });
        if (!legendItems[`${name}=1`]) {
          legendItems[`${name}: 1=visiting`] = STATE_COLS[1];
          legendItems[`${name}: 2=done`]     = STATE_COLS[2];
        }
      }
    }
  }

  // ── Build nodes ──────────────────────────────────────────────────────────────
  const nodes=adjList.map((row,i)=>{
    const angle=(i/n)*2*Math.PI-Math.PI/2;
    return{idx:i,x:cx+R*Math.cos(angle),y:cy+R*Math.sin(angle),
           neighbors:(row.items||[]).map(x=>parseInt(x.r)).filter(x=>!isNaN(x)&&x>=0&&x<n)};
  });

  const NS='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(NS,'svg');
  svg.setAttribute('width',(R+30)*2+10); svg.setAttribute('height',(R+30)*2+10); svg.classList.add('graph-svg');
  const defs=document.createElementNS(NS,'defs');
  defs.innerHTML=`<marker id="adj-arr" markerWidth="6" markerHeight="5" refX="5" refY="2.5" orient="auto"><polygon points="0 0,6 2.5,0 5" fill="#9ca3af"/></marker>`;
  svg.appendChild(defs);

  // Edges
  nodes.forEach(node=>{
    node.neighbors.forEach(nidx=>{
      const t=nodes[nidx]; if (!t) return;
      const dx=t.x-node.x, dy=t.y-node.y, len=Math.sqrt(dx*dx+dy*dy)||1;
      const x1=node.x+(dx/len)*(NR+1), y1=node.y+(dy/len)*(NR+1);
      const x2=t.x-(dx/len)*(NR+5),    y2=t.y-(dy/len)*(NR+5);
      const line=document.createElementNS(NS,'line');
      line.setAttribute('x1',x1);line.setAttribute('y1',y1);line.setAttribute('x2',x2);line.setAttribute('y2',y2);
      line.setAttribute('stroke','#d1d5db');line.setAttribute('stroke-width','1.5');line.setAttribute('marker-end','url(#adj-arr)');
      svg.appendChild(line);
    });
  });

  // Nodes
  nodes.forEach(node=>{
    const act    = activeNodes.has(node.idx);
    const setCol = nodeSetColor.get(node.idx);
    const fill   = act ? '#fef9c3' : (setCol ? setCol.fill   : 'white');
    const stroke = act ? '#ca8a04' : (setCol ? setCol.stroke : '#374151');

    const circ=document.createElementNS(NS,'circle');
    circ.setAttribute('cx',node.x);circ.setAttribute('cy',node.y);circ.setAttribute('r',NR);
    circ.setAttribute('fill',fill);circ.setAttribute('stroke',stroke);circ.setAttribute('stroke-width',act?'3':'2');
    svg.appendChild(circ);

    const txt=document.createElementNS(NS,'text');
    txt.setAttribute('x',node.x);txt.setAttribute('y',node.y+4);txt.setAttribute('text-anchor','middle');
    txt.setAttribute('font-family','monospace');txt.setAttribute('font-size','11');
    txt.setAttribute('font-weight',act?'900':'700');
    txt.setAttribute('fill',act?'#92400e':'#111');
    txt.textContent=String(node.idx);svg.appendChild(txt);

    // Set name label below node
    const names = nodeSetNames.get(node.idx) || [];
    if (names.length) {
      const lbl=document.createElementNS(NS,'text');
      lbl.setAttribute('x',node.x);lbl.setAttribute('y',node.y+NR+10);
      lbl.setAttribute('text-anchor','middle');lbl.setAttribute('font-family','monospace');
      lbl.setAttribute('font-size','8');lbl.setAttribute('fill',stroke);lbl.setAttribute('font-weight','800');
      lbl.textContent=names.map(s=>s.split('=')[0]).join(',');svg.appendChild(lbl);
    }

    // Active variable pointer label above
    if (act) {
      const ptrsHere=[...NODE_IDX_NAMES].filter(nm=>locals[nm]?.p&&parseInt(locals[nm].r)===node.idx);
      if (ptrsHere.length){
        const lbl=document.createElementNS(NS,'text');
        lbl.setAttribute('x',node.x);lbl.setAttribute('y',node.y-NR-3);
        lbl.setAttribute('text-anchor','middle');lbl.setAttribute('font-family','monospace');
        lbl.setAttribute('font-size','8');lbl.setAttribute('fill','#1d4ed8');lbl.setAttribute('font-weight','800');
        lbl.textContent=ptrsHere.join(',');svg.appendChild(lbl);
      }
    }
  });

  // Wrap + legend
  const wrap=el('div','graph-viz');
  const nameLbl=el('div','graph-var-name');nameLbl.textContent=varName;
  wrap.appendChild(nameLbl);wrap.appendChild(svg);

  if (Object.keys(legendItems).length) {
    const legend=el('div','graph-legend');
    for (const [name,col] of Object.entries(legendItems)) {
      if (!col) continue;
      const item=el('div','graph-legend-item');
      const dot=el('div','graph-legend-dot');
      dot.style.cssText=`background:${col.fill};border-color:${col.stroke}`;
      item.appendChild(dot);
      item.appendChild(Object.assign(document.createElement('span'),{textContent:name}));
      legend.appendChild(item);
    }
    wrap.appendChild(legend);
  }

  return wrap;
}

function buildStructures(locals, heap, lastAcc, stepData, stepIdx) {
  const items = [];
  const renderedIds = new Set();

  // Merge initial heap (full tree) with current heap (updated values).
  // Initial heap has all tree nodes captured at step 0; current heap only has
  // nodes reachable from current locals — deep in recursion this is just a subtree.
  const mergedHeap = Object.keys(initialHeap).length
    ? { ...initialHeap, ...heap }
    : heap;

  // Pointer sets — use mergedHeap so the full tree structure is considered
  const pointedByNext = new Set(), pointedByTree = new Set();
  for (const obj of Object.values(mergedHeap)) {
    if (isLLNode(obj)) {
      const nxt = obj.attrs?.next;
      if (nxt && !nxt.p && nxt.id) pointedByNext.add(nxt.id);
    }
    if (isTreeNode(obj)) {
      const l = obj.attrs?.left, r = obj.attrs?.right;
      if (l && !l.p && l.id) pointedByTree.add(l.id);
      if (r && !r.p && r.id) pointedByTree.add(r.id);
    }
    if (isNAryTreeNode(obj)) {
      (obj.attrs?.children?.items || []).forEach(c => { if (c && !c.p && c.id) pointedByTree.add(c.id); });
    }
  }

  const refs = Object.entries(locals).filter(([, v]) => !v.p);

  // ── Linked list chains ──────────────────────────────────────────────────────
  for (const [, val] of refs) {
    const obj = mergedHeap[String(val.id)];
    if (!obj || !isLLNode(obj) || pointedByNext.has(val.id) || renderedIds.has(val.id)) continue;
    const viz = buildLLViz(val.id, mergedHeap, locals);
    if (viz) {
      items.push(viz);
      let cur = val.id;
      while (cur && mergedHeap[String(cur)]) {
        renderedIds.add(cur);
        const nxt = mergedHeap[String(cur)].attrs?.next;
        cur = nxt && !nxt.p ? nxt.id : null;
      }
    }
  }

  // ── Binary trees — always render from original root ─────────────────────────
  // initialTreeRoots maps varName → original rootId so the full tree is always shown.
  // Current locals provide the pointer highlights (e.g. which node `root` points to now).
  const treeRootsToRender = Object.keys(initialTreeRoots).length
    ? Object.entries(initialTreeRoots)
    : refs
        .filter(([, val]) => {
          const obj = mergedHeap[String(val.id)];
          return obj && isTreeNode(obj) && !pointedByTree.has(val.id);
        })
        .map(([name, val]) => [name, val.id]);

  for (const [, rootId] of treeRootsToRender) {
    if (renderedIds.has(rootId)) continue;
    const viz = buildTreeViz(rootId, mergedHeap, locals, stepData, stepIdx);
    if (viz) {
      items.push(viz);
      (function mark(id) {
        if (!id || renderedIds.has(id)) return;
        const o = mergedHeap[String(id)]; if (!o) return;
        renderedIds.add(id);
        const l = o.attrs?.left, r = o.attrs?.right;
        if (l && !l.p) mark(l.id);
        if (r && !r.p) mark(r.id);
      })(rootId);
    }
  }

  // ── N-ary trees — same approach ──────────────────────────────────────────────
  const naryRootsToRender = Object.keys(initialTreeRoots).length
    ? Object.entries(initialTreeRoots).filter(([, id]) => isNAryTreeNode(mergedHeap[String(id)]))
    : refs
        .filter(([, val]) => {
          const obj = mergedHeap[String(val.id)];
          return obj && isNAryTreeNode(obj) && !pointedByTree.has(val.id);
        })
        .map(([name, val]) => [name, val.id]);

  for (const [, rootId] of naryRootsToRender) {
    if (renderedIds.has(rootId)) continue;
    const viz = buildNAryTreeViz(rootId, mergedHeap, locals, stepData, stepIdx);
    if (viz) {
      items.push(viz);
      (function mark(id) {
        if (!id || renderedIds.has(id)) return;
        const o = mergedHeap[String(id)]; if (!o) return;
        renderedIds.add(id);
        (o.attrs?.children?.items || []).forEach(c => { if (c && !c.p) mark(c.id); });
      })(rootId);
    }
  }

  // ── Graph nodes ─────────────────────────────────────────────────────────────
  const allNeighborIds = new Set();
  for (const o of Object.values(heap)) {
    if (isGraphNode(o)) {
      (o.attrs?.neighbors?.items || []).forEach(n => { if (n && !n.p) allNeighborIds.add(n.id); });
    }
  }
  for (const [, val] of refs) {
    if (renderedIds.has(val.id)) continue;
    const obj = heap[String(val.id)];
    if (!obj || !isGraphNode(obj) || allNeighborIds.has(val.id)) continue;
    const viz = buildGraphViz(val.id, heap, locals);
    if (viz) { items.push(viz); renderedIds.add(val.id); }
  }

  // ── String character views (when pointer vars index into a string) ───────────
  for (const [name, val] of Object.entries(locals)) {
    if (!val.p || val.t !== 'str' || !val.chars?.length) continue;
    const ptrs = [];
    for (const [pname, pval] of Object.entries(locals)) {
      if (!pval.p || pval.t !== 'int' || !PTR_NAMES.has(pname)) continue;
      const n = parseInt(pval.r);
      if (!isNaN(n) && n >= 0 && n <= val.chars.length) ptrs.push({ name: pname, val: pval });
    }
    if (ptrs.length) {
      const viz = buildStringCharViz(name, val.chars, ptrs);
      if (viz) items.push(viz);
    }
  }

  // ── Arrays, matrices, deques, dicts, sets ───────────────────────────────────
  const arrayPtrs = findArrayPointers(locals, mergedHeap);
  const shown     = new Set();

  // Detection order matters: specific types before generic list/matrix
  const adjVars=[], intervalVars=[], matVars=[], dequeVars=[], stackVars=[], queueVars=[], heapVars=[], arrVars=[], otherVars=[];
  for (const [name, val] of refs) {
    if (renderedIds.has(val.id) || shown.has(val.id)) continue;
    const obj = mergedHeap[String(val.id)] || val;
    if (!['list','dict','set','tuple','deque'].includes(obj.t)) continue;
    if      (isAdjList(name, obj))                      adjVars.push([name, val, obj]);
    else if (isIntervals(name, obj))                    intervalVars.push([name, val, obj]);
    else if (isMatrix(obj))                             matVars.push([name, val, obj]);
    else if (isDeque(obj))                              dequeVars.push([name, val, obj]);
    else if (stackOrQueue(name, obj) === 'stack')       stackVars.push([name, val, obj]);
    else if (stackOrQueue(name, obj) === 'queue')       queueVars.push([name, val, obj]);
    else if (isHeapList(name, obj))                     heapVars.push([name, val, obj]);
    else if (obj.t === 'list' || obj.t === 'tuple')     arrVars.push([name, val, obj]);
    else                                                otherVars.push([name, val, obj]);
  }

  for (const [name, val, obj] of adjVars) {
    const viz = buildAdjListViz(name, obj, locals); if (viz) { items.push(viz); shown.add(val.id); }
  }
  for (const [name, val, obj] of intervalVars) {
    const viz = buildIntervalsViz(name, obj); if (viz) { items.push(viz); shown.add(val.id); }
  }
  for (const [name, val, obj] of matVars) {
    const viz = isDP(name) ? buildDPMatrixViz(name, obj, locals, lastAcc) : buildMatrixViz(name, obj, locals, lastAcc);
    if (viz) { items.push(viz); shown.add(val.id); }
  }
  for (const [name, val, obj] of dequeVars) {
    items.push(buildQueueViz(name, obj, 'deque')); shown.add(val.id);
  }
  for (const [name, val, obj] of stackVars) {
    items.push(buildStackViz(name, obj)); shown.add(val.id);
  }
  for (const [name, val, obj] of queueVars) {
    items.push(buildQueueViz(name, obj, 'queue')); shown.add(val.id);
  }
  for (const [name, val, obj] of heapVars) {
    const viz = buildHeapViz(name, obj); if (viz) { items.push(viz); shown.add(val.id); }
  }
  for (const [name, val, obj] of arrVars) {
    const ptrs = arrayPtrs[name] || [];
    const viz  = isDP(name) ? buildDPArrayViz(name, obj, ptrs)
               : ptrs.length ? buildArrayWithPointers(name, obj, ptrs)
               : buildHeapObj(obj, String(val.id));
    if (viz) { items.push(viz); shown.add(val.id); }
  }
  for (const [, val, obj] of otherVars) {
    items.push(buildHeapObj(obj, String(val.id))); shown.add(val.id);
  }

  return items;
}

// ── Linked list chain ─────────────────────────────────────────────────────────
function buildLLViz(headId, heap, locals) {
  const pointers = {};
  for (const [name, val] of Object.entries(locals)) {
    if (!val.p) { if (!pointers[val.id]) pointers[val.id] = []; pointers[val.id].push(name); }
  }

  const chain = []; const visited = new Set(); let curId = headId;
  while (curId) {
    const obj = heap[String(curId)];
    if (!obj || visited.has(curId)) break;
    visited.add(curId); chain.push({ id: curId, obj });
    const nxt = obj.attrs?.next;
    curId = (nxt && !nxt.p && nxt.id) ? nxt.id : null;
  }
  if (!chain.length) return null;

  const container  = el('div', 'll-viz');
  const labelsRow  = el('div', 'll-labels-row');
  const chainRow   = el('div', 'll-chain');

  chain.forEach(({ id, obj }) => {
    const valAttr = obj.attrs?.val ?? obj.attrs?.data;
    const valStr  = valAttr ? valAttr.r : '?';
    const ptrs    = pointers[id] || [];

    const labelCell = el('div', 'll-label-cell');
    ptrs.forEach(name => {
      const lbl = el('span', 'll-ptr-label'); lbl.textContent = name; labelCell.appendChild(lbl);
    });
    labelsRow.appendChild(labelCell);

    const nodeBox = el('div', ptrs.length ? 'll-node ll-pointed' : 'll-node');
    nodeBox.dataset.obj = id;
    const valDiv = el('div', 'll-node-val'); valDiv.textContent = valStr;
    const ptrDiv = el('div', 'll-node-ptr'); ptrDiv.textContent = '•';
    nodeBox.appendChild(valDiv); nodeBox.appendChild(ptrDiv);
    chainRow.appendChild(nodeBox);

    labelsRow.appendChild(el('div', 'll-label-cell arrow-cell'));
    const arrow = el('div', 'll-arrow'); arrow.textContent = '→';
    chainRow.appendChild(arrow);
  });

  // Replace last arrow with null
  labelsRow.lastChild.className = 'll-label-cell null-cell';
  chainRow.lastChild.textContent = '';
  const nullBox = el('div', 'll-null'); nullBox.textContent = 'null';
  chainRow.appendChild(nullBox);

  container.appendChild(labelsRow);
  container.appendChild(chainRow);
  return container;
}

// ── Binary tree ───────────────────────────────────────────────────────────────
function buildTreeViz(rootId, heap, locals, stepData, stepIdx) {
  function buildNode(id, visited = new Set()) {
    if (!id || visited.has(id)) return null;
    const obj = heap[String(id)]; if (!obj || !isTreeNode(obj)) return null;
    visited.add(id);
    const valAttr = obj.attrs?.val ?? obj.attrs?.data ?? obj.attrs?.value;
    const l = obj.attrs?.left, r = obj.attrs?.right;
    return { id, val: valAttr ? valAttr.r : '?',
             left:  l && !l.p ? buildNode(l.id, visited) : null,
             right: r && !r.p ? buildNode(r.id, visited) : null };
  }

  const root = buildNode(rootId); if (!root) return null;

  let counter = 0;
  function assignX(n) { if (!n) return; assignX(n.left); n.x = counter++; assignX(n.right); }
  function assignY(n, d = 0) { if (!n) return; n.y = d; assignY(n.left,d+1); assignY(n.right,d+1); }
  assignX(root); assignY(root);

  const all = [];
  function collect(n) { if (!n) return; all.push(n); collect(n.left); collect(n.right); }
  collect(root);

  if (all.length > 127) {
    const w = el('div', 'tree-viz');
    w.innerHTML = '<span style="font-size:0.75rem;color:#9ca3af">Tree too large to render</span>';
    return w;
  }

  // ── Recursion call-path detection ──────────────────────────────────────────
  const isRecursive = !!(stepData && stepData.caller && stepData.caller.fn === stepData.fn);

  // Collect ALL tree-node variables in scope, with their role
  // role: 'traversal' | 'result' | 'query'
  const nodeRoles = {};  // nodeId -> role
  const nodePtrs  = {};  // nodeId -> [varNames]  (for label rendering)
  for (const [name, val] of Object.entries(locals)) {
    if (val.p) continue;
    const obj = heap[String(val.id)];
    if (!obj || !isTreeNode(obj)) continue;
    if (!nodePtrs[val.id]) nodePtrs[val.id] = [];
    nodePtrs[val.id].push(name);
    // Role priority: result > query > traversal
    const role = TREE_RESULT_VARS.has(name) ? 'result'
               : TREE_QUERY_VARS.has(name)  ? 'query'
               : 'traversal';
    if (!nodeRoles[val.id] || role === 'result' ||
        (role === 'query' && nodeRoles[val.id] === 'traversal')) {
      nodeRoles[val.id] = role;
    }
  }

  // Primary traversal node (used for call-path tracing)
  let currentNodeId = null;
  for (const name of TREE_NODE_NAMES) {
    const val = locals[name];
    if (val && !val.p && nodeRoles[val.id] === 'traversal') { currentNodeId = val.id; break; }
  }
  if (!currentNodeId) {
    // fallback: any traversal node
    for (const [id, role] of Object.entries(nodeRoles)) {
      if (role === 'traversal') { currentNodeId = Number(id); break; }
    }
  }

  // When root is None (base case), walk backwards to keep the caller node visible
  let atNoneCall = false;
  if (!currentNodeId && stepData && stepIdx !== undefined) {
    for (let i = stepIdx - 1; i >= 0; i--) {
      const prev = trace[i];
      if (prev.fn !== stepData.fn) break;
      for (const name of TREE_NODE_NAMES) {
        const val = prev.lc?.[name];
        if (val && !val.p) {
          const obj = heap[String(val.id)];
          if (obj && isTreeNode(obj)) { currentNodeId = val.id; atNoneCall = true; break; }
        }
      }
      if (currentNodeId) break;
    }
  }

  // Find path from tree root to current node — gives the recursive call chain
  const pathNodeIds  = new Set();
  const pathEdgeKeys = new Set();
  if (isRecursive && currentNodeId && currentNodeId !== rootId) {
    const pathArr = [];
    (function dfs(n) {
      if (!n) return false;
      pathArr.push(n);
      if (n.id === currentNodeId) return true;
      if (dfs(n.left) || dfs(n.right)) return true;
      pathArr.pop(); return false;
    })(root);
    pathArr.forEach(n => pathNodeIds.add(n.id));
    for (let i = 0; i < pathArr.length - 1; i++) pathEdgeKeys.add(`${pathArr[i].id},${pathArr[i+1].id}`);
  }

  const NW = 38, NH = 30, XG = 48, YG = 52, PAD = 16;
  const maxX = Math.max(...all.map(n => n.x)), maxY = Math.max(...all.map(n => n.y));
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', PAD*2 + (maxX+1)*XG);
  svg.setAttribute('height', PAD*2 + (maxY+1)*YG + 12);
  svg.classList.add('tree-svg');

  // Draw non-path edges first (gray), then path edges (orange) so they sit on top
  all.forEach(node => {
    [node.left, node.right].filter(Boolean).forEach(child => {
      if (pathEdgeKeys.has(`${node.id},${child.id}`)) return;
      const line = document.createElementNS(NS,'line');
      line.setAttribute('x1', PAD+node.x*XG+NW/2); line.setAttribute('y1', PAD+node.y*YG+NH);
      line.setAttribute('x2', PAD+child.x*XG+NW/2); line.setAttribute('y2', PAD+child.y*YG);
      line.setAttribute('stroke','#d1d5db'); line.setAttribute('stroke-width','1.5');
      svg.appendChild(line);
    });
  });
  all.forEach(node => {
    [node.left, node.right].filter(Boolean).forEach(child => {
      if (!pathEdgeKeys.has(`${node.id},${child.id}`)) return;
      const line = document.createElementNS(NS,'line');
      line.setAttribute('x1', PAD+node.x*XG+NW/2); line.setAttribute('y1', PAD+node.y*YG+NH);
      line.setAttribute('x2', PAD+child.x*XG+NW/2); line.setAttribute('y2', PAD+child.y*YG);
      line.setAttribute('stroke','#f97316'); line.setAttribute('stroke-width','2.5');
      svg.appendChild(line);
    });
  });

  all.forEach(node => {
    const nx = PAD+node.x*XG, ny = PAD+node.y*YG;
    const ptrs         = nodePtrs[node.id] || [];
    const role         = nodeRoles[node.id];           // 'traversal' | 'result' | 'query' | undefined
    const isPointed    = !!role;
    const isNoneCaller = atNoneCall && node.id === currentNodeId && !isPointed;
    const isAncestor   = pathNodeIds.has(node.id) && !isPointed && !isNoneCaller;

    let fill, stroke, strokeW, strokeDash, textFill, fontW, labelFill;
    if (role === 'result') {
      fill='#dcfce7'; stroke='#16a34a'; strokeW='3'; strokeDash=null; textFill='#14532d'; fontW='900'; labelFill='#15803d';
    } else if (role === 'query') {
      fill='#dbeafe'; stroke='#2563eb'; strokeW='3'; strokeDash=null; textFill='#1e3a8a'; fontW='900'; labelFill='#1d4ed8';
    } else if (role === 'traversal') {
      fill='#fef9c3'; stroke='#ca8a04'; strokeW='3'; strokeDash=null; textFill='#92400e'; fontW='900'; labelFill='#ca8a04';
    } else if (isNoneCaller) {
      fill='#fef9c3'; stroke='#ca8a04'; strokeW='2.5'; strokeDash='5 3'; textFill='#92400e'; fontW='900'; labelFill='#ca8a04';
    } else if (isAncestor) {
      fill='#ffedd5'; stroke='#f97316'; strokeW='2'; strokeDash=null; textFill='#7c2d12'; fontW='800'; labelFill='#f97316';
    } else {
      fill='white'; stroke='#374151'; strokeW='1.5'; strokeDash=null; textFill='#374151'; fontW='600'; labelFill='#6b7280';
    }

    const rect = document.createElementNS(NS,'rect');
    rect.setAttribute('x',nx); rect.setAttribute('y',ny);
    rect.setAttribute('width',NW); rect.setAttribute('height',NH); rect.setAttribute('rx',5);
    rect.setAttribute('fill', fill); rect.setAttribute('stroke', stroke); rect.setAttribute('stroke-width', strokeW);
    if (strokeDash) rect.setAttribute('stroke-dasharray', strokeDash);
    rect.dataset.obj = node.id;
    svg.appendChild(rect);

    const txt = document.createElementNS(NS,'text');
    txt.setAttribute('x',nx+NW/2); txt.setAttribute('y',ny+NH/2+4);
    txt.setAttribute('text-anchor','middle'); txt.setAttribute('font-family','monospace');
    txt.setAttribute('font-size','11'); txt.setAttribute('font-weight', fontW); txt.setAttribute('fill', textFill);
    txt.textContent = node.val; svg.appendChild(txt);

    if (isNoneCaller) {
      const noneLbl = document.createElementNS(NS,'text');
      noneLbl.setAttribute('x',nx+NW/2); noneLbl.setAttribute('y',ny-3);
      noneLbl.setAttribute('text-anchor','middle'); noneLbl.setAttribute('font-family','monospace');
      noneLbl.setAttribute('font-size','8'); noneLbl.setAttribute('fill','#ca8a04'); noneLbl.setAttribute('font-weight','800');
      noneLbl.textContent = '→ None'; svg.appendChild(noneLbl);
    }
    if (ptrs.length) {
      const lbl = document.createElementNS(NS,'text');
      lbl.setAttribute('x',nx+NW/2); lbl.setAttribute('y',ny-3);
      lbl.setAttribute('text-anchor','middle'); lbl.setAttribute('font-family','monospace');
      lbl.setAttribute('font-size','9'); lbl.setAttribute('fill', labelFill); lbl.setAttribute('font-weight','800');
      lbl.textContent = ptrs.join(','); svg.appendChild(lbl);
    }
  });

  const wrapper = el('div', 'tree-viz');
  wrapper.appendChild(svg);

  // Legend — build from what's actually visible
  const legendParts = [];
  if (isRecursive) legendParts.push(`<span class="tree-legend-item"><span class="tree-legend-swatch" style="background:#ffedd5;border-color:#f97316"></span>call path</span>`);
  if (Object.values(nodeRoles).includes('traversal')) legendParts.push(`<span class="tree-legend-item"><span class="tree-legend-swatch" style="background:#fef9c3;border-color:#ca8a04"></span>current</span>`);
  if (Object.values(nodeRoles).includes('query'))     legendParts.push(`<span class="tree-legend-item"><span class="tree-legend-swatch" style="background:#dbeafe;border-color:#2563eb"></span>query node</span>`);
  if (Object.values(nodeRoles).includes('result'))    legendParts.push(`<span class="tree-legend-item"><span class="tree-legend-swatch" style="background:#dcfce7;border-color:#16a34a"></span>answer</span>`);
  if (legendParts.length) {
    const leg = el('div', 'tree-recursion-legend');
    leg.innerHTML = legendParts.join('');
    wrapper.appendChild(leg);
  }

  return wrapper;
}

// ── N-ary tree visualization ──────────────────────────────────────────────────
function isNAryTreeNode(obj) {
  return obj && !obj.p && obj.attrs
    && 'children' in obj.attrs
    && ('val' in obj.attrs || 'data' in obj.attrs || 'value' in obj.attrs)
    && !('left' in obj.attrs) && !('right' in obj.attrs)
    && !('neighbors' in obj.attrs) && !('next' in obj.attrs);
}

function buildNAryTreeViz(rootId, heap, locals, stepData, stepIdx) {
  function buildNode(id, visited = new Set()) {
    if (!id || visited.has(id)) return null;
    const obj = heap[String(id)]; if (!obj) return null;
    visited.add(id);
    const valAttr = obj.attrs?.val ?? obj.attrs?.data ?? obj.attrs?.value;
    const kidsAttr = obj.attrs?.children;
    const children = (kidsAttr?.items || [])
      .filter(c => c && !c.p && c.id)
      .map(c => buildNode(c.id, visited))
      .filter(Boolean);
    return { id, val: valAttr?.r ?? '?', children };
  }

  const root = buildNode(rootId); if (!root) return null;

  function computeWidth(n) {
    if (!n.children.length) { n.width = 1; return; }
    n.children.forEach(computeWidth);
    n.width = n.children.reduce((s, c) => s + c.width, 0);
  }
  function assignX(n, offset = 0) {
    if (!n.children.length) { n.x = offset; return; }
    let cur = offset;
    n.children.forEach(c => { assignX(c, cur); cur += c.width; });
    n.x = (n.children[0].x + n.children[n.children.length - 1].x) / 2;
  }
  function assignY(n, d = 0) { n.y = d; n.children.forEach(c => assignY(c, d + 1)); }

  computeWidth(root); assignX(root, 0); assignY(root);

  const all = [];
  function collect(n) { all.push(n); n.children.forEach(collect); }
  collect(root);

  if (all.length > 60) {
    const w = el('div', 'tree-viz');
    w.innerHTML = '<span style="font-size:0.75rem;color:#9ca3af">Tree too large to render</span>';
    return w;
  }

  // ── Recursion call-path detection ──────────────────────────────────────────
  const isRecursive = !!(stepData && stepData.caller && stepData.caller.fn === stepData.fn);

  const nodeRoles = {}, nodePtrs = {};
  for (const [name, val] of Object.entries(locals)) {
    if (val.p) continue;
    const obj = heap[String(val.id)];
    if (!obj || !isNAryTreeNode(obj)) continue;
    if (!nodePtrs[val.id]) nodePtrs[val.id] = [];
    nodePtrs[val.id].push(name);
    const role = TREE_RESULT_VARS.has(name) ? 'result' : TREE_QUERY_VARS.has(name) ? 'query' : 'traversal';
    if (!nodeRoles[val.id] || role === 'result' || (role === 'query' && nodeRoles[val.id] === 'traversal'))
      nodeRoles[val.id] = role;
  }

  let currentNodeId = null;
  for (const name of TREE_NODE_NAMES) {
    const val = locals[name];
    if (val && !val.p && nodeRoles[val.id] === 'traversal') { currentNodeId = val.id; break; }
  }
  if (!currentNodeId) {
    for (const [id, role] of Object.entries(nodeRoles)) {
      if (role === 'traversal') { currentNodeId = Number(id); break; }
    }
  }

  let atNoneCall = false;
  if (!currentNodeId && stepData && stepIdx !== undefined) {
    for (let i = stepIdx - 1; i >= 0; i--) {
      const prev = trace[i];
      if (prev.fn !== stepData.fn) break;
      for (const name of TREE_NODE_NAMES) {
        const val = prev.lc?.[name];
        if (val && !val.p) {
          const obj = heap[String(val.id)];
          if (obj && isNAryTreeNode(obj)) { currentNodeId = val.id; atNoneCall = true; break; }
        }
      }
      if (currentNodeId) break;
    }
  }

  const pathNodeIds  = new Set();
  const pathEdgeKeys = new Set();
  if (isRecursive && currentNodeId && currentNodeId !== rootId) {
    const pathArr = [];
    (function dfs(n) {
      if (!n) return false;
      pathArr.push(n);
      if (n.id === currentNodeId) return true;
      if (n.children.some(c => dfs(c))) return true;
      pathArr.pop(); return false;
    })(root);
    pathArr.forEach(n => pathNodeIds.add(n.id));
    for (let i = 0; i < pathArr.length - 1; i++) pathEdgeKeys.add(`${pathArr[i].id},${pathArr[i+1].id}`);
  }

  const NW = 36, NH = 28, XG = 46, YG = 50, PAD = 16;
  const maxX = Math.max(...all.map(n => n.x)), maxY = Math.max(...all.map(n => n.y));
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width',  PAD * 2 + (maxX + 1) * XG);
  svg.setAttribute('height', PAD * 2 + (maxY + 1) * YG + 12);
  svg.classList.add('tree-svg');

  // Non-path edges (gray), then path edges (orange)
  all.forEach(node => {
    node.children.forEach(child => {
      if (pathEdgeKeys.has(`${node.id},${child.id}`)) return;
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', PAD + node.x * XG + NW/2); line.setAttribute('y1', PAD + node.y * YG + NH);
      line.setAttribute('x2', PAD + child.x * XG + NW/2); line.setAttribute('y2', PAD + child.y * YG);
      line.setAttribute('stroke', '#d1d5db'); line.setAttribute('stroke-width', '1.5');
      svg.appendChild(line);
    });
  });
  all.forEach(node => {
    node.children.forEach(child => {
      if (!pathEdgeKeys.has(`${node.id},${child.id}`)) return;
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', PAD + node.x * XG + NW/2); line.setAttribute('y1', PAD + node.y * YG + NH);
      line.setAttribute('x2', PAD + child.x * XG + NW/2); line.setAttribute('y2', PAD + child.y * YG);
      line.setAttribute('stroke', '#f97316'); line.setAttribute('stroke-width', '2.5');
      svg.appendChild(line);
    });
  });

  all.forEach(node => {
    const nx = PAD + node.x * XG, ny = PAD + node.y * YG;
    const ptrs         = nodePtrs[node.id] || [];
    const role         = nodeRoles[node.id];
    const isPointed    = !!role;
    const isNoneCaller = atNoneCall && node.id === currentNodeId && !isPointed;
    const isAncestor   = pathNodeIds.has(node.id) && !isPointed && !isNoneCaller;

    let fill, stroke, strokeW, strokeDash, textFill, fontW, labelFill;
    if (role === 'result') {
      fill='#dcfce7'; stroke='#16a34a'; strokeW='3'; strokeDash=null; textFill='#14532d'; fontW='900'; labelFill='#15803d';
    } else if (role === 'query') {
      fill='#dbeafe'; stroke='#2563eb'; strokeW='3'; strokeDash=null; textFill='#1e3a8a'; fontW='900'; labelFill='#1d4ed8';
    } else if (role === 'traversal') {
      fill='#fef9c3'; stroke='#ca8a04'; strokeW='3'; strokeDash=null; textFill='#92400e'; fontW='900'; labelFill='#ca8a04';
    } else if (isNoneCaller) {
      fill='#fef9c3'; stroke='#ca8a04'; strokeW='2.5'; strokeDash='5 3'; textFill='#92400e'; fontW='900'; labelFill='#ca8a04';
    } else if (isAncestor) {
      fill='#ffedd5'; stroke='#f97316'; strokeW='2'; strokeDash=null; textFill='#7c2d12'; fontW='800'; labelFill='#f97316';
    } else {
      fill='#fffbeb'; stroke='#d97706'; strokeW='1.5'; strokeDash=null; textFill='#374151'; fontW='600'; labelFill='#6b7280';
    }

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', nx); rect.setAttribute('y', ny);
    rect.setAttribute('width', NW); rect.setAttribute('height', NH); rect.setAttribute('rx', 5);
    rect.setAttribute('fill', fill); rect.setAttribute('stroke', stroke); rect.setAttribute('stroke-width', strokeW);
    if (strokeDash) rect.setAttribute('stroke-dasharray', strokeDash);
    rect.dataset.obj = node.id;
    svg.appendChild(rect);

    const txt = document.createElementNS(NS, 'text');
    txt.setAttribute('x', nx + NW/2); txt.setAttribute('y', ny + NH/2 + 4);
    txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('font-family', 'monospace');
    txt.setAttribute('font-size', '11'); txt.setAttribute('font-weight', fontW); txt.setAttribute('fill', textFill);
    txt.textContent = node.val; svg.appendChild(txt);

    if (isNoneCaller) {
      const noneLbl = document.createElementNS(NS,'text');
      noneLbl.setAttribute('x',nx+NW/2); noneLbl.setAttribute('y',ny-3);
      noneLbl.setAttribute('text-anchor','middle'); noneLbl.setAttribute('font-family','monospace');
      noneLbl.setAttribute('font-size','8'); noneLbl.setAttribute('fill','#ca8a04'); noneLbl.setAttribute('font-weight','800');
      noneLbl.textContent = '→ None'; svg.appendChild(noneLbl);
    }
    if (ptrs.length) {
      const lbl = document.createElementNS(NS, 'text');
      lbl.setAttribute('x', nx + NW/2); lbl.setAttribute('y', ny - 3);
      lbl.setAttribute('text-anchor', 'middle'); lbl.setAttribute('font-family', 'monospace');
      lbl.setAttribute('font-size', '9'); lbl.setAttribute('fill', labelFill); lbl.setAttribute('font-weight', '800');
      lbl.textContent = ptrs.join(','); svg.appendChild(lbl);
    }
  });

  const wrapper = el('div', 'tree-viz');
  wrapper.appendChild(svg);

  const legendParts = [];
  if (isRecursive) legendParts.push(`<span class="tree-legend-item"><span class="tree-legend-swatch" style="background:#ffedd5;border-color:#f97316"></span>call path</span>`);
  if (Object.values(nodeRoles).includes('traversal')) legendParts.push(`<span class="tree-legend-item"><span class="tree-legend-swatch" style="background:#fef9c3;border-color:#ca8a04"></span>current</span>`);
  if (Object.values(nodeRoles).includes('query'))     legendParts.push(`<span class="tree-legend-item"><span class="tree-legend-swatch" style="background:#dbeafe;border-color:#2563eb"></span>query node</span>`);
  if (Object.values(nodeRoles).includes('result'))    legendParts.push(`<span class="tree-legend-item"><span class="tree-legend-swatch" style="background:#dcfce7;border-color:#16a34a"></span>answer</span>`);
  if (legendParts.length) {
    const leg = el('div', 'tree-recursion-legend');
    leg.innerHTML = legendParts.join('');
    wrapper.appendChild(leg);
  }

  return wrapper;
}

// ── Generic heap object ───────────────────────────────────────────────────────
function buildHeapObj(val, id) {
  const box = el('div', 'heap-obj'); box.dataset.obj = id;
  const lbl = el('div', 'heap-obj-label');
  if (val.t === 'dict') lbl.classList.add('t-dict');
  if (val.t === 'set')  lbl.classList.add('t-set');
  if (val.t === 'tuple') lbl.classList.add('t-tuple');
  lbl.textContent = val.t; box.appendChild(lbl);

  if (val.t === 'list' || val.t === 'tuple') {
    if (!val.items?.length) { box.appendChild(Object.assign(el('div','empty-obj'), {textContent:'empty'})); }
    else {
      const cells = el('div','list-cells');
      val.items.forEach((item,i) => {
        const c = el('div','list-cell'); c.dataset.idx = i;
        c.innerHTML = `<div class="cell-idx">${i}</div><div class="cell-val">${esc(item.r)}</div>`;
        cells.appendChild(c);
      });
      box.appendChild(cells);
    }
  } else if (val.t === 'dict') {
    if (!val.items?.length) { box.appendChild(Object.assign(el('div','empty-obj'), {textContent:'{}'})); }
    else {
      const rows = el('div','dict-rows');
      val.items.forEach(([k,v]) => {
        const row = el('div','dict-row'); row.dataset.key = k;
        row.innerHTML = `<div class="dict-key" title="${esc(k)}">${esc(k)}</div><div class="dict-val">${esc(v.r)}</div>`;
        rows.appendChild(row);
      });
      box.appendChild(rows);
    }
  } else if (val.t === 'set') {
    const cells = el('div','set-cells');
    (val.items||[]).forEach(item => {
      const c = el('div','set-cell'); c.textContent = item.r; cells.appendChild(c);
    });
    box.appendChild(cells);
  }
  return box;
}

// ══════════════════════════════════════════════════════════════════════════════
// TYPE SYSTEM + SIGNATURE DETECTION (unchanged from previous version)
// ══════════════════════════════════════════════════════════════════════════════
function parseType(raw) {
  if (!raw) return 'any';
  let t = raw.trim();
  t = t.replace(/^Optional\[(.+)\]$/, '$1');
  t = t.replace(/^Union\[(.+),\s*None\]$/, '$1');
  return t.trim();
}
function typeCategory(t) {
  if (!t || t === 'any') return 'raw';
  if (t === 'int' || t === 'float') return 'number';
  if (t === 'str') return 'string';
  if (t === 'bool') return 'bool';
  if (t === 'ListNode') return 'linked_list';
  if (t === 'TreeNode') return 'tree';
  if (t === 'Node')     return 'narytree';
  if (/^List\[List\[/.test(t)) return 'matrix';
  if (/^List\[/.test(t)) return 'list';
  return 'raw';
}
function typePlaceholder(t) {
  const cat = typeCategory(t);
  if (cat === 'number')      return t === 'float' ? '0.0' : '0';
  if (cat === 'string')      return '"hello"';
  if (cat === 'bool')        return 'True';
  if (cat === 'linked_list') return '[1, 2, 3, 4, 5]';
  if (cat === 'tree')        return '[3, 9, 20, null, null, 15, 7]';
  if (cat === 'narytree')    return '[1, null, 3, 2, 4, null, 5, 6]';
  if (cat === 'matrix')      return '[[1, 2], [3, 4]]';
  if (cat === 'list') {
    if (/str/.test(t)) return '["a","b","c"]';
    return '[1, 2, 3]';
  }
  return 'value';
}

function detectSignature(code) {
  const lines = code.split('\n'); let inSolution = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^class\s+Solution\s*[:(]/.test(trimmed)) { inSolution = true; continue; }
    if (inSolution && /^\s+def\s+/.test(line)) {
      const m = line.match(/def\s+(\w+)\s*\(\s*self(?:\s*,\s*(.*?))?\s*\)\s*(?:->.*?)?:/);
      if (m) { return { methodName: m[1], params: m[2] ? parseParams(m[2]) : [] }; }
    }
    if (inSolution && trimmed && !/^\s/.test(line) && !/^class\s+Solution/.test(trimmed)) inSolution = false;
  }
  return { methodName: null, params: [] };
}

function parseParams(paramStr) {
  const params = []; let depth = 0, start = 0;
  for (let i = 0; i <= paramStr.length; i++) {
    const c = paramStr[i];
    if (c === '[' || c === '(') depth++;
    else if (c === ']' || c === ')') depth--;
    else if ((c === ',' || i === paramStr.length) && depth === 0) {
      const seg = paramStr.slice(start, i).trim();
      if (seg) {
        const ci = seg.indexOf(':'), ei = seg.indexOf('=');
        let name, rawType;
        if (ci > -1) { name = seg.slice(0,ci).trim(); rawType = seg.slice(ci+1, ei>ci?ei:seg.length).trim(); }
        else          { name = (ei>-1 ? seg.slice(0,ei) : seg).trim(); rawType = null; }
        if (name) params.push({ name, type: parseType(rawType) });
      }
      start = i + 1;
    }
  }
  return params;
}

let lastSig = { methodName: null, params: [] };
function updateParamUI(code) {
  const sig = detectSignature(code);
  if (sig.methodName === lastSig.methodName && JSON.stringify(sig.params) === JSON.stringify(lastSig.params)) return;
  lastSig = sig;
  const body = $('params-body'), label = $('method-name-label');
  if (!sig.methodName || !sig.params.length) {
    body.innerHTML = '';
    body.appendChild(Object.assign(el('div'), { id: 'no-solution-msg', innerHTML: sig.methodName ? `<em>${sig.methodName}() takes no parameters</em>` : 'Write a <code>class Solution</code> to see inputs' }));
    label.textContent = ''; return;
  }
  label.textContent = `· ${sig.methodName}()`;
  body.innerHTML = '';
  sig.params.forEach(({ name, type }) => {
    const cat = typeCategory(type), ph = typePlaceholder(type), row = el('div', 'param-row');
    row.innerHTML =
      `<span class="param-label">${esc(name)}</span>` +
      `<span class="type-badge type-${cat}">${esc(type === 'any' ? 'any' : type)}</span>` +
      `<span class="param-eq">=</span>` +
      `<input class="param-input" id="param-${esc(name)}" data-param="${esc(name)}" placeholder="${esc(ph)}" spellcheck="false" autocomplete="off">`;
    body.appendChild(row);
  });
}
function getParamValues() {
  // Prefer viz-page inputs when on viz page; fall back to edit-page inputs
  const vals = {};
  // Edit-page inputs first (lower priority)
  document.querySelectorAll('#params-body .param-input').forEach(inp => { vals[inp.dataset.param] = inp.value.trim() || ''; });
  // Viz-page inputs override if they exist and have a value
  document.querySelectorAll('#viz-params-bar .param-input').forEach(inp => {
    const v = inp.value.trim();
    if (v) vals[inp.dataset.param] = v;
  });
  return vals;
}
function setParamValues(obj) {
  for (const [k, v] of Object.entries(obj)) {
    const inp = document.getElementById(`param-${k}`); if (inp) inp.value = v;
  }
}

function buildDriverCode(sig, paramValues) {
  const { methodName, params } = sig; if (!methodName) return '';
  const needLL   = params.some(p => typeCategory(p.type) === 'linked_list');
  const needTree = params.some(p => typeCategory(p.type) === 'tree');
  const needNary = params.some(p => typeCategory(p.type) === 'narytree');
  const lines = ['\n# ── setup ──────────────────────────────────────────'];
  if (needLL) lines.push(`
def _build_ll(vals):
    if not vals: return None
    nodes = [ListNode(v) for v in vals]
    for i in range(len(nodes) - 1): nodes[i].next = nodes[i + 1]
    return nodes[0]`);
  if (needTree) lines.push(`
def _build_tree(vals):
    if not vals or vals[0] is None: return None
    from collections import deque
    root = TreeNode(vals[0]); q = deque([root]); i = 1
    while q and i < len(vals):
        node = q.popleft()
        if i < len(vals) and vals[i] is not None: node.left = TreeNode(vals[i]); q.append(node.left)
        i += 1
        if i < len(vals) and vals[i] is not None: node.right = TreeNode(vals[i]); q.append(node.right)
        i += 1
    return root`);
  if (needNary) lines.push(`
def _build_nary(vals):
    if not vals: return None
    from collections import deque
    root = Node(vals[0]); root.children = []
    q = deque([root]); i = 2
    while q and i < len(vals):
        node = q.popleft()
        while i < len(vals) and vals[i] is not None:
            child = Node(vals[i]); child.children = []
            node.children.append(child); q.append(child); i += 1
        i += 1
    return root`);
  lines.push('\n# ── inputs ─────────────────────────────────────────────');
  for (const p of params) {
    const cat = typeCategory(p.type), v = (paramValues[p.name] || '').trim();
    const pyv = (v || '[]').replace(/\bnull\b/gi, 'None');
    if (cat === 'linked_list') lines.push(`${p.name} = _build_ll(${v || '[]'})`);
    else if (cat === 'tree')   lines.push(`${p.name} = _build_tree(${pyv})`);
    else if (cat === 'narytree') lines.push(`${p.name} = _build_nary(${pyv})`);
    else                       lines.push(`${p.name} = ${v || 'None'}`);
  }
  lines.push(`\n_solution = Solution()`);
  lines.push(`_result   = _solution.${methodName}(${params.map(p=>p.name).join(', ')})`);
  lines.push(`print(_result)`);
  return lines.join('\n');
}

// ══════════════════════════════════════════════════════════════════════════════
// VIZ RUNNER
// ══════════════════════════════════════════════════════════════════════════════
async function runViz() {
  const userCode = $('code-input').value; if (!userCode.trim()) return;
  stopPlay();
  const sig = detectSignature(userCode), pvals = getParamValues();

  // Validate param inputs before sending to Pyodide
  if (sig.methodName && sig.params.length) {
    for (const { name, type } of sig.params) {
      const val = (pvals[name] || '').trim();
      if (!val) { alert(`Missing value for parameter "${name}"`); return; }
      const cat = typeCategory(type);
      if (['list','matrix','linked_list','tree','narytree'].includes(cat)) {
        try { JSON.parse(val.replace(/\bNone\b/g, 'null').replace(/\bTrue\b/g,'true').replace(/\bFalse\b/g,'false')); }
        catch { alert(`Parameter "${name}" is not valid JSON.\nExpected something like: ${typePlaceholder(type)}`); return; }
      }
    }
  }

  const driver = sig.methodName ? buildDriverCode(sig, pvals) : '';
  const full = userCode + driver;
  userLineCount = userCode.split('\n').length;

  const btn = $('viz-btn'); btn.disabled = true; btn.textContent = '⚙️ Running…';
  try {
    pyodide.globals.set('_code', full);
    const raw = await pyodide.runPythonAsync(TRACER);
    const result = JSON.parse(raw);

    if (result.error && !result.trace?.length) { alert('Python error:\n' + result.error); return; }
    // Even with a partial trace, always surface the error so the user knows execution failed
    if (result.error && result.trace?.length) {
      $('error-text').textContent = '⚠  ' + result.error;
      $('output-section').style.display = '';
    }

    trace = (result.trace || []).filter(s => s.ln >= 1 && s.ln <= userLineCount);
    if (sig.methodName) {
      const entry = trace.findIndex(s => s.fn === sig.methodName);
      if (entry > 0) trace = trace.slice(entry);
    }
    if (!trace.length) { alert(sig.methodName ? `No trace for ${sig.methodName}() — check input values` : 'No class Solution found'); return; }

    // Detect likely infinite loop: if one line accounts for >60% of all steps and
    // the trace was truncated, it's almost certainly a runaway loop
    if (result.truncated) {
      const lineCounts = {};
      trace.forEach(s => { lineCounts[s.ln] = (lineCounts[s.ln] || 0) + 1; });
      const maxCount = Math.max(...Object.values(lineCounts));
      if (maxCount / trace.length > 0.6) {
        const hotLine = Object.keys(lineCounts).find(ln => lineCounts[ln] === maxCount);
        alert(`Possible infinite loop on line ${hotLine} — the trace hit the 800-step limit with that line repeated ${maxCount} times. Check your loop condition.`);
        return;
      }
    }

    // Precompute block structure and iteration counts
    blockStructure   = parseBlockStructure(userCode);
    iterCounts       = buildIterCounts(trace, blockStructure.blocks);

    // Capture full tree structure from the first step inside the solution method.
    // Using trace[0] (driver frame) would give us stale roots if the tree is
    // mutated — instead use the method entry step so we get the pre-mutation state.
    const methodEntry = sig.methodName
      ? (trace.find(s => s.fn === sig.methodName) || trace[0])
      : trace[0];
    initialHeap = methodEntry?.hp || {};
    initialTreeRoots = {};
    for (const [name, val] of Object.entries(methodEntry?.lc || {})) {
      if (val.p) continue;
      const obj = initialHeap[String(val.id)];
      if (obj && (isTreeNode(obj) || isNAryTreeNode(obj))) {
        initialTreeRoots[name] = val.id;
      }
    }

    buildCodeDisplay(full, userLineCount);
    show('viz-layout'); hide('edit-panel'); hide('search-row');
    populateVizParams();
    _lastRenderedContext = -1;
    step = 0; renderStep(0);
    $('truncation-warning').style.display = result.truncated ? '' : 'none';
    const errMsg = result.error ? '⚠  ' + result.error : '';
    $('error-text').textContent = errMsg;
    if (!errMsg) $('output-section').style.display = 'none';
  } catch (e) {
    alert('Runtime error: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = '▶  Visualize Code';
  }
}

// ── Code display ──────────────────────────────────────────────────────────────
function buildCodeDisplay(fullCode, userLines) {
  const container = $('code-lines'); container.innerHTML = '';
  fullCode.split('\n').forEach((line, i) => {
    const lineNum = i + 1; if (lineNum > userLines) return;
    const div = el('div', 'code-line'); div.dataset.ln = lineNum;
    div.innerHTML =
      `<span class="line-gutter"><span class="line-num">${lineNum}</span><span class="line-arrow"></span></span>` +
      `<span class="line-content">${esc(line) || ' '}</span>`;
    container.appendChild(div);
  });
}

// ── Render step ───────────────────────────────────────────────────────────────
let _lastRenderedContext = -1; // track which step's context is currently in the DOM
let _rafPending = false;

function renderStep(idx) {
  if (!trace.length) return;
  idx = Math.max(0, Math.min(idx, trace.length - 1));
  step = idx;
  const s = trace[idx], total = trace.length;

  // Clear line highlights
  document.querySelectorAll('.code-line').forEach(el => {
    el.classList.remove('active', 'caller-line');
    el.querySelector('.line-arrow').textContent = '';
  });

  // Active line — the only background highlight
  const active = document.querySelector(`.code-line[data-ln="${s.ln}"]`);
  if (active) {
    active.classList.add('active');
    active.querySelector('.line-arrow').textContent = '▶';
    active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // Caller line — orange left-border + arrow only, no background
  if (s.caller && s.caller.ln >= 1 && s.caller.ln <= userLineCount) {
    const callerEl = document.querySelector(`.code-line[data-ln="${s.caller.ln}"]`);
    if (callerEl && !callerEl.classList.contains('active')) {
      callerEl.classList.add('caller-line');
      callerEl.querySelector('.line-arrow').textContent = '←';
    }
  }

  let label = `line ${s.ln}`;
  if (s.fn && s.fn !== '<module>') {
    label = `${s.fn}()  ·  line ${s.ln}`;
    if (s.caller && s.caller.ln >= 1 && s.caller.ln <= userLineCount) {
      label += `  ←  line ${s.caller.ln}`;
    }
  }
  $('step-event-label').textContent = label;
  $('step-counter').textContent = `${idx + 1} / ${total}`;
  $('prev-btn').disabled = idx === 0;
  $('next-btn').disabled = idx === total - 1;
  const outText = s.out || '';
  $('output-text').textContent = outText;
  $('output-section').style.display = (outText || $('error-text').textContent) ? '' : 'none';

  // Skip exec-panel re-render if this step's context is already displayed
  if (idx !== _lastRenderedContext) {
    if (_rafPending) return;
    _rafPending = true;
    requestAnimationFrame(() => {
      _rafPending = false;
      renderContext(step);
      _lastRenderedContext = step;
    });
  }
}

// ── Autoplay ──────────────────────────────────────────────────────────────────
function startPlay() {
  if (playTimer) return;
  $('play-btn').textContent = '⏸';
  playTimer = setInterval(() => { if (step >= trace.length - 1) { stopPlay(); return; } renderStep(step + 1); }, 500);
}
function stopPlay() { clearInterval(playTimer); playTimer = null; const b = $('play-btn'); if (b) b.textContent = '▶'; }
function togglePlay() { playTimer ? stopPlay() : startPlay(); }

// ── Helpers ───────────────────────────────────────────────────────────────────
function $(id)        { return document.getElementById(id); }
function show(id)     { $(id).classList.remove('hidden'); }
function hide(id)     { $(id).classList.add('hidden'); }
function el(tag, cls) { const d = document.createElement(tag); if (cls) d.className = cls; return d; }
function esc(s)       { return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function truncate(s, n) { return s && s.length > n ? s.slice(0, n) + '…' : s; }

// ══════════════════════════════════════════════════════════════════════════════
// LEETCODE PROBLEM FETCHER
// ══════════════════════════════════════════════════════════════════════════════
const LC_API      = 'https://alfa-leetcode-api.onrender.com'; // fallback only
const VIZ_API     = 'http://localhost:5050';                  // standalone visualizer server

// ── Page-based problem cache ──────────────────────────────────────────────────
// Problems are fetched in pages of 100, keyed by page index.
// Page 0 = problems ~1–100, page 1 = ~101–200, etc.
// A page is only fetched when a problem number in its range is requested.
const problemPageCache = new Map(); // pageIndex → [{num, slug, title, diff}]

function pageIndexFor(num) { return Math.floor((num - 1) / 100); }

async function ensurePage(num) {
  const idx = pageIndexFor(num);
  if (problemPageCache.has(idx)) return problemPageCache.get(idx);

  let page;
  try {
    // Try our own DB first
    const res = await fetch(`${VIZ_API}/problems?page=${idx}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    page = (data.problems || []).map(p => ({
      num:  p.num,
      slug: p.slug,
      title: p.title,
      diff:  p.difficulty || ''
    }));
  } catch {
    // Fall back to alfa-leetcode-api
    const res = await fetch(`${LC_API}/problems?limit=100&skip=${idx * 100}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    page = (data.problemsetQuestionList || [])
      .map(p => ({
        num:   String(p.questionFrontendId),
        slug:  p.titleSlug,
        title: p.title,
        diff:  (p.difficulty || '').toLowerCase()
      }))
      .filter(p => p.slug);
  }

  problemPageCache.set(idx, page);
  return page;
}

async function resolveNumToSlug(num) {
  const page = await ensurePage(num);
  return page.find(p => p.num === String(num))?.slug || null;
}

async function fetchProblemByNum(num) {
  const panel  = $('problem-panel');
  const loadEl = $('problem-loading');
  const errEl  = $('problem-error');
  const bodyEl = $('problem-body');

  panel.classList.add('visible');
  loadEl.style.display = 'block';
  errEl.style.display  = 'none';
  bodyEl.innerHTML     = '';
  $('problem-title').innerHTML = '…';
  $('problem-num').textContent = '';
  $('problem-tags').innerHTML  = '';

  try {
    // Try our own DB first — returns description + starter + solution
    let data = null;
    try {
      const res = await fetch(`${VIZ_API}/problems/${num}`);
      if (res.ok) data = await res.json();
    } catch {}

    if (data) {
      // Render header + tags immediately
      const diff = (data.difficulty || '').toLowerCase();
      $('problem-num').textContent = `#${data.num}`;
      $('problem-title').innerHTML =
        `${esc(data.title)}&nbsp;<span class="diff-badge diff-${diff}">${esc(data.difficulty || '')}</span>`;
      const tagsEl = $('problem-tags');
      tagsEl.innerHTML = '';
      (data.tags || []).forEach(t => {
        const s = el('span', 'problem-tag'); s.textContent = t; tagsEl.appendChild(s);
      });
      loadEl.style.display = 'none';
      bodyEl.innerHTML = '<em style="color:#9ca3af">Loading description…</em>';

      // Load solution into editor immediately
      const code = (data.solution && data.solution.includes('class Solution')) ? data.solution : data.starter;
      if (code) {
        $('code-input').value = code;
        lastSig = { methodName: null, params: [] };
        updateParamUI(code);
        const sig = detectSignature(code);
        setTimeout(() => setParamValues(autoParamDefaults(sig)), 0);
      }
      const src = data.source && data.source !== 'none' ? ` · solution from ${data.source}` : '';
      setStatus(`✓ Loaded: ${data.title}${src}`, 3000);

      // Fetch description from LC_API in the background
      fetch(`${LC_API}/select?titleSlug=${encodeURIComponent(data.slug)}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { bodyEl.innerHTML = d?.question || '<em>Description unavailable.</em>'; })
        .catch(() => { bodyEl.innerHTML = '<em>Description unavailable.</em>'; });

    } else {
      // Fall back to alfa-leetcode-api using the slug from cache
      const page  = await ensurePage(num);
      const entry = page.find(p => p.num === String(num));
      if (!entry) throw new Error(`Problem #${num} not found`);
      await fetchProblemBySlugFallback(entry.slug);
    }
  } catch (e) {
    loadEl.style.display = 'none';
    errEl.style.display  = 'block';
    errEl.textContent    = `⚠ Could not load #${num}: ${e.message}`;
  }
}

// Fallback: fetch from alfa-leetcode-api when our DB doesn't have the problem yet
async function fetchProblemBySlugFallback(slug) {
  const loadEl = $('problem-loading');
  const errEl  = $('problem-error');
  const bodyEl = $('problem-body');

  const res  = await fetch(`${LC_API}/select?titleSlug=${encodeURIComponent(slug)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data.questionTitle) throw new Error('Problem not found');

  renderProblemHeader(data);
  loadEl.style.display = 'none';
  bodyEl.innerHTML = data.question || '<em>No description available.</em>';

  const snippet = (data.codeSnippets || []).find(s => s.langSlug === 'python3');
  if (snippet?.code) {
    $('code-input').value = snippet.code;
    lastSig = { methodName: null, params: [] };
    updateParamUI(snippet.code);
    const sig = detectSignature(snippet.code);
    setTimeout(() => setParamValues(autoParamDefaults(sig)), 0);
  }
  if (data.hints?.length) {
    const h = document.createElement('div');
    h.style.cssText = 'margin-top:12px;';
    h.innerHTML = `<details style="font-size:0.78rem;color:#6b7280"><summary style="cursor:pointer;font-weight:700;color:#374151">Hints (${data.hints.length})</summary>${data.hints.map((t,i)=>`<p style="margin:5px 0 0 10px">${i+1}. ${t}</p>`).join('')}</details>`;
    bodyEl.appendChild(h);
  }
  setStatus(`✓ Loaded: ${data.questionTitle}`, 3000);
}

// Generate sensible default param values from a detected method signature.
// Uses typePlaceholder() so every known type gets a working example value.
function autoParamDefaults(sig) {
  const defaults = {};
  for (const { name, type } of (sig.params || [])) {
    defaults[name] = typePlaceholder(type);
  }
  return defaults;
}

function renderProblemHeader(data) {
  const diff = (data.difficulty || '').toLowerCase();
  $('problem-num').textContent = `#${data.questionFrontendId}`;
  $('problem-title').innerHTML =
    `${esc(data.questionTitle)}&nbsp;<span class="diff-badge diff-${diff}">${esc(data.difficulty)}</span>`;
  const tagsEl = $('problem-tags');
  tagsEl.innerHTML = '';
  (data.topicTags || []).forEach(t => {
    const s = el('span', 'problem-tag'); s.textContent = t.name; tagsEl.appendChild(s);
  });
}

function setStatus(msg, clearAfterMs) {
  const s = $('search-status'); s.textContent = msg;
  if (clearAfterMs) setTimeout(() => { if (s.textContent === msg) s.textContent = ''; }, clearAfterMs);
}


function renderDropdown(results) {
  const box = $('search-results');
  if (!results.length) { box.style.display = 'none'; return; }
  box.innerHTML = '';
  results.forEach(r => {
    const item = el('div', 'search-result-item');
    const diffClass = r.diff ? `diff-badge diff-${r.diff}` : '';
    item.innerHTML =
      `<span class="search-result-num">#${r.num}</span>` +
      `<span class="search-result-title">${esc(r.title)}</span>` +
      (diffClass ? `<span class="${diffClass}" style="margin-left:auto;flex-shrink:0">${esc(r.diff)}</span>` : '');
    item.addEventListener('click', () => {
      $('problem-search').value = r.num;
      box.style.display = 'none';
      importByNum(parseInt(r.num));
    });
    box.appendChild(item);
  });
  box.style.display = 'block';
}

// Search only the already-cached pages — no network call, instant
function onSearchInput() {
  const q = $('problem-search').value.trim();
  $('search-results').style.display = 'none';
  if (!q || !/^\d+$/.test(q)) return;
  const results = [];
  for (const page of problemPageCache.values()) {
    for (const p of page) {
      if (p.num.startsWith(q)) results.push(p);
    }
  }
  results.sort((a, b) => parseInt(a.num) - parseInt(b.num));
  renderDropdown(results.slice(0, 8));
}

async function importByNum(num) {
  setStatus('Loading…');
  await fetchProblemByNum(num);
}

function onImportProblem() {
  const q = $('problem-search').value.trim();
  if (!q) { setStatus('Enter a problem number'); return; }
  if (!/^\d+$/.test(q)) { setStatus('Enter a number (e.g. 200)'); return; }
  $('search-results').style.display = 'none';
  importByNum(parseInt(q));
}

// ── Init ──────────────────────────────────────────────────────────────────────
function loadExample(key) {
  const ex = EXAMPLES[key]; if (!ex) return;
  $('code-input').value = ex.code;
  lastSig = { methodName: null, params: [] };
  updateParamUI(ex.code);
  setTimeout(() => setParamValues(ex.params), 0);
  if (ex.slug) fetchProblemBySlugFallback(ex.slug);  // fetch description for the problem panel
}

async function initPy() {
  try {
    pyodide = await loadPyodide();
    await pyodide.runPythonAsync(PRELUDE_CODE);
    hide('loading-overlay');
    const btn = $('viz-btn'); btn.disabled = false; btn.textContent = '▶  Visualize Code';
  } catch (e) {
    const box = document.querySelector('#loading-box'); box.classList.add('error');
    box.innerHTML = `<p>Failed to load Python runtime</p><small>${e.message}</small>`;
  }
}

// ── Viz-page helpers ──────────────────────────────────────────────────────────
function populateVizParams() {
  const bar = $('viz-params-bar');
  const code = $('code-input').value;
  const sig  = detectSignature(code);
  const pvals = getParamValues();
  bar.innerHTML = '';
  if (!sig.methodName || !sig.params.length) return;
  sig.params.forEach(({ name, type }) => {
    const cat = typeCategory(type), ph = typePlaceholder(type);
    const row = el('div', 'param-row');
    row.innerHTML =
      `<span class="param-label">${esc(name)}</span>` +
      `<span class="type-badge type-${cat}">${esc(type === 'any' ? 'any' : type)}</span>` +
      `<span class="param-eq">=</span>` +
      `<input class="param-input" id="viz-param-${esc(name)}" data-param="${esc(name)}" ` +
      `placeholder="${esc(ph)}" value="${esc(pvals[name] || '')}" spellcheck="false" autocomplete="off">`;
    bar.appendChild(row);
  });
  const btn = el('button'); btn.id = 'viz-rerun-btn'; btn.textContent = '▶ Re-run';
  btn.addEventListener('click', () => runViz());
  bar.appendChild(btn);
}

// ── Events ────────────────────────────────────────────────────────────────────
$('viz-btn').addEventListener('click', runViz);
$('next-btn').addEventListener('click', () => { stopPlay(); renderStep(step + 1); });
$('prev-btn').addEventListener('click', () => { stopPlay(); renderStep(step - 1); });
$('play-btn').addEventListener('click', togglePlay);
$('back-btn').addEventListener('click', () => { stopPlay(); hide('viz-layout'); show('edit-panel'); show('search-row'); trace = []; step = 0; });
$('edit-btn').addEventListener('click', () => { $('viz-code-input').value = $('code-input').value; show('code-edit-overlay'); });
$('code-edit-close').addEventListener('click',  () => hide('code-edit-overlay'));
$('code-edit-cancel').addEventListener('click', () => hide('code-edit-overlay'));
$('code-edit-rerun-btn').addEventListener('click', async () => {
  const newCode = $('viz-code-input').value;
  $('code-input').value = newCode;
  localStorage.setItem('viz_code', newCode);
  lastSig = { methodName: null, params: [] };  // force param re-render
  updateParamUI(newCode);
  hide('code-edit-overlay');
  await runViz();
});
document.querySelectorAll('.example-chip').forEach(btn => btn.addEventListener('click', () => loadExample(btn.dataset.example)));

// ── Problem search events ─────────────────────────────────────────────────────
$('search-btn').addEventListener('click', onImportProblem);
$('problem-close').addEventListener('click', () => $('problem-panel').classList.remove('visible'));
$('problem-search').addEventListener('input', onSearchInput);
$('problem-search').addEventListener('keydown', e => {
  if (e.key === 'Enter')  { e.preventDefault(); onImportProblem(); }
  if (e.key === 'Escape') { $('search-results').style.display = 'none'; }
});
// Close dropdown when clicking outside the search area
document.addEventListener('click', e => {
  if (!$('search-wrap').contains(e.target) && e.target !== $('search-btn'))
    $('search-results').style.display = 'none';
});
document.addEventListener('keydown', e => {
  if ($('viz-layout').classList.contains('hidden')) return;
  if (document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'INPUT') return;
  if (e.key === 'ArrowRight' || e.key === 'n') { stopPlay(); renderStep(step + 1); }
  else if (e.key === 'ArrowLeft' || e.key === 'p') { stopPlay(); renderStep(step - 1); }
  else if (e.key === ' ') { e.preventDefault(); togglePlay(); }
});

// ── Boot ──────────────────────────────────────────────────────────────────────
// Restore last session's code from localStorage; fall back to default example
const _savedCode = localStorage.getItem('viz_code');
if (_savedCode) {
  $('code-input').value = _savedCode;
  lastSig = { methodName: null, params: [] };
  updateParamUI(_savedCode);
} else {
  loadExample('linkedlist');
}
$('code-input').addEventListener('input', () => {
  localStorage.setItem('viz_code', $('code-input').value);
  updateParamUI($('code-input').value);
});
initPy();
