# Instructions for AI coding assistants

Read `README.md` in full before making changes. Its section **"Rules for AI assistants"** is binding for this repo.

Short version:
- All math lives in the Google Sheet. The site only displays values (via `data-key`) and writes yellow input cells through Apps Script.
- Plain HTML/CSS/vanilla JS only. No frameworks, packages, CDNs, or build step.
- Apps Script code is edited only in `apps-script/Code.gs` here and shipped with `./deploy.sh "message"`. Never edit it on script.google.com.
- Never hard-code numbers, never compute numbers in JS, never commit secrets, never write to formula cells.
- Finish by telling the human whether to run `git push` or `./deploy.sh "message"`, and whether a "Kenny League" sheet-menu update is needed.
