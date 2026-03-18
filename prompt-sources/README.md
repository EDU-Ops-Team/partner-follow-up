# Prompt Sources

This directory is the editable source of truth for prompt content used by the EDU Ops agent.

## How it works
- Approved users edit the markdown files in `prompt-sources/`.
- In a team Git setup, approved users should edit these files through the repo web UI or pull requests.
- Run `npm run prompts:sync`.
- The sync script generates `convex/data/generated/promptLibrary.ts`.
- Convex and the frontend import the generated TypeScript module, not the markdown files directly.

## Why this shape
- Convex deployments should not rely on reading arbitrary local files at runtime.
- Generated TypeScript is deploy-safe on Vercel and Convex.
- Prompt changes stay reviewable in Git and editable in plain markdown.

## Current prompt files
- `claude/system.md`: global Claude system prompt.
- `claude/draft-reply-preamble.md`: instructions prepended to draft-reply generation.

## Team Git workflow
- Move or mirror this repository into the team Git organization.
- Protect the default branch or require review for prompt changes.
- Set `NEXT_PUBLIC_PROMPT_EDIT_BASE_URL` so the in-app docs page can link directly to the web editor for `prompt-sources/`.
- Optionally set `NEXT_PUBLIC_PROMPT_BROWSE_BASE_URL` so users can browse prompt files from inside the app.
