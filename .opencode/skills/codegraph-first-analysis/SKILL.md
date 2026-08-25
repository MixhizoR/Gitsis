---
name: codegraph-first-analysis
description: |
  Use CodeGraph as the FIRST tool for any code-understanding, code-location, or pre-edit
  consultation task in an indexed codebase. Reach for `codegraph_explore` (or the
  `codegraph explore` / `codegraph node` shell commands) BEFORE grep, Read, or Glob
  whenever the user asks how a system works, where a symbol lives, who calls it, what
  breaks if it changes, or any flow/path question across files. CodeGraph returns
  verbatim line-numbered source, the call path between symbols, and a blast-radius
  summary in ONE capped call — no separate grep-then-Read loop needed.

  Use this skill for: "how does X work", "where is X defined", "who calls Y", "trace
  the flow from A to B", "what depends on Z", "show me the call chain", "what breaks
  if I change this", pre-edit consultation (always load blast radius before editing
  a function), refactor impact analysis, and architecture surveys. Prefer it
  whenever you'd otherwise start a multi-file Read/Grep search on indexed source.

  DO NOT use grep/Read/Glob for code-first questions when a `.codegraph/` index
  exists. Only fall back when: (1) no index exists (suggest `codegraph init`),
  (2) the question is about configs / docs / non-code files that codegraph doesn't
  index, or (3) the staleness banner names specific files you must Read fresh.
compatibility: |
  Requires a `.codegraph/` directory at the project root, created via `codegraph init`.
  If absent, tell the user to run `codegraph init` (or `codegraph sync` for an existing
  uninitialized project) and stop — do not silently fall back to grep.
---

# CodeGraph-First Analysis

CodeGraph is a pre-built SQLite knowledge graph of every symbol, file, and edge in
the workspace. Reading it once via `codegraph_explore` gives you the verbatim source
AND the call paths between the symbols you named — work that would otherwise take
dozens of grep + Read calls, with worse accuracy. Use it for almost any
code-understanding task and especially before any edit.

## The workflow (in order)

### 1. Verify the index exists

Before any codegraph call, confirm `.codegraph/` is at the project root:

```
ls .codegraph/   # required
codegraph status # optional but informative — shows node/edge counts
```

If absent: stop, tell the user to run `codegraph init` (or `codegraph sync` to
refresh an existing one), and ask whether to proceed with grep or wait. Do not
silently degrade to grep for code questions.

### 2. Make ONE codegraph call

The single tool is `codegraph_explore` (MCP). It accepts either a natural-language
question or a bag of symbol/file names and returns the relevant source grouped by
file plus the call paths between them.

```
codegraph_explore("how does auth work from login to JWT verification")
codegraph_explore("loginUser verifyToken authMiddleware")
codegraph_explore("processPayment OrderService")  # flow between two symbols
```

**Tuning the call:**
- `maxFiles` (default 12) caps how many files' source appears. Increase only when
  the user wants a wider blast radius. Lower it (4–6) for narrow questions.
- `projectPath` is required only for monorepos with multiple `.codegraph/` indexes
  (e.g. `/repo/backend` and `/repo/frontend` each have one). Omit when the workspace
  has a single index.

**Naming the right symbols matters.** A flow question needs both endpoints named
(`mutateElement renderScene`), not one of them. A pre-edit check on a function
needs the function plus its callers' names so the blast radius is included. If
you don't know exact names, use a natural-language question — codegraph
fuzzy-matches.

### 3. Trust the result

`codegraph_explore` output is line-numbered source from a full AST parse. Treat it
as already Read. Do NOT re-verify with `grep` or re-read the same file with the
`Read` tool — that re-does work the index already did and is slower, less
accurate, and wastes context. If a tool response includes a symbol's source, you
can `Edit` from it.

### 4. Read the staleness banner

Every `codegraph_explore` response may start with a warning banner. Read it:

- **"Some files referenced below were edited since the last index sync…"** —
  the listed files are pending re-index. Read THOSE specific files fresh
  before quoting or editing them. Other files in the same response remain
  trustworthy.
