# CLAUDE.md — Mieux Assure Analyze

## Supabase storage — free tier budget (0,5 GB)

**État au 2026-04-11** : DB à **373 MB** après cleanup. Ingest **coupé** via `INGEST_ENABLED=false` sur Vercel (check dans `src/app/api/ingest/route.ts`, retourne 200 silencieux).

**Budget** : ~1 000 conv/jour quand l'ingest est ON → la DB remonte à 500 MB en **~4-5 mois**.

**Playbook si on réactive l'ingest** :
1. Sur Vercel → env vars : passer `INGEST_ENABLED` à `true` (ou supprimer la var) + **Redeploy** (Next.js lit au build)
2. Mettre un reminder mensuel pour contrôler la taille via `SELECT pg_size_pretty(pg_database_size('postgres'));`
3. Quand > 450 MB, relancer le pattern de migration 010 (cutoff 10 % + raw_payload NULL + VACUUM FULL hors transaction, `ALTER ROLE postgres SET statement_timeout = '10min'` pour éviter le timeout SQL Editor)
4. Alternative si on veut garder tout l'historique : upgrader Supabase **Pro ($25/mois, 8 GB)** et supprimer le kill-switch

**Ce qui bouffe la place** : les embeddings vector(1536) (~6 KB chacun) sur `messages` dominent la taille. L'index HNSW ajoute ~50-80 MB. Option nucléaire pour re-gagner ~250 MB : nullifier les embeddings anciens + drop/recréer l'index HNSW (casse la détection `client_repetition` du rule-scorer et la future clustering).

## Deployment Rules

- **Prod = Vercel** : https://convanalyzer.messagingme.app/analyze
  - Auto-deploy sur push `main` (projet `convanalyzer`, team `julien-dumas-projects`)
  - GitHub : https://github.com/julienmessagingme/convanalyzer
  - Ne jamais re-deployer en Docker sur le VPS — le container `mieuxassure-analyze-analyze-1` est stoppe (pas supprime, garde pour rollback)
- **Dev** : `npm run dev` sur http://localhost:3000/analyze
- Le basePath est `/analyze` (configure dans next.config.mjs)
- Apres modification de .env.local, il faut restart le dev server (les env vars sont lues au demarrage)
- Env vars Vercel : `vercel env pull .env.vercel` pour recup local, `vercel env add <name> production` pour ajouter

## VPS Info (Nginx Proxy Manager uniquement)

- IP : 146.59.233.252
- Le VPS heberge UNIQUEMENT NPM (reverse proxy) pour l'app analyze — Next.js tourne sur Vercel
- Config NPM : `/root/mcp-robot/data/nginx/proxy_host/5.conf` (backup dans `5.conf.backup`)
- Le container `mieuxassure-analyze-analyze-1` (port 3003) est Exited et conserve pour rollback — NE PAS redemarrer sans raison
- Le container `mieuxassure` (port 3001) heberge le site principal client — NE JAMAIS TOUCHER
- Reload NPM apres modif : `sudo docker exec mcp-robot_nginx-proxy-manager_1 nginx -t && sudo docker exec mcp-robot_nginx-proxy-manager_1 nginx -s reload`

## Multi-tenant auth

L'app est deployee une seule fois sur Vercel mais accessible depuis 2 types de hostnames :

### Admin hostname — convanalyzer.messagingme.app
- Login classique email+password a `/login`
- Seed admin : `julien@messagingme.fr` / `Jaus650dl+` (bcrypt dans migration 008_auth.sql)
- Voit tous les workspaces, role `admin`
- Cookie `ca_session` JWT HS256 (TTL 7 jours)

### Client hostname — <client>.messagingme.app/analyze
- Pas de login : SSO via reverse proxy nginx `auth_request` sur le VPS
- Flow :
  1. User deja authentifie sur <client>.messagingme.app (cookie `connect.sid`)
  2. GET /analyze → nginx appelle `/_analyze_auth` (internal) → `http://<client-container>:3000/api/auth/me` avec le cookie
  3. Si 200 : nginx injecte `X-Proxy-Secret`, `X-User-Id`, `X-User-Email`, `X-User-Role`, `X-Client-Hostname` et forward a Vercel
  4. Middleware Vercel valide `X-Proxy-Secret` contre `PROXY_AUTH_SECRET`, lit `X-Client-Hostname` comme hostname d'origine
  5. Server component cree un shadow user `(external_hostname, external_id)` s'il n'existe pas (`findOrCreateSsoUser`)
  6. Shadow user a `role=client`, ne voit QUE le workspace mappe au hostname
