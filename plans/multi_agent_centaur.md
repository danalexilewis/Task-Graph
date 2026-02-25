---
name: Multi-Agent Centaur Support
overview: |
  Make Task-Graph safe and productive for 1-3 simultaneous agents working alongside the human. Add claim/presence tracking so agents see each other's work, auto-migrate the schema so no agent ever guesses wrong, surface "doing" activity in tg status, and update agent directives so orientation includes awareness of other active work. Keep centaur: human plans, audits, and routes; agents execute with shared visibility.
todos:
  - id: auto-migrate-on-command
    content: Add ensureMigrations() that runs all idempotent migrations; call it at the start of every CLI command via shared preAction hook
    status: completed
isProject: false
---
