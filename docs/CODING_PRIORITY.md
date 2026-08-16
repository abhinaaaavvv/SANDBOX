CODING PRIORITY — IMPORTANT

This is an implementation task, not a research/reporting task.

PRIORITY ORDER:

1. WRITE CODE
2. RUN THE CODE / TEST IT
3. FIX ERRORS
4. VERIFY THE FEATURE
5. ONLY THEN summarize what you did

Do not spend the majority of the task analyzing or explaining.

You may inspect the existing code enough to understand the implementation,
but once the relevant files and architecture are identified, START CODING.

Do NOT:
- spend excessive time explaining the architecture
- produce a long analysis before making changes
- write a long implementation plan instead of implementing it
- create documentation before the feature works
- repeatedly investigate the same issue
- ask for confirmation for reasonable implementation decisions

IMPLEMENT FIRST.

Use this workflow:

1. Inspect the minimum necessary files.
2. Identify the broken/missing connection.
3. Implement the fix immediately.
4. Run TypeScript/build/tests.
5. Fix any errors you introduced.
6. Manually verify the affected workflow.
7. Only after everything works, provide a concise summary.

If the existing architecture already provides the necessary RPC/hook/component,
USE IT.

Do not redesign working architecture unnecessarily.

If a backend RPC exists:
→ call it correctly.

If a hook exists:
→ wire it into the UI.

If a handler exists:
→ connect the UI to it.

If a component exists:
→ reuse it.

Only create new infrastructure when the existing infrastructure genuinely
cannot implement the requested feature.

==================================================
CODING BUDGET
==================================================

Spend roughly:

20% → inspecting/reasoning
70% → coding + debugging
10% → verification/reporting

Do not spend 70% of the task writing an analysis/report.

==================================================
WHEN SOMETHING IS BROKEN
==================================================

Do NOT stop at:

"I found the issue."

Continue immediately to:

"I found the issue → I am fixing it."

Do NOT stop at:

"The RPC signature appears to be..."

Continue to actually update the caller.

Do NOT stop at:

"The component is missing a handler."

Add the handler and wire it.

Do NOT stop at:

"The database row does not exist."

Implement the correct provisioning/fix if that is within this task.

==================================================
REPORTING
==================================================

Keep the final response SHORT.

Only report:

- what was implemented
- files changed
- tests/build result
- any genuinely unresolved blocker

Do not write a multi-page report unless explicitly requested.

The code is the deliverable.
