# Global Agent Instructions

## Test Execution

- When a task calls for running tests, delegate to the **test subagent**
  with the project's test command — do not run tests yourself.
- Pass the command in plain form from the project root
  (e.g. `./scripts/run-tests.sh -q`): agents already run there, and plain
  forms match permission allowlists — compound `cd <path> && ...` wrappers
  cannot be preapproved and will prompt every time.