- **"CodeGraph auto-sync is DISABLED…"** — the whole index is frozen (file
  watcher stopped). Treat ALL codegraph output as potentially stale. Read
  files directly before editing anything. Tell the user the watcher is
  paused; suggest restarting it.

No banner → trust the output completely.

### 5. Anonymous callbacks aren't named symbols (important)

CodeGraph's AST index names **declared** functions, classes, and methods —
not anonymous arrow functions or inline callbacks. So if a route is wired
up as:

```js
app.post('/api/auth/login', (req, res) => { ... })
app.get('/users/:id', async (req, res) => { ... })
router.patch('/x', wrap(async (req, res) => { ... }))
```

…the handler body has **no name** in the graph. `codegraph_explore` will
return the surrounding module (imports, helper functions, the literal
path string if any) but the handler body itself is inlined at the call
site and won't be in the result.

**When this happens, reach for `codegraph node -f` (file mode) — it's
still inside the codegraph toolchain, so you're not "falling back to
grep":**

```
codegraph node -f backend/src/server.js
# -> returns the file with line numbers (same shape as the Read tool)
#    pipe through sed/awk if you need a specific range:
codegraph node -f backend/src/server.js | sed -n '230,320p'
```

This is the right move because: (a) the AST line numbers you see line
up exactly with what `codegraph_explore` referenced, so the blast-radius
summary stays accurate; (b) the file watcher will mark it for re-index,
so the staleness story is preserved; (c) you still get the line-numbered
`<n>\t<line>` shape `Edit` expects. Treat `codegraph node -f <file>` as
a **first-class** read of indexed code, not a fallback.

The other common case: an entire module that has no extracted functions
(constant-only files, config-like re-exports). `codegraph_explore` may
return only a `const` or two — same remedy.

### 6. Existence checks: use `codegraph query`, not file search

When the user asks "is X a thing in this codebase?" or "does the project
have Y?", the right first move is a cheap symbol lookup, not a broad
file read:

```
codegraph query auth            # symbol search
codegraph query "prisma.user"   # quoted for dots / paths
codegraph status                # node/edge counts; "11 routes" tells you a lot
```

This is much cheaper than `grep` or `Read` because it hits the index
directly. If `codegraph query X` returns zero results, you have a strong
"X does not exist in the indexed code" answer — and you can confidently
report it instead of opening files to disprove existence. Combine with
`codegraph status` to confirm the index is fresh before declaring
absence.

### 7. Present findings in the canonical shape

For "how does X work" / flow questions:

1. **One-sentence answer** — what the flow does end to end.
2. **Source evidence** — verbatim line-numbered snippets from the codegraph
   response, formatted as `file:line` so the user can jump to them.
