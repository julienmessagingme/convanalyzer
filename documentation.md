# Documentation technique — ConvAnalyzer

> Document de référence technique : architecture, stack, schéma DB, déploiement, patterns de code.
> Pour la vue produit, voir `features.md`. Pour le WIP, voir `wip.md`.

## 1. Architecture globale

Application multi-tenant déployée sur 3 surfaces :

```
┌──────────────────────┐    ┌──────────────────────┐    ┌──────────────────────┐
│   VPS OVH            │    │   Vercel             │    │   Supabase           │
│   146.59.233.252     │    │   region cdg1        │    │   region eu-west-1   │
│                      │    │                      │    │                      │
│   Nginx Proxy        │───▶│   Next.js 14         │───▶│   Postgres + RPC     │
│   Manager (Docker)   │    │   App Router         │    │   PostgREST (REST)   │
│                      │    │   Edge middleware    │    │                      │
│   - Reverse proxy    │    │   + Node Lambdas     │    │   ~373 MB / 500 MB   │
│   - SSO auth_request │    │                      │    │   (free tier)        │
└──────────────────────┘    └──────────────────────┘    └──────────────────────┘
         ▲                            ▲                            ▲
         │                            │                            │
         └─ Cloudflare DNS            └─ Auto-deploy push main     └─ Service-role key
            <client>.messagingme.app     GitHub: julienmessagingme    server-side only
                                         /convanalyzer
```

### Rôles

- **Vercel** : runtime de l'app. Lambdas en `cdg1` (Paris) → ~5ms RTT vers Supabase EU. Edge middleware pour auth gating.
- **Supabase** : Postgres + PostgREST (les clients JS Supabase tapent en HTTPS sur PostgREST, pas en TCP direct sur port 5432). Pas de pooling Supavisor nécessaire dans cette archi.
- **VPS OVH** : héberge **uniquement Nginx Proxy Manager** pour l'auth SSO `auth_request`. L'app Next.js elle-même tourne **sur Vercel**, pas sur le VPS. Ne **JAMAIS** redémarrer le container `mieuxassure-analyze-analyze-1` (port 3003, Exited, conservé pour rollback).
  - Container `mieuxassure` (port 3001) = site principal client → **NE JAMAIS TOUCHER**.
  - Reload NPM après modif config :
    ```bash
    sudo docker exec mcp-robot_nginx-proxy-manager_1 nginx -t \
      && sudo docker exec mcp-robot_nginx-proxy-manager_1 nginx -s reload
    ```

### URLs

- **Prod** : <https://convanalyzer.messagingme.app/analyze>
- **Dev** : `npm run dev` → <http://localhost:3000/analyze>
- **GitHub** : <https://github.com/julienmessagingme/convanalyzer>
- **Vercel** : projet `convanalyzer` (id `prj_dMVtiS3WxWuKHik4DIrLkxQdD8fx`), team `julien-dumas-projects`

Le `basePath` est `/analyze` (configuré dans `next.config.mjs`). Toutes les routes commencent par ce prefix.

---

## 2. Stack technique

| Couche | Choix | Notes |
|--------|-------|-------|
| Framework | Next.js 14.2.35 (App Router) | Server Components par défaut |
| Runtime | React 18 | Pas encore React 19 |
| Node | 24.x sur Vercel | définit dans projet Vercel |
| Hébergement | Vercel hobby plan | Lambdas région `cdg1` |
| DB | Supabase (Postgres 17.6) | EU `eu-west-1`, free tier 0.5 GB |
| Client DB | `@supabase/supabase-js` v2 | REST/HTTPS (PostgREST), service-role bypass RLS |
| Auth | `jose` (JWT HS256, Edge-safe) + `bcryptjs` (Node only) | Cookie `ca_session` |
| LLM | OpenAI `gpt-4o-mini` + `text-embedding-3-small` | scoring, classification, suggestions, embeddings |
| Validation | `zod` v4 | webhook payloads + parsers |
| UI | Tailwind CSS 3.4 | + globals.css minimal |
| Charts | Recharts 3.8 | lazy-loaded via `next/dynamic` |
| Icons | `lucide-react` | dans `optimizePackageImports` |
| Date | `date-fns` v4 (locale `fr`) | dans `optimizePackageImports` |
| PDF | `jspdf` + `jspdf-autotable` | client-only, dynamic import, server externals |
| Font | Geist Sans + Mono (local) | `next/font/local` |

### Dépendances dev notables

- `supabase` CLI v2.79 (migrations locales)
- `eslint-config-next`
- TypeScript 5

---

## 3. Auth multi-tenant

Une seule app Vercel, accessible depuis 2 types de hostnames.

### 3.1 Mode admin — `convanalyzer.messagingme.app`

- Login `/login` : email + password.
- `bcrypt.compare` contre `users.password_hash` dans `/api/auth/login` (Node runtime).
- Cookie `ca_session` JWT HS256 signé avec `AUTH_SECRET` (TTL 7 jours).
- Rôle `admin` : voit tous les workspaces.
- Seed admin : `julien@messagingme.fr` (cf. migration `008_auth.sql`).

### 3.2 Mode SSO — `<client>.messagingme.app/analyze`

Pas de login UI. SSO transparent via reverse proxy Nginx `auth_request` sur le VPS.

**Flux complet** :

1. User déjà authentifié sur `<client>.messagingme.app` (cookie `connect.sid` typiquement, dépend du site client).
2. User navigue vers `<client>.messagingme.app/analyze`.
3. Nginx (sur VPS) intercepte la requête, lance un sub-request vers `/_analyze_auth` (internal location).
4. `/_analyze_auth` proxy vers `http://<client-container>:3000/api/auth/me` avec le cookie de l'user.
5. Si 200 : Nginx récupère les headers `X-User-Id`, `X-User-Email`, `X-User-Role` du sub-request, et **injecte** dans la requête forwardée vers Vercel : `X-Proxy-Secret`, `X-User-Id`, `X-User-Email`, `X-User-Role`, `X-Client-Hostname`.
6. Sur Vercel, le **middleware Edge** (`src/middleware.ts`) :
   - Valide `X-Proxy-Secret` contre `PROXY_AUTH_SECRET`.
   - Mint un JWT SSO (TTL 1h) avec `userId='sso:<host>:<external_id>'`, `email`, `role='client'`, `externalHostname=<host>`.
   - Pose le cookie `ca_session` + injecte un header synthétique `x-ca-session` pour les Server Components de la même requête.
7. Server Components / Route Handlers lisent la session via `getSessionFromMiddlewareHeader()` (3 fallbacks : header middleware → cookie → headers proxy directs).
8. **Premier accès** : `findOrCreateSsoUser()` (`src/lib/auth/session.ts`) crée un shadow user `(external_hostname, external_id)` avec `role='client'` et le mappe au workspace dont `workspaces.hostname` correspond.

### 3.3 Mode restreint (sous-ensemble du SSO)

Pour certains hostnames (actuellement `mieuxassure.messagingme.app`), les sessions `client` voient une UI réduite :
- Sidebar : seul l'item "Dashboard" est cliquable.
- PeriodSelector : seule la période 7j est sélectionnable.
- Pages `/suggestions`, `/analytics`, `/tags`, `/visiteurs`, `/iterations`, `/thematiques` retournent `<ForbiddenPage>`.

**Implémentation** : `isRestrictedSession()` dans `src/lib/auth/session.ts` — Set hardcodé `RESTRICTED_SSO_HOSTNAMES = new Set(['mieuxassure.messagingme.app'])`. Les **admins ne sont jamais restreints**, même via un sous-domaine client.

### 3.4 Bugs critiques à se rappeler

- **PostgREST ne supporte pas `ON CONFLICT` sur un index partial** (code `42P10`). `findOrCreateSsoUser` utilise `SELECT-then-INSERT` avec retry sur `23505`, **PAS `.upsert()`**. Cf. commit `cadbf04`.
- **Vercel Edge ne propage pas de façon fiable `NextResponse.next({ request: { headers } })`** vers les Server Components. `getSessionFromMiddlewareHeader` a **3 fallbacks** : header middleware → cookie → proxy headers directs. Cf. commits `66e3bc9`, `65a6bd9`.
- **Vercel réécrit `X-Forwarded-Host`** vers le hostname utilisé pour router sur Vercel (pas le hostname d'origine). On utilise donc un header custom `X-Client-Hostname` qu'aucune plateforme ne strip (Cloudflare, NPM, Vercel le laissent passer). Cf. commit `803341a`.

### 3.5 React.cache sur la session

`getSessionFromMiddlewareHeader` est wrappée avec `React.cache()` pour mémoizer le résultat dans le scope d'un seul render RSC (le layout, la page, et tout sous-component partagent l'appel). Le JWT verify (jose) coûte ~5-10ms ; sans cache on payait ce coût 3-5 fois par render.

---

## 4. Pipeline d'analyse