- Cookie SSO JWT TTL 1h (re-mint a chaque visite)
- **Important** : `X-Client-Hostname` est un header custom qu'aucune plateforme ne strip (Cloudflare/NPM/Vercel re-ecrivent `X-Forwarded-Host`). Sans lui, Vercel croirait que le hostname est `convanalyzer.messagingme.app`.

### Env vars Vercel critiques
- `PROXY_AUTH_SECRET` — shared secret nginx ↔ Vercel
- `AUTH_SECRET` — JWT HS256 signing key (64 chars)
- `ADMIN_HOSTNAME` — `convanalyzer.messagingme.app`
- `INTERNAL_API_KEY` — webhook ingest (transparent aux clients UChat)
- `OPENAI_API_KEY`, `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`

### Bugs critiques a se rappeler
- **PostgREST ne supporte pas ON CONFLICT sur un index partial** (code `42P10`). `findOrCreateSsoUser` utilise SELECT-then-INSERT avec retry sur `23505`, pas `.upsert()`. Cf commit `cadbf04`.
- **Vercel Edge ne propage pas de facon fiable `NextResponse.next({request:{headers}})`** vers les server components. `getSessionFromMiddlewareHeader` a 3 fallbacks : header middleware → cookie → proxy headers directs. Cf commits `66e3bc9`, `65a6bd9`.
- **Vercel re-ecrit `X-Forwarded-Host`** vers le hostname utilise pour router sur Vercel. Utiliser `X-Client-Hostname` custom. Cf commit `803341a`.

## Onboarder un nouveau client (ex : `acme.messagingme.app`)

1. **DB — creer le workspace + mapping hostname**
   ```sql
   INSERT INTO workspaces (id, name, hostname, is_active)
   VALUES ('<workspace_id>', 'Acme', 'acme.messagingme.app', true);
   ```
   Ou si le workspace existe deja :
   ```sql
   UPDATE workspaces SET hostname = 'acme.messagingme.app' WHERE id = '<workspace_id>';
   ```

2. **Cote client (site acme)** — deployer un endpoint `GET /api/auth/me` qui :
   - Lit le cookie de session (ex `connect.sid`)
   - Si valide, retourne 200 avec headers `X-User-Id`, `X-User-Email`, `X-User-Role`
   - Sinon 401

3. **VPS NPM** — ajouter un proxy host pour `acme.messagingme.app` :
   - Copier la structure de `/root/mcp-robot/data/nginx/proxy_host/5.conf` (le bloc `mieuxassure.messagingme.app`)
   - Remplacer le `server_name`, le `proxy_pass` du bloc `/_analyze_auth` par `http://acme:3000/api/auth/me`, et le `X-Client-Hostname` par `acme.messagingme.app`
   - Les 3 autres blocs (`/analyze`, `/analyze/api/ingest`, `/analyze/api/cron/analyze`) pointent tous vers Vercel sans changement
   - `nginx -t && nginx -s reload`

4. **DNS** — CNAME `acme.messagingme.app` → IP VPS (ou vers le proxy existant)

5. **Test E2E depuis le VPS** :
   ```bash
   # login cote acme
   curl -c /tmp/acme.txt -X POST https://acme.messagingme.app/api/auth/login -H 'Content-Type: application/json' -d '{"email":"...","password":"..."}'
   # SSO
   curl -L -b /tmp/acme.txt -w 'HTTP=%{http_code} URL=%{url_effective}\n' https://acme.messagingme.app/analyze
   # expect 200, URL finale /analyze/<workspace_id>
   ```

6. **Sanity check en DB** : `SELECT * FROM users WHERE external_hostname='acme.messagingme.app';` devrait contenir le shadow user apres le 1er visit.

## Stack

- Next.js 14 (App Router, Server Components)
- Supabase (PostgreSQL + service role client)
- OpenAI gpt-4o-mini (scoring, sentiment, urgence, classification tags)
- Recharts (graphiques dashboard, scatter plots)
- Tailwind CSS
- Docker (standalone output, node:20-slim)

## Architecture

