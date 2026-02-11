# UNIVERSAL CODING AGENT RULES

## 0. Context & Consistency (Highest Priority)
1.  **Respect Existing Patterns:** Scan the repository first. If a naming convention or pattern exists, FOLLOW IT. Consistency > Perfection.
2.  **Incremental Development:**
    * **Step 1:** Write the skeleton/interface (compilation unit).
    * **Step 2:** Update `tests.md` with a failing test.
    * **Step 3:** Implement logic to pass the test.
    * **Step 4:** Refactor for performance/safety.

## I. Modern Standards & Safety (Strict)
1.  **Deprecation Policy:** NEVER use language features or libraries deprecated in the last 2 major versions. Use the most modern, stable syntax available.
2.  **Resource Hygiene:**
    * **Explicit Cleanup:** "Fire and forget" is forbidden. All streams, file handles, sockets, and background tasks MUST be explicitly closed/cancelled.
    * **Memory:** No leaks. Use RAII (Resource Acquisition Is Initialization), `try-with-resources`, or `defer` patterns.
3.  **Type Safety:** If the language has types, use them. `Any`, `void*`, or mixed arrays are forbidden unless absolutely necessary (and documented).

## II. Code Style & Readability
1.  **Human-Centric:** No deep nesting (Max 2 levels). No nested loops (refactor to named functions).
2.  **Naming:** Verbose and descriptive. `userIndex` > `i`.
3.  **Comments:** Explain *WHY*, not *what*.
4.  **File Length:** Hard limit 1500 lines. Preferred 500.

## III. Documentation & Logs
**NEVER delete old entries.** Update with timestamp. Keep all in ./P_DATA folder. Always read first 4 for context
1.  `documentation.md`: Architecture decisions. Expansion of in-line comments.
2.  `changelog.md`: Files/lines changed.
3.  `to-do.md`: Pending tasks.
4.  `error-log.md`: Errors encountered and fixed.
5.  `tests.md`: **MANDATORY.** New tests added after every run.

## IV. Testing
1.  **Test Coverage:** 100% for critical paths. 80% for others.
2.  **Test Granularity:** Unit tests for functions, integration tests for modules.
3.  **Test Naming:** `test_<function_name>_<scenario>`.

## V. TypeScript Standards & Best Practices

### 1. Modern Syntax & Safety
* **Strict Mode:** `tsconfig.json` must have `"strict": true`.
* **No `any`:** usage of `any` is strictly forbidden. Use `unknown` if the type is dynamic, then use Type Guards to narrow it.
* **Null Checks:** Use Optional Chaining (`?.`) and Nullish Coalescing (`??`) instead of `&&` or `||` checks which can fail on `0` or `""`.

### 2. Async & Resource Management
* **Promise Handling:** NEVER leave a Promise floating (unawaited). Always `await` or return it.
* **Cleanup:** If using `setInterval` or event listeners, return a cleanup function (in `useEffect` or similar) to avoid memory leaks.

### 3. Examples
**Bad (Legacy/Unsafe):**
```typescript
// BAD: loose typing, legacy promise syntax
function getData(id: any) {
    if (id) {
        api.get(id).then(res => {
            globalData = res; // Implicit global
        });
    }
}
**GOOD (Modern/Safe):**
```typescript

// GOOD: Strict typing, async/await, optional chaining
interface UserData {
    id: string;
    name: string;
}

async function fetchUserData(id: string): Promise<UserData | null> {
    if (!id) return null;
    try {
        const response = await api.get<UserData>(`/users/${id}`);
        return response.data ?? null; // Nullish coalescing
    } catch (error) {
        console.error("Fetch failed", error);
        return null;
    }
}