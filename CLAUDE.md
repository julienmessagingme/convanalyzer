# CLAUDE.md — Mieux Assure Analyze

## Deployment Rules

- **LOCAL ONLY** : Ne jamais deployer sur le VPS sauf si l'utilisateur le demande explicitement.
- Dev server local : `npm run dev` sur http://localhost:3000/analyze
- Le basePath est `/analyze` (configure dans next.config.mjs)
- Apres modification de .env.local, il faut restart le dev server (les env vars sont lues au demarrage)

## VPS Info (pour reference, NE PAS DEPLOYER sans demande explicite)

- IP : 146.59.233.252
- Container : mieuxassure-analyze sur port 3003
- URL prod : https://mieuxassure.messagingme.app/analyze
- Nginx Proxy Manager : config dans /data/nginx/proxy_host/5.conf
- docker-compose.yml : port 3003:3000 (PAS 3000, deja pris par keolis)

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
