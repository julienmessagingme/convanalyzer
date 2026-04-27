# Features — ConvAnalyzer (Mieux Assure Analyze)

> Document de référence des fonctionnalités de l'app, à jour au commit `01b7d3d`.
> Pour la stack, l'architecture et le déploiement, voir `documentation.md`.

## Vue d'ensemble

ConvAnalyzer est un outil d'analyse sémantique de conversations (WhatsApp / chatbot UChat) destiné aux équipes support et marketing. Il ingère des conversations via webhook, les enrichit automatiquement la nuit (sentiment, urgence, échec, tags), et expose plusieurs vues d'analyse pour identifier les frictions client, les sujets récurrents, et les visiteurs à risque.

**Modèle multi-tenant** : une seule instance Vercel sert plusieurs clients, chacun isolé par un `workspace_id`. Les clients voient uniquement leur workspace ; les admins voient tout.

**Production** : <https://convanalyzer.messagingme.app/analyze> — auto-deploy depuis `main` sur Vercel.

---

## 1. Authentification & accès

### 1.1 Mode admin (login email + password)

- Hostname : `convanalyzer.messagingme.app`
- Page de login `/login` : email + password, comparaison bcrypt contre `users.password_hash`.
- Cookie `ca_session` JWT HS256, TTL 7 jours.
- Rôle `admin` : voit **tous les workspaces**, peut switcher via "Changer de workspace" dans la sidebar.
- Compte seed : `julien@messagingme.fr` (cf. migration `008_auth.sql`).

**Fichiers** : `src/app/login/page.tsx`, `src/app/api/auth/login/route.ts`, `src/lib/auth/session.ts`.

### 1.2 Mode SSO (clients via reverse proxy)

- Hostname : `<client>.messagingme.app/analyze` (ex. `mieuxassure.messagingme.app`).
- Pas de login : SSO via `auth_request` Nginx sur le VPS.
- Le proxy injecte `X-Proxy-Secret`, `X-User-Id`, `X-User-Email`, `X-User-Role`, `X-Client-Hostname`.
- Le middleware Edge valide le secret puis mint un JWT SSO TTL 1h, posé en cookie + en header synthétique `x-ca-session` pour les Server Components.
- Premier accès : `findOrCreateSsoUser` crée un shadow user `(external_hostname, external_id)` avec `role=client` et le mappe au workspace dont le `hostname` correspond.

**Fichiers** : `src/middleware.ts`, `src/lib/auth/session.ts` (`findOrCreateSsoUser`, `getSessionFromMiddlewareHeader`).

### 1.3 Mode restreint (sous-ensemble de SSO)

Pour certains hostnames clients (actuellement uniquement `mieuxassure.messagingme.app`), le rôle `client` voit une UI réduite :

- Seul l'onglet **Dashboard** est cliquable dans la sidebar (les 8 autres sont grisés avec tooltip "Non disponible dans votre offre").
- Seule la période **7 jours** est sélectionnable dans le PeriodSelector.
- Pages `/suggestions`, `/analytics`, `/tags`, `/visiteurs`, `/iterations`, `/thematiques` retournent un `<ForbiddenPage>` si l'user ouvre directement l'URL.

**Implémentation** : `isRestrictedSession()` dans `src/lib/auth/session.ts` — Set hardcodé `RESTRICTED_SSO_HOSTNAMES`. Les admins ne sont **jamais** restreints, même quand ils naviguent depuis un sous-domaine client.

---

## 2. Ingestion (webhook)

### 2.1 `POST /api/ingest`

Endpoint d'ingestion publique, protégé par header `x-api-key` valide contre `INTERNAL_API_KEY`.