### 4.1 Trigger

- **Production** : `GET /api/cron/analyze` lancé par Vercel Cron quotidien à `02:00 UTC` (cf. `vercel.json`). Auth Bearer `CRON_SECRET`.
- **Manuel** : `POST /api/cron/analyze` avec header `x-api-key=INTERNAL_API_KEY`.
- `maxDuration = 60s` (limite hobby plan).

### 4.2 Étapes (`src/lib/analysis/pipeline.ts`, fonction `runAnalysisPipeline`)

Séquentielles. Chaque étape a son propre try/catch et n'interrompt pas les suivantes.

| # | Étape | Module | Modèle | Limite/run |
|---|-------|--------|--------|-----------|
| 1 | Embedder | `embedder.ts` | `text-embedding-3-small` | 2000 messages clients pending |
| 2 | Rule Scorer | `rule-scorer.ts` | regex / heuristiques | 500 conversations `scoring_status='pending'` |
| 3 | LLM Scorer | `llm-scorer.ts` | `gpt-4o-mini` | 500 conv rule-scored |
| 4 | Tag Suggester | `tag-suggester.ts` | `gpt-4o-mini` | par workspace, conv 0 tags |
| 5 | Tag Classifier | `tag-classifier.ts` | `gpt-4o-mini` | conv × tags non-testés |
| 6 | KB Suggester | `kb-suggester.ts` | `gpt-4o-mini` | conv high failure_score |

### 4.3 Détails par étape

**Embedder** : embeddings vectoriels sur les messages clients (`messages.embedding`) pour clustering futur + détection répétition client par le rule scorer. Vector(1536). ⚠️ ces embeddings dominent la taille DB (~6 KB chacun + index HNSW ~50-80 MB).

**Rule Scorer** : détecte patterns simples côté code (réponses courtes, répétitions client, agent_takeover). Produit `failure_score` initial.

