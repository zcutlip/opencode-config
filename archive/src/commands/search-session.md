---
description: Find a session by searching its title, content, or description
---

Find a session matching the following query: $ARGUMENTS

Use the session_search tool with the user's query to search across all sessions for matching text. If the search returns few or no results, supplement with session_list to browse recent sessions and check for title matches.

Present results in a clear table or list showing:
- Session ID
- Title
- Date range (first/last message)
- Message count

If multiple matches are found, ask the user which session they'd like to inspect. If they pick one, use session_read (with a reasonable limit) to show a summary of that session's content.

If no matches are found, suggest the user try different keywords or use /sessions to browse manually.

Do NOT auto-resume any session. Only present information and let the user decide what to do next.