**Body attendu** :
- `workspace_id` (uuid)
- `external_id` (string, unique par workspace — identifiant côté UChat)
- `client_id` (string — identifiant unique du contact, sert pour les visiteurs récurrents)
- `conversation_type` ("agent" | "bot", optionnel — détermine le type s'il est explicite)
- `messages` : array dans l'un des 3 formats supportés

**3 formats de messages supportés** (auto-détectés via `detectFormat`) :

| Format | Description | Détection |
|--------|-------------|-----------|
| **A** (legacy) | `["Sent", {obj}]` alternés | Pattern de paires |
| **B** | `[{role: "user"\|"assistant", content}]` (style OpenAI) | Champ `role` |
| **C** (UChat réel) | `[{type, text, time, agent_id?, url?}]` | `type` + `text` |

**Comportement** :
- Upsert avec `ON CONFLICT DO NOTHING` sur `(workspace_id, external_id)` → duplicates retournent `{duplicate: true}` sans throw.
- Stocke le payload brut dans `conversations.raw_payload` pour audit.
- Insère les messages en batch dans `messages` avec `sequence`, `sender_type`, `content`.
- Détermine `started_at` / `ended_at` à partir des timestamps des messages.
- Marque la conversation `scoring_status='pending'` pour la pipeline d'analyse.

### 2.2 Kill-switch `INGEST_ENABLED=false`

Quand l'env var `INGEST_ENABLED` est à `false` (cas actuel sur Vercel pour pression storage), le webhook **accepte** la requête (HTTP 200 silencieux) mais skip toute écriture DB. Permet de couper l'ingest sans casser le sender. Voir `documentation.md` § 9 pour le playbook de réactivation.

**Fichiers** : `src/app/api/ingest/route.ts`, `src/lib/parsers/detect.ts`, `src/lib/parsers/format-{a,b,c}.ts`.

---

## 3. Pipeline d'analyse (cron nocturne)

### 3.1 `GET /api/cron/analyze`

- Trigger : Vercel cron quotidien à `02:00 UTC` (cf. `vercel.json`).
- Auth : Bearer `CRON_SECRET`.
- `maxDuration = 60s` (limite hobby plan).
- Manuel : `POST /api/cron/analyze` avec `x-api-key` pour test.

### 3.2 Étapes du pipeline (séquentielles, `runAnalysisPipeline`)

| # | Étape | Quoi | Modèle | Input | Limite |
|---|-------|------|--------|-------|--------|
| 1 | **Embedder** | Embeddings sur les messages clients pour clustering futur + détection répétition | `text-embedding-3-small` | `messages.embedding IS NULL` | 2000/run |
| 2 | **Rule Scorer** | Détection patterns (réponses courtes, répétitions client, agent_takeover) → `failure_score` initial | regex/heuristiques | `scoring_status='pending'` | 500/run |
| 3 | **LLM Scorer** | Sentiment global (-5 frustré → +5 satisfait), urgence globale (0 informationnel → 5 churn imminent), score final qualité par paire client-bot | `gpt-4o-mini` (OpenAI) | conversations rule-scored | 500/run |
| 4 | **Tag Suggester** | GPT analyse les conversations sans tags et propose de nouveaux tags. Min 2 conv sans tag pour déclencher. Ne re-suggère pas un tag existant. | `gpt-4o-mini` | conversations 0 tags | par workspace |
| 5 | **Tag Classifier** | Affecte les tags valides (manuels + acceptés) aux conversations. Confiance min `0.8`. Max 2 tags/conv. Quand un nouveau tag est créé, ré-test toutes les conversations contre ce tag. | `gpt-4o-mini` | conversations × tags non-testés | - |
| 6 | **KB Suggester** | Génère des suggestions FAQ à partir des conversations à `failure_score` élevé (questions client + réponse recommandée + impact_score). | `gpt-4o-mini` | failed conversations | - |

**Détection transfert** (dans LLM Scorer) : patterns regex sur la fin de conversation (collecte d'infos : nom, prénom, adresse, numéro contrat) → marque `escalated=true`. Les paires de transfert (tail) sont **exclues du scoring qualité**.

**Tolérance aux pannes** : chaque étape capture ses erreurs dans un array `errors[]` et n'interrompt pas les étapes suivantes. Le résultat retourne un `PipelineResult` avec `processed` per step + `errors`.

**Fichiers** : `src/app/api/cron/analyze/route.ts`, `src/lib/analysis/pipeline.ts`, `src/lib/analysis/{embedder,rule-scorer,llm-scorer,tag-suggester,tag-classifier,kb-suggester}.ts`.

---

## 4. Dashboard (`/[workspaceId]`)

Vue par défaut, page d'atterrissage après login.

### 4.1 KPI cards (4)

- **Conversations IA** (count `type='bot'`)
- **Transférées à un humain** (count `escalated=true` parmi les bots, + % vs total bots)
- **Conversations agent** (count `type='agent'`)
- **Total conversations**

Filtré par la période sélectionnée. Backed par RPC Postgres `get_dashboard_metrics` (1 query au lieu de 4 COUNT) — cf. migration `014`.

### 4.2 Period selector

Boutons : **7j**, **30j**, **90j**, **Personnalisé** (date pickers from/to). En mode restreint, seul 7j est cliquable.

### 4.3 Tag cloud

Liste des tags du workspace, taille proportionnelle au `conversation_count`. Cliquable → redirige vers `/conversations?tag=<id>`.

### 4.4 Matrice Conversations (heatmap densité)

SVG heatmap 11 × 6 : axe Y = sentiment (-5 à +5), axe X = urgence (0 à 5).

- Couleur : densité (blanc → orange → rouge, échelle log).
- Filtres locaux : type (Toutes / IA / Humain) + recherche mot-clé (texte / sémantique / combinée).
- Tooltip au hover : count + moyenne messages/conv.
- Clic sur une cellule → `/conversations?urgency_score=X&sentiment_score=Y` (filtre matrice transmis).
- 2 quadrants visibles : "Danger" (sentiment ≤ 0 + urgence ≥ 3), "Opportunité" (sentiment > 0 + urgence ≥ 3), "Bruit" (urgence < 3 + sentiment ≤ 0), "Routine" (urgence < 3 + sentiment > 0).

### 4.5 Matrice par Thème

Même heatmap 11 × 6 mais filtrée à 1 tag à la fois (chips de sélection en haut). Permet de voir où chaque thème "vit" sur la grille sentiment/urgence.

### 4.6 Export PDF (Dashboard)

Bouton "Exporter PDF" en haut. Génère un PDF jspdf + jspdf-autotable côté client (lazy import) avec :
- En-tête Mieux Assure (logo + titre + période + date)
- Table KPIs (conversations totales, transférées, taux de transfert)
- Table tags (label + count)

**Fichiers** : `src/app/[workspaceId]/page.tsx`, `src/components/dashboard/*.tsx`, `src/lib/export/pdf-dashboard.ts`.

---

## 5. Conversations (`/[workspaceId]/conversations`)

### 5.1 Tabs bot vs agent

2 tabs avec count par catégorie. URL search param `tab=bot|agent`.

### 5.2 Filtres (FilterBar)

- **Recherche mot-clé** : input + select mode (combiné / texte / sémantique).
- **Date range** : `date_from` / `date_to`.
- **Sentiment** : Frustré (-5 à -1), Neutre (0), Satisfait (+1 à +5).
- **Urgence** : Faible (0-2), Critique (3-5).
- **Transfert** (tab bot uniquement) : Transférées / Non transférées.
- **Tag** : tous les tags du workspace, ou "Non attribué".

Filtres synchronisés à l'URL (deep-linking). Bannière bleue si "filtre matrice actif" (depuis dashboard click), avec bouton "Effacer".

### 5.3 Conversation cards

Layout horizontal compact, 1 ligne par conv :
- Bouton expand (chevron) → charge les messages on-demand via `/api/conversations/[convId]/messages`.
- Type (Bot / Agent) + date.
- Score badge coloré par level (vert / jaune / orange / rouge).
- Codes courts `S:+3` (sentiment) et `U:5/5` (urgence) avec tooltip.
- Match badge si search actif : `texte`, `sémantique`, ou `texte+sem.`.
- Tags assignés (chips verts) + bouton **+** pour assigner un tag rapidement (dropdown des tags non-assignés).
- Count messages + lien `↗` vers `/conversations/[convId]`.

### 5.4 Pagination

20 conversations par page côté serveur (`/api/conversations/list`).

### 5.5 Export CSV

Bouton "Exporter CSV". Colonnes : `created_at`, `topic` (tags joins), `failure_score`, `resume`. Export uniquement de la page courante.

### 5.6 Detail conversation (`/conversations/[convId]`)

Page dédiée avec :
- Tous les messages affichés (MessageBubble client / bot / agent).
- Tags assignables (TagAssignment) avec retrait possible.
- Section "Analyse des échecs" si `failure_score >= 4` (raisons listées).
- Bouton "Exporter PDF" : PDF résumé (pas les messages, choix produit) avec en-tête Mieux Assure, table info, raisons d'échec.

**Fichiers** : `src/app/[workspaceId]/conversations/page.tsx` + `[convId]/page.tsx`, `src/components/conversations/*.tsx`, `src/lib/export/pdf-conversation.ts`.

---

## 6. Visiteurs récurrents (`/[workspaceId]/visiteurs`)

### 6.1 Liste

Visiteurs (= `client_id` distincts) avec **N visites minimum**. Filtre fréquence en chips : Tous, 2+, 3+, 5+, 7+. Pagination 50/page.

Colonnes : Contact (`client_id` mono), Visites, Sentiment moyen (badge), Urgence moyenne (badge), Dernière visite (relative date `il y a X jours`), Première visite.

Backed par RPC Postgres `get_visitor_stats` (cf. migration `011`) qui agrège côté DB plutôt que de paginate côté JS.

### 6.2 Detail visiteur (`/visiteurs/[clientId]`)

- Métriques agrégées : sentiment moyen + **trend** (↑↓→ basé sur les 2 dernières conv scorées, seuil ±0.5), urgence moyenne, failure score moyen, total conversations.
- **Top tags récurrents** (avec count par tag).
- **Historique des conversations** : type, date, message count, badges sentiment/urgence, tags, statut escalation, scoring status. Chaque ligne cliquable vers la conv.

**Fichiers** : `src/app/[workspaceId]/visiteurs/page.tsx` + `[clientId]/page.tsx`, `src/components/visiteurs/*.tsx`.

---

## 7. Recherche (`/[workspaceId]/search`)

Page de recherche dédiée (vs la recherche inline dans `/conversations`).

3 modes :
- **Combinée** (défaut) : texte + sémantique fusionnés.
- **Texte exact** : ILIKE Postgres + filtre word-boundary JS (cf. fix commit `9eefba5` — "con" ne matche plus "contrat").
- **Sémantique** : embedding de la query via `text-embedding-3-small` puis RPC `match_similar_messages` avec seuil 0.7 et top 50.

**Affichage** :
- Résultats groupés par type (bot / agent) avec count par groupe.
- Pour chaque conv : ConversationCard standard + snippet matché (extrait 150 chars du message qui matche) + match type badge.
- Sentiment/urgence moyens par groupe.

URL deep-linking (`?q=...&mode=...`).

**Fichiers** : `src/app/[workspaceId]/search/page.tsx`, `src/components/search/*.tsx`, `src/lib/supabase/search.ts`.

---

## 8. Iterations (`/[workspaceId]/iterations`)

Distribution des conversations par **nombre d'itérations** (= 1 itération = 1 paire message client + réponse bot/agent).

### Vue principale

Table de buckets (1-2, 3-4, 5-6, 7-9, 10-14, 15+ itérations) avec :
- Count de conversations dans le bucket.
- Pourcentage du total.

Stats top-level : total conversations, moyenne d'itérations, total itérations.

### Drill-down

Clic sur un bucket → expand histogrammes sentiment + urgence pour les conversations de ce bucket. Données fetched on-demand par bucket et cachées par fenêtre temporelle.

### Filtres

- Période (PeriodSelector commun).
- Type (bot / agent).

**Fichiers** : `src/app/[workspaceId]/iterations/page.tsx`, `src/components/iterations/*.tsx`.

---

## 9. Thématiques (`/[workspaceId]/thematiques`)

Distribution des **tags** à travers les niveaux de sentiment ou urgence.

- Toggle axe : "Par sentiment" ou "Par urgence".
- Grille de cards : 1 card par bucket (sentiment ou urgence). Chaque card liste les tags présents dans ce bucket avec count + % au sein du bucket.
- Note explicative : les % ne somment pas à 100 % car certaines conv n'ont pas de tag et d'autres en ont jusqu'à 2.
- Clic sur un tag d'une card → drill-down vers les conversations correspondantes.

**Différence avec `/tags`** : `/thematiques` est une vue **read-only de distribution**. `/tags` est la **gestion** des tags.

**Fichiers** : `src/app/[workspaceId]/thematiques/page.tsx`, `src/components/thematiques/*.tsx`.

---

## 10. Suggestions KB (`/[workspaceId]/suggestions`)

Suggestions FAQ générées automatiquement à partir des conversations à fort `failure_score`.

### Affichage

Table avec colonnes :
- **Question** (extraite de la conversation problématique).
- **Réponse recommandée** (générée par GPT).
- **Priorité badge** : High (impact_score ≥ 7), Medium (≥ 4), Low (< 4).
- **Fréquence** (nombre de conversations matchant cette question).
- **Bouton Copier** (copy inline de la réponse).

Tri par `impact_score × frequency` (mixed score).

### Bouton "Générer"

Trigger manuel du KB Suggester (sinon généré nightly par le cron).

**Restriction** : page `Forbidden` pour les sessions SSO restreintes.

**Fichiers** : `src/app/[workspaceId]/suggestions/page.tsx`, `src/components/suggestions/*.tsx`, `src/lib/analysis/kb-suggester.ts`.

---

## 11. Analytics (`/[workspaceId]/analytics`)

Tendances temporelles avec filtre par tags drag-and-drop.

### Composants

- **Période** : date pickers from/to.
- **Toggles** : "Sentiment moyen" + "Urgence moyenne" (overlay lines sur le bar chart).
- **Tags disponibles** (pool) ↔ **Drop zone "Filtrer par tags (condition ET)"** : drag-drop entre les 2 zones. Les tags filtres se cumulent en AND.
- **Stats** : Total conversations, Moyenne / jour, Jours avec données.
- **Chart** : ComposedChart Recharts (Bar pour count + Lines optionnelles pour sentiment/urgence). Lazy-loaded via `next/dynamic` pour exclure recharts du bundle initial de la route.

URL state non-synced (état local React seulement).

**Restriction** : page `Forbidden` pour les sessions SSO restreintes.

**Fichiers** : `src/app/[workspaceId]/analytics/page.tsx`, `src/components/analytics/{analytics-client,analytics-dashboard,analytics-chart}.tsx`.

---

## 12. Tags management (`/[workspaceId]/tags`)

Gestion **du référentiel de tags** d'un workspace (à distinguer de l'assignation conv-par-conv via le bouton + sur les cards).

### Sections

- **Tags humains** (créés par l'utilisateur) : créer, renommer, supprimer.
- **Tags suggérés par IA** (output du Tag Suggester nocturne) : accepter (devient un tag normal puis re-classifié) ou rejeter.

### Détection de similarité avant création

Avant de créer un nouveau tag, le UI vérifie s'il existe déjà un tag similaire (mots en commun, inclusion) pour éviter les doublons.

### Cascade

Quand un tag est créé / accepté, le système propose d'analyser les conversations existantes contre ce nouveau tag (re-trigger du Tag Classifier ciblé).

**Restriction** : page `Forbidden` pour les sessions SSO restreintes.

**Fichiers** : `src/app/[workspaceId]/tags/page.tsx`, `src/components/tags/*.tsx`.

---

## 13. Admin (`/admin`)

Réservé aux comptes `role='admin'` + `auth_type='local'`.

### 13.1 Workspaces (`/admin/workspaces`)

Liste de tous les workspaces avec :
- Nom, hostname SSO (éditable inline via `WorkspaceRow`), user count, conversation count, statut actif.
- Le hostname configuré ici détermine le mapping SSO : un user qui visite `<hostname>/analyze` est auto-créé et routé vers ce workspace.

### 13.2 Users (`/admin/users`)

Liste de tous les users avec :
- Email, role (admin / client), auth_type (local / SSO), external_hostname (si SSO), last_login, created_at.
- Read-only.

**Fichiers** : `src/app/admin/{page,workspaces/page,users/page}.tsx`, `src/components/admin/*.tsx`.

---

## 14. Exports

### 14.1 PDF Dashboard

- Trigger : bouton "Exporter PDF" sur `/[workspaceId]`.
- Lib : `jspdf` + `jspdf-autotable` (chargés dynamiquement côté client).
- Contenu : en-tête logo + titre, période + date, table KPIs, table tags.
- Fichier : `dashboard-report-YYYY-MM-DD.pdf`.

### 14.2 PDF Conversation

- Trigger : bouton "Exporter PDF" sur `/conversations/[convId]`.
- Contenu : en-tête, table info (type, score, date, message count, statut, tags), table raisons d'échec si `failure_score ≥ 4`. **Pas les messages** (choix produit).
- Fichier : `conversation-<id>-summary.pdf`.

### 14.3 CSV Conversations

- Trigger : bouton "Exporter CSV" sur `/conversations`.
- Colonnes : `created_at`, `topic` (tags concaténés), `failure_score`, `resume`.
- Page courante uniquement.

**Fichiers** : `src/lib/export/{pdf-dashboard,pdf-conversation,csv}.ts`, `src/components/export/*.tsx`.

---

## 15. Vocabulaire & branding produit

- **Langue UI** : 100 % français (avec accents dans les strings affichées).
- **Branding** : "Powered by MessagingMe" en bas de sidebar. **Ne jamais mentionner UChat dans l'UI** — toujours "Powered by MessagingMe".
- **Sidebar** : 9 items de navigation + (admin uniquement) "Changer de workspace" + (compte local uniquement) "Se déconnecter". Items grisés en mode restreint avec tooltip "Non disponible dans votre offre".
- **État restreint des liens** : `opacity-50 cursor-not-allowed`, pointer cursor désactivé.
- **Période par défaut** : 30 jours. En mode restreint : forcée à 7 jours.

---

## Liens

- Architecture, stack, schéma DB, déploiement → `documentation.md`
- Travail en cours, idées, refactors envisagés → `wip.md`
- Règles workflow + commandes → `CLAUDE.md`