**LLM Scorer** : appel GPT par paire client-bot pour `failure_score` final + 1 appel global par conversation pour :
- `sentiment_score` : -5 (frustré) à +5 (satisfait), évalué sur la conv entière.
- `urgency_score` : 0 (informationnel) à 5 (churn imminent), même appel.
- **Détection transfert** : patterns regex sur la fin de conversation (collecte d'infos : nom, prénom, adresse, numéro contrat) → `escalated=true`. Les paires de transfert (tail) sont **exclues du scoring qualité**.

**Tag Suggester** : analyse les conversations sans tags et propose de nouveaux tags. **Min 2 conv sans tag** pour déclencher. Ne re-suggère pas un tag existant. Output dans `suggested_tags` (status `pending`).

**Tag Classifier** : affecte les tags valides (manuels + acceptés) aux conversations. **Confiance min 0.8** (strict). **Max 2 tags/conv**. Quand un nouveau tag est créé, **toutes** les conversations sont re-testées contre lui. Sinon, chaque conv est testée seulement contre les tags pas encore évalués pour elle.

**KB Suggester** : génère des suggestions FAQ depuis les conv à `failure_score` élevé. Output dans `kb_suggestions` (question, réponse recommandée, impact_score, frequency).

### 4.4 Tolérance aux pannes

Chaque étape capture ses erreurs dans un array `errors[]`. Le résultat retourne un `PipelineResult` avec `processed` per step + `errors[]`. Pas de retry automatique — si une étape fail, elle re-tournera la prochaine nuit.

---

## 5. Webhook ingest

### 5.1 `POST /api/ingest`

- Auth : header `x-api-key` valide contre `INTERNAL_API_KEY`.
- Body validé via Zod (`webhookPayloadSchema`).

**Champs obligatoires** :
- `workspace_id` (uuid)
- `external_id` (string, unique par workspace)
- `client_id` (string, identifiant unique du contact)
- `messages` (array — un des 3 formats)

**Champ optionnel** :
- `conversation_type` ("agent" | "bot") — détermine le type s'il est explicite, sinon dérivé du format.

### 5.2 Détection format (`src/lib/parsers/detect.ts`)

| Format | Détection | Fichier parser |
|--------|-----------|----------------|
| **A** (legacy) | paires `["Sent", {obj}]` alternées | `format-a.ts` |
| **B** | objects avec champ `role` | `format-b.ts` |
| **C** (UChat réel) | objects avec `type` + `text` | `format-c.ts` |

Tous les parsers normalisent vers une structure canonique `NormalizedMessage[]` puis `normalizedToMessageRow` produit les rows à insérer.

### 5.3 Comportement

- Vérifie l'existence du workspace (`SELECT id FROM workspaces WHERE id = ?`).
- Upsert conversation avec `onConflict: 'workspace_id,external_id', ignoreDuplicates: true` → empty array si duplicate.
- Si nouveau : extrait `started_at`/`ended_at` des timestamps des messages, stocke `raw_payload` (le JSON brut), insert messages en batch.
- Si duplicate : retourne `{conversation_id, message_count, type, duplicate: true}` (look-up de l'existant).
- Marque `scoring_status='pending'` pour la pipeline d'analyse.

### 5.4 Kill-switch

```ts
if (process.env.INGEST_ENABLED === "false") {
  return NextResponse.json({ ok: true, skipped: "ingest_disabled" });
}
```

Permet de couper l'ingest sans casser le sender (HTTP 200 retourné). Voir section 9 pour la stratégie storage.

⚠️ **Ne jamais mentionner UChat dans l'UI** — toujours "Powered by MessagingMe".

---

## 6. Schéma de données (Supabase)

### 6.1 Tables principales

```
workspaces
  id              uuid PK
  name            text
  hostname        text  -- mapping SSO → workspace
  is_active       bool

users
  id                  uuid PK
  email               text
  password_hash       text       -- bcrypt, NULL pour SSO
  role                text       -- 'admin' | 'client'
  auth_type           text       -- 'local' | 'sso'
  external_hostname   text       -- pour SSO, NULL pour local
  external_id         text       -- pour SSO
  -- contraintes : index partial unique (external_hostname, external_id)
  --                WHERE external_hostname IS NOT NULL

user_workspaces (join admin → workspaces)
  user_id         uuid
  workspace_id    uuid

conversations
  id                  uuid PK
  workspace_id        uuid FK
  external_id         text       -- unique par workspace
  client_id           text       -- identifiant contact (pour visiteurs récurrents)
  type                text       -- 'bot' | 'agent'
  escalated           bool
  failure_score       numeric
  sentiment_score     int        -- -5 .. +5
  urgency_score       int        -- 0 .. 5
  scoring_status      text       -- 'pending' | 'scored' | ...
  message_count       int
  started_at          timestamptz
  ended_at            timestamptz
  raw_payload         jsonb      -- payload webhook brut (audit)
  agent_id            text       -- si type=agent
  created_at          timestamptz default now()
  -- UNIQUE(workspace_id, external_id)

messages
  id                  uuid PK
  conversation_id     uuid FK
  workspace_id        uuid FK
  sender_type         text       -- 'client' | 'bot' | 'agent'
  content             text
  sequence            int
  timestamp           timestamptz
  embedding           vector(1536)  -- text-embedding-3-small

tags
  id                  uuid PK
  workspace_id        uuid FK
  label               text
  description         text
  kind                text       -- 'human' (créé user) ou inféré depuis suggested
  conversation_count  int        -- denormalized

conversation_tags
  conversation_id     uuid FK
  tag_id              uuid FK
  assigned_by         text       -- 'human' | 'ai'
  confidence          numeric    -- 0..1, NULL si human

suggested_tags
  id                          uuid PK
  workspace_id                uuid FK
  label                       text
  description                 text
  source_conversation_count   int
  status                      text  -- 'pending' | 'accepted' | 'rejected'

kb_suggestions
  -- voir migration 013_restore_kb_suggestions.sql
  -- généré par KB suggester depuis les conv high failure_score
```

### 6.2 RPCs (fonctions Postgres)

- `get_dashboard_metrics(workspace_id, date_from, date_to)` — 4 COUNT FILTER en une query (cf. migration `014`).
- `get_visitor_stats(workspace_id)` — agrégation visiteurs récurrents (cf. migration `011`).
- `match_similar_messages(query_embedding, threshold, count, workspace_id)` — vector search via index HNSW.

### 6.3 Index notables

- `idx_conversations_workspace_type_created` (composite, migration `014`) — couvre les 4 COUNT FILTER + filtres `/conversations`.
- `idx_conversations_workspace_client` (partial WHERE `client_id IS NOT NULL`) — visiteurs.
- `idx_messages_conv_sequence` — évite sort en mémoire pour conv longues.
- HNSW sur `messages.embedding` — semantic search (~50-80 MB).

### 6.4 Migrations

Dossier `supabase/migrations/`, format `NNN_description.sql`. À appliquer manuellement via SQL Editor Supabase (le projet n'utilise pas la CLI Supabase pour push automatique).

---

## 7. Variables d'environnement

| Variable | Côté | Usage |
|----------|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | URL projet Supabase (REST) |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | bypass RLS, queries admin |
| `OPENAI_API_KEY` | server only | scoring, embeddings |
| `INTERNAL_API_KEY` | server only | auth webhook ingest |
| `NEXT_PUBLIC_INTERNAL_API_KEY` | client | utilisé pour les actions UI nécessitant l'API key (ex: assigner tag) |
| `AUTH_SECRET` | server (Edge + Node) | JWT HS256 signing key (64 chars hex) |
| `PROXY_AUTH_SECRET` | server (Edge) | shared secret nginx ↔ Vercel |
| `ADMIN_HOSTNAME` | server | `convanalyzer.messagingme.app` |
| `CRON_SECRET` | server | Bearer auth Vercel cron `/api/cron/analyze` |
| `INGEST_ENABLED` | server | kill-switch ingest, `'false'` désactive |
| `NEXT_PUBLIC_BASE_PATH` | client + server | `/analyze` |

**Récup local** : `vercel env pull .env.vercel`.
**Ajouter** : `vercel env add <name> production`.
**Reload après modif `.env.local`** : restart `npm run dev` (Next.js lit au démarrage).

---

## 8. Conventions de code

- **Server Components par défaut**. `"use client"` uniquement quand interactivité (hooks, listeners, `useState`).
- **UI en français, code sans accents** : `Personnalise` dans le code, "Personnalisé" dans les strings affichées (à corriger côté display si pas déjà fait).
- **Supabase service client direct** depuis les Route Handlers et Server Components. Pas de DAL pour les queries dashboard. `createServiceClient()` est singleton module-scope.
- **URL search params pour l'état des filtres** quand server-side. Côté client, sync via `window.history.replaceState` pour deep-linking sans re-render.
- **`Array.from()` pour itérer Set/Map** (pas de `downlevelIteration` activé).
- **Placeholder text** : `placeholder:text-gray-500` + override global dans `globals.css`.
- **`dateTo` dans les queries** : toujours `${dateTo}T23:59:59` pour inclure toute la journée.

### 8.1 Patterns spécifiques

- **RPC fallback pattern** (cf. `getWorkspaceMetrics` dans `src/lib/supabase/queries.ts`) : tente le RPC d'abord, retombe sur la version legacy en cas d'erreur (utile pour rollouts où la migration SQL est appliquée après le code).
- **AbortController dans les useEffect data-fetch** (cf. `dashboard-client.tsx`) : évite les state stale quand l'user change de filtre rapidement.
- **`React.cache()` sur les helpers de session** : dédup per-render.
- **Dynamic imports pour les modules lourds côté client** : `next/dynamic({ ssr: false })` pour Recharts, `await import("jspdf")` pour PDF.
- **Webpack server externals** dans `next.config.mjs` pour jspdf : empêche webpack de bundler 880 KB inutiles côté serveur.
- **Cache-Control sur les API routes** : `private, max-age=30, stale-while-revalidate=120` sur les endpoints workspace-scoped.

---

## 9. Storage Supabase — budget free tier

**État au 2026-04-11** : DB à **373 MB / 500 MB**. Ingest **coupé** (`INGEST_ENABLED=false`).

**Budget** : ~1000 conv/jour quand l'ingest est ON → la DB remonte à 500 MB en ~4-5 mois.

### Playbook réactivation ingest

1. Vercel env vars : passer `INGEST_ENABLED` à `true` (ou supprimer la var) + **Redeploy** (Next.js lit au build).
2. Reminder mensuel pour contrôler la taille :
   ```sql
   SELECT pg_size_pretty(pg_database_size('postgres'));
   ```
3. Quand > 450 MB, relancer le pattern de migration `010` :
   - Cutoff 10 % + `raw_payload = NULL` sur les vieux rows.
   - `VACUUM FULL` hors transaction.
   - `ALTER ROLE postgres SET statement_timeout = '10min'` pour éviter le timeout SQL Editor.
4. Alternative : upgrader Supabase **Pro ($25/mois, 8 GB)** et supprimer le kill-switch.

### Ce qui bouffe la place

- Embeddings `vector(1536)` (~6 KB chacun) sur `messages` dominent.
- Index HNSW : ~50-80 MB.
- **Option nucléaire** pour re-gagner ~250 MB : nullifier les embeddings anciens + drop/recréer l'index HNSW. ⚠️ casse la détection `client_repetition` du rule-scorer + le futur clustering.

---

## 10. Onboarder un nouveau client

Exemple : `acme.messagingme.app`.

### Étape 1 — DB

```sql
-- Nouveau workspace
INSERT INTO workspaces (id, name, hostname, is_active)
VALUES ('<workspace_id>', 'Acme', 'acme.messagingme.app', true);

-- OU si workspace existe déjà
UPDATE workspaces SET hostname = 'acme.messagingme.app' WHERE id = '<workspace_id>';
```

### Étape 2 — Côté site client

Déployer un endpoint `GET /api/auth/me` qui :
- Lit le cookie de session (ex `connect.sid`).
- Si valide : retourne 200 avec headers `X-User-Id`, `X-User-Email`, `X-User-Role`.
- Sinon : 401.

### Étape 3 — VPS NPM

Ajouter un proxy host pour `acme.messagingme.app` :
- Copier la structure de `/root/mcp-robot/data/nginx/proxy_host/5.conf` (le bloc `mieuxassure.messagingme.app`).
- Remplacer `server_name`, le `proxy_pass` du bloc `/_analyze_auth` par `http://acme:3000/api/auth/me`, et `X-Client-Hostname` par `acme.messagingme.app`.
- Les 3 autres blocs (`/analyze`, `/analyze/api/ingest`, `/analyze/api/cron/analyze`) pointent vers Vercel sans changement.
- Reload : `nginx -t && nginx -s reload` (via Docker exec).

### Étape 4 — DNS

CNAME `acme.messagingme.app` → IP VPS (ou vers le proxy existant).

### Étape 5 — Test E2E depuis le VPS

```bash
# login côté acme
curl -c /tmp/acme.txt -X POST https://acme.messagingme.app/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"...","password":"..."}'

# SSO vers analyze
curl -L -b /tmp/acme.txt \
  -w 'HTTP=%{http_code} URL=%{url_effective}\n' \
  https://acme.messagingme.app/analyze
# expect: 200, URL finale /analyze/<workspace_id>
```

### Étape 6 — Sanity check DB

```sql
SELECT * FROM users WHERE external_hostname = 'acme.messagingme.app';
-- doit contenir le shadow user après le 1er visit
```

---

## 11. Performance

### 11.1 Mesures actuelles

- Bundle Lambda dashboard : **447 KB** (était 1.3 MB avant fix jspdf — cf. commit `40a5aaf`).
- TTFB warm : ~130-280 ms.
- TTFB cold : ~1.2 s avant fix bundle, attendu ~400 ms après.
- Région Lambda : `cdg1`, configurée dans **`vercel.json`** (pas dans `next.config.mjs`). Vérifiable côté prod via header `X-Vercel-Id: cdg1::cdg1::...`.

### 11.2 Optimisations en place

- RPC Postgres `get_dashboard_metrics` (1 query au lieu de 4 COUNT).
- Cache-Control `private, max-age=30, stale-while-revalidate=120` sur `/api/dashboard/{metrics,scatter,tags,matrix-search}`.
- Singleton Supabase service client (module-scope cache).
- React.cache sur `getSessionFromMiddlewareHeader`.
- Promise.all session + workspace dans `[workspaceId]/layout.tsx`.
- Lazy imports : Recharts (`next/dynamic`), jspdf (`await import + webpack externals`), OpenAI (`await import` dans `searchConversationsBySemantic`).
- `optimizePackageImports`: `lucide-react`, `date-fns`, `recharts`, `@supabase/supabase-js`.
- `prefetch={false}` sur tous les `<Link>` du sidebar et de l'admin header.

### 11.3 Limites

- Vercel cron `maxDuration = 60s` (hobby plan).
- Vercel hobby plan : 1 region (cdg1 ici).
- Pas de RUM (Vercel Speed Insights) activé pour le moment.

---

## 12. Historique des bugs/regressions notables

- `cadbf04` — PostgREST `42P10` sur upsert avec index partial → SELECT-then-INSERT.
- `66e3bc9`, `65a6bd9` — Edge middleware ne propage pas les headers fiables → 3 fallbacks dans `getSessionFromMiddlewareHeader`.
- `803341a` — Vercel réécrit `X-Forwarded-Host` → utiliser `X-Client-Hostname` custom.
- `9eefba5` — recherche texte trop lâche ("con" matchait "contrat") → ILIKE + word-boundary regex JS.
- `8df148e` — scatter/thematiques ne fetchaient qu'une page → fetch all scored conversations.
- `40a5aaf` — jspdf bundlé serveur (-880 KB après fix).