3. **Call path** — the chain of callers/callees codegraph surfaced (this is the
   part grep CAN'T give you).
4. **Blast radius** — who else is affected if the user changes this.
5. **Follow-up** — "Want me to trace X further?" or "Should I check
   callers of Y before editing?"

For pre-edit consultation (before changing a function/class):

1. **Current source** of the symbol with line numbers.
2. **Direct callers** (one hop out) — anything that imports or calls it.
3. **Transitive impact** — anything in the call path that depends on the
   return shape / side effects of the symbol.
4. **Files I'd need to update** if the signature changes.
5. **Stop and confirm with the user** before editing.

## What to use codegraph for vs. when to fall back

**Use codegraph for:**
- Symbol lookup ("where is X defined?")
- Function source ("show me the body of Y")
- Call paths / flows ("trace from A to B")
- Pre-edit consultation (load blast radius before changing code)
- Refactor impact ("what depends on this module?")
- Architecture surveys ("how do backend services connect to routes?")
- "What breaks if I change this?"
- Dynamic-dispatch-heavy flows (callbacks, React re-render) — codegraph
  follows these hops that grep can't.
- **Existence checks** ("does X exist?") — use `codegraph query X` before
  anything else.

## Fallback decision ladder (use this when codegraph doesn't surface what you need)

Walk top-down. Stop at the first step that works. **Never skip a step to
get to grep.**

| # | Try this | When it works | If it fails, go to step → |
|---|----------|---------------|--------------------------|
| 1 | `codegraph_explore("<query>")` | The symbol/flow is in the index; you get source + call path | 2 |
| 2 | `codegraph query <symbol>` | Cheap symbol-existence / definition lookup against the index | 3 |
| 3 | `codegraph node -f <file>` | The symbol is in an indexed file but the handler is anonymous / not extracted as a node | 4 |
| 4 | `codegraph node -f <file> \| sed -n 'A,Bp'` | You need a specific range inside a file the index knows about | 5 |
| 5 | `codegraph sync && codegraph_explore(...)` | The index is stale (banner said so) or the file was just edited | 6 |
| 6 | Read the specific file (still scoped — exact path, not Glob) | File is **not code** (config, schema, lockfile, CI, doc, README, .env.example) **or** banner listed it and you re-synced | 7 |
| 7 | `grep` / `rg` with a tight pattern | You're looking for a literal string across many files (a log line, a comment, a translation key) | 8 |
| 8 | Glob + Read | Genuine architectural exploration of files codegraph does not know about (new project, no index) | stop |

**Important rules for the ladder:**

- **Steps 1–5 stay inside the codegraph toolchain.** You're using
  `codegraph_explore`, `codegraph query`, `codegraph node -f`, or
  `codegraph sync`. None of these count as "falling back to grep."
- **Step 6 (raw Read) is allowed only for non-code files** (configs,
  schemas, lockfiles, CI, docs) or for files the staleness banner
  explicitly named **after** you've tried `codegraph sync`. Always Read
  the exact file path you know — don't Glob to find it.
- **Step 7 (grep) is the last resort.** Use a tight, anchored pattern,
  not a broad one. If you find yourself writing `grep -r foo | head -50`,
  you've probably already lost — go back to step 1 with a better query.
- **Never start at step 7.** Starting with grep for a code question in
  an indexed project means you skipped 5 cheaper, more accurate steps.
- **Always announce the fallback** so the user knows: "CodeGraph
  doesn't index configs, so I'm using Read here" or "Anonymous route
  handler — reading the file via `codegraph node -f`."

## Anti-patterns — what NOT to do

- **Don't grep first to "find" the file, then read it.** One
  `codegraph_explore` call returns both the file AND the relevant source.
- **Don't re-verify codegraph output with grep.** The AST parse is more
  accurate than text search; re-checking wastes context.
- **Don't read files codegraph already showed.** Its output is in the
  same `<n>\t<line>` shape as `Read` — Edit from it directly.
- **Don't reconstruct a flow by hand.** Name the endpoints in one call
  and codegraph surfaces the path between them, including dynamic-dispatch
  hops grep would miss.
- **Don't launch a separate Explore/Read sub-agent for code questions.**
  The codegraph call IS the lookup; delegating it duplicates work the
  pre-built index already did.
- **Don't add a codegraph call for every micro-question.** If one call
  already covered the area, use it. If you need more, refine the existing
  call's query — don't fire another from scratch.

## Pre-edit checklist (always before changing code)

1. `codegraph_explore("<functionName> <likelyCallers>")` — load the symbol
   and its blast radius in one shot.
2. Read the staleness banner. If it lists the file, Read fresh.
3. Tell the user what you'd touch (signature, return shape, side effects)
   and which callers need updates.
4. Wait for confirmation, then edit.

Skipping this step is how refactors silently break callers.

## Quick reference: the right query for the question

| You want to know | Query style |
|---|---|
| Where is X defined? | `codegraph_explore("X")` |
| What does X do? | `codegraph_explore("X")` and read its body |
| Who calls X? | `codegraph_explore("X <likelyCallers>")` |
| Flow from A to B | `codegraph_explore("A B")` — name BOTH endpoints |
| What breaks if I change X? | `codegraph_explore("X")` + read blast-radius summary |
| How do modules in `dir/` connect? | `codegraph_explore("how does <dir> work", maxFiles: 20)` |
| Architecture overview | `codegraph_explore("<moduleA> <moduleB> <moduleC>", maxFiles: 15)` |
| Does X exist in this codebase? | `codegraph query X` first — zero results = strong "no" answer |
| Anonymous route handler body? | `codegraph node -f <file> [\| sed -n 'A,Bp']` (still inside the codegraph toolchain) |