### Webhook Ingest
- Endpoint : POST /api/ingest
- Auth : header `x-api-key` valide contre INTERNAL_API_KEY
- 3 formats de messages supportes :
  - Format A (legacy) : ["Sent", {obj}] alternating pairs
  - Format B : [{role: "user"/"assistant", content}] (OpenAI style)
  - Format C (UChat reel) : [{type, text, time, agent_id?, url?}] — detecte par `type` + `text`
- Le champ `conversation_type` ("bot" ou "agent") dans le body determine le type
- Ne JAMAIS mentionner UChat dans l'UI — toujours "Powered by MessagingMe"

### Pipeline d'analyse (POST /api/cron/analyze)
1. **Embeddings** : text-embedding-3-small sur messages clients (pour futur clustering)
2. **Rule scoring** : detection patterns (reponses courtes, repetitions client)
3. **LLM scoring** : par paire client-bot + sentiment global + urgence globale
   - Sentiment : -5 (frustre) a +5 (satisfait) — evalue sur la conversation entiere, pas par paire
   - Urgence : 0 (informationnel) a 5 (churn imminent) — meme appel que sentiment
   - Detection transfert : patterns regex (collecte informations, numero contrat, nom, prenom, adresse)
   - Les paires de transfert (tail) sont exclues du scoring qualite
4. **Tag suggestions** : GPT analyse conversations NON taguees (0 tags) et propose des tags
   - Minimum 2 conversations sans tag pour declencher
   - Ne re-suggere pas des tags qui existent deja
5. **Tag classification** : affecte les tags valides (manuels + acceptes) aux conversations
   - Confiance minimum 0.8 (strict)
   - Maximum 2 tags par conversation
   - Quand un nouveau tag est cree, TOUTES les conversations sont re-testees contre ce tag
   - Le classifier teste chaque conversation uniquement contre les tags pas encore testes

### Tags
- 2 sources : manuels (crees par l'utilisateur) et acceptes (depuis suggestions IA)
- Les deux sont dans la meme table `tags`
- Max 2 tags par conversation
- Quand on cree/accepte un tag, proposer d'analyser les conversations existantes
- Detection de similarite avant creation (mots en commun, inclusion)

### Dashboard
- 4 KPI cards : Conv IA, Transferees (%), Conv agent, Total
- Le taux de transfert = conversations bot avec escalated=true / total conversations bot
- Graphe tendances (conversations + echecs par jour/semaine/mois)
- Tag cloud cliquable (filtre vers page conversations)
- Matrice conversations : scatter X=urgence Y=sentiment, 4 quadrants (Danger/Opportunite/Bruit/Routine)
  - Points de taille proportionnelle au nombre de messages
  - Filtrable par tag
  - Cliquable vers detail conversation
- Matrice par theme : scatter avec 1 bulle = 1 tag, position = moyenne des conversations

### Conversations
- Sous-tabs : "Conversations IA" (type=bot) et "Conversations avec humain" (type=agent)
- Filtres : date, score, tag (URL search params, server-side)
- Bouton + sur chaque card pour assigner un tag rapidement
- Page detail : messages, tags assignables, export PDF

## Conventions

- UI en francais (pas d'accents dans le code, accents dans les strings affichees)
- Supabase service client direct (pas de DAL pour les queries dashboard)
- URL search params pour l'etat des filtres (server-side rendering)
- `Array.from()` pour iterer Set/Map (pas de downlevelIteration)
- Server Components par defaut, "use client" uniquement quand necessaire (hooks, interactivite)
- Placeholder text : `placeholder:text-gray-500` + global CSS override pour consistance
- dateTo dans les queries : toujours ajouter `T23:59:59` pour inclure toute la journee

## Base de donnees (Supabase)

### Tables principales
- `workspaces` : id, name
- `conversations` : id, workspace_id, external_id, client_id, type (bot/agent), escalated, failure_score, sentiment_score, urgency_score, scoring_status, message_count, started_at, ended_at
- `messages` : id, conversation_id, workspace_id, sender_type (client/bot/agent), content, sequence, embedding
- `tags` : id, workspace_id, label, description, kind (human), conversation_count
- `conversation_tags` : conversation_id, tag_id, assigned_by (human/ai), confidence
- `suggested_tags` : id, workspace_id, label, description, source_conversation_count, status (pending/accepted/rejected)
- `kb_suggestions` : ancien systeme, peut etre supprime
