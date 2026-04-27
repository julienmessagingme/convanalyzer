# CLAUDE.md — Mieux Assure Analyze

Outil d'analyse sémantique de conversations WhatsApp / chatbot. Multi-tenant, déployé sur Vercel + Supabase.

## Documentation

- **`documentation.md`** — architecture, stack, schéma DB, déploiement, auth, onboarding clients, patterns de code
- **`features.md`** — vue produit : ce que fait l'app, page par page
- **`wip.md`** — travail en cours, refactors envisagés, idées
- **`README.md`** — boilerplate Next.js (à laisser pour les contributors externes GitHub)

## Commandes essentielles

```bash
npm run dev          # dev server, http://localhost:3000/analyze
npm run build        # build production
npm run lint         # eslint

vercel env pull .env.vercel              # récup env vars Vercel
vercel env add <name> production         # ajouter une env var
```

**Deploy** : auto sur push `main` (Vercel projet `convanalyzer`).

## Workflow Git — TOUJOURS dans le main worktree

**Le main worktree est `C:\Users\julie\convanalyzer\` (Windows) / `/c/Users/julie/convanalyzer` (bash).**

Si la session Claude Code démarre dans `.claude/worktrees/<name>/` (comportement par défaut), **NE PAS** y faire d'edits, builds, ou commits. **Tout doit se passer dans le main worktree.**

Règle opérationnelle :

- **Chaque Bash call qui fait `npm`, `git`, `find .next/`, ou touche des artefacts du repo DOIT commencer par `cd /c/Users/julie/convanalyzer && ...`**
- Le shell cwd peut se reset entre les calls (notamment après un system reminder). Ne jamais assumer qu'on reste dans le main — toujours `cd` explicite.
- **Symptôme de bug si on oublie :** un `npm run build` lancé depuis le worktree utilise un `next.config.mjs` ancien et génère un bundle régressé. Si une régression apparaît mystérieusement, première chose à vérifier : `pwd` est bien `/c/Users/julie/convanalyzer`.
- Pour les Edit/Read/Write : utiliser des chemins absolus `C:\Users\julie\convanalyzer\...`.

## Règles spécifiques au projet

- **UI 100 % française** dans les strings affichées. Code sans accents (`Personnalise`, `Frustre` dans le source). Cf. conventions dans `documentation.md`.
- **Ne jamais mentionner UChat dans l'UI** — toujours "Powered by MessagingMe".
- **Ingest actuellement OFF** (`INGEST_ENABLED=false` sur Vercel) à cause de la pression storage Supabase free tier. Voir `documentation.md` § 9 pour le playbook de réactivation.
- **`maxDuration = 60s`** sur `/api/cron/analyze` (limite hobby plan).
- **Migrations SQL** appliquées **manuellement** via SQL Editor Supabase (pas de CLI push automatique).
