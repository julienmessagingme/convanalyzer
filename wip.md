# Work in Progress — ConvAnalyzer

> Ce qui est en cours, pas encore live, ou identifié comme à faire.
> Pour l'archi technique, voir `documentation.md`. Pour les features livrées, voir `features.md`.
> Quand une entrée est terminée → la déplacer vers `features.md` ou la supprimer.

## Perf — actions identifiées non encore faites

### 🔴 Scatter agrégation server-side (gros impact, pas attaqué)

Le dashboard fetche TOUTES les conversations scorées du workspace via `/api/dashboard/scatter` (sans filtre date) puis agrège côté JS pour la heatmap 11×6. Sur ~50k conv = **2-10 MB de payload** à chaque load.

**Plan** : RPC Postgres qui retourne 66 cellules pré-agrégées (count + avg messages par paire urgence × sentiment). Refactor `DensityHeatmap` + `TagHeatmap` pour consommer la nouvelle forme.

**Pourquoi pas fait** : refactor de 3 composants UI cliquables (navigation depuis cellule heatmap). Risque medium-high, repoussé.

**Gain estimé** : payload divisé par ~100, first paint scatter -300/500 ms.

### 🟠 SSR initial data du dashboard

Le dashboard fait 3 round-trips séquentiels : HTML → JS bundle → API calls (`/metrics`, `/scatter`, `/tags`). Refactor en pattern hybride : Server Component fetch les données initiales SSR et passe en props ; client-side seulement pour les filtres dynamiques.

**Pourquoi pas fait** : refactor architectural, environ 2h de boulot. Lié au point précédent (la refonte scatter le rendrait plus naturel).

**Gain estimé** : -700 ms first paint cold.

### 🟡 `router.refresh()` dans conversation-card (Lambda invocations)

Chaque assignation de tag via le bouton `+` sur une conversation card déclenche `router.refresh()` → re-fetch RSC complet de la page → +1 invocation Lambda. Pour un user qui tague 20 conv en série = 20 hits Lambda inutiles.

**Plan** : remplacer par mise à jour optimiste locale (déjà en place via `setLocalTags`) + invalidation ciblée via SWR si on l'adopte.

### 🟡 Sortie du tooltip SVG dans DensityHeatmap

Le tooltip est rendu dans le même `<svg>` que la heatmap, donc chaque hover trigger un re-render de tous les ~100 nodes. Extraire dans un `<div>` HTML positionné en absolute, ou utiliser `useDeferredValue`.

**Gain** : hover smoother, perçu fluide.

### 🟡 Adopter SWR / TanStack Query (refactor)

4 composants (`dashboard-client`, `conversations-client`, `visiteurs-client`, `analytics-dashboard`) ré-implémentent manuellement le pattern fetch+abort+loading+URL sync. Migrer vers SWR éliminerait ~150 LoC de boilerplate, ajouterait dedup gratuit, navigation instantanée entre pages déjà visitées.

**Effort** : ~2-3h pour migrer les 4. À faire en plusieurs commits atomiques.

## Audit perf à compléter

### Slow queries Supabase

Pas encore fait : aller sur dashboard Supabase → Reports → Query Performance → onglet "Most Time Consuming" et screenshot le top 10. Probablement des opportunités d'index ou de refactor de queries.

### Real User Monitoring

Activer Vercel Speed Insights (free tier dispo) pour avoir LCP/INP/CLS réels et identifier les vraies pages lentes vues par les users.

### Bundle analyzer

Ajouter `@next/bundle-analyzer` pour visualiser ce qui pèse vraiment dans chaque route et trouver des optims supplémentaires.

## UI/UX flagged dans audit, pas encore fixé

### Accessibilité

- `<html lang="en">` sur l'app 100% française → corriger en `lang="fr"`.
- Labels manquants sur les selects de FilterBar → ajouter `<label className="sr-only">`.
- Focus management après filtre/recherche → reset focus pour screen readers.
- Heatmap SVG sans `role="img"` ni alt-table pour screen readers.

### Design system

- Pas de tokens sémantiques de couleur (vert/rouge/bleu hardcodés partout). Refactor possible mais bas ROI tant qu'on n'a pas besoin de rebrand ou dark mode.
- Dark mode "fantôme" : bloc `prefers-color-scheme: dark` dans globals.css mais aucun composant ne l'utilise → soit supprimer, soit l'implémenter vraiment.

### Codes cryptiques

Conversation cards affichent `S:+3` et `U:5/5` sans label visible. Décodage via `title` (hover only). À remplacer par icônes Lucide `Smile` / `AlertTriangle` + label explicite ou tooltip clic.

## Idées validées non commencées

### Bouton de cleanup storage en self-service

Une page admin avec un bouton "Trim conversations > 6 mois" qui déclenche le pattern de migration `010` (cutoff + raw_payload NULL + VACUUM). Évite d'aller dans le SQL Editor.

### Notifications temps réel

Quand le cron nightly trouve une conv `failure_score >= 4` ou `sentiment <= -3`, envoyer une alerte (email / Slack / webhook). Permettrait au support de réagir avant que le client ne churn.

## Investigations à mener

### Pourquoi `/api/conversations/list` rendait OpenAI au cold start ?

Identifié par sub-agent : import statique de `searchConversations` (qui import statiquement `openai/client`). **Fix posé** dans commit `49dc5f1` (lazy import) — mais le NFT inclut toujours le chunk OpenAI pour cette route. Effet réel sur cold start à valider via curl en mode incognito après quelques min d'inactivité.

### Vérifier que le fix region cdg1 a bien réduit les TTFB Supabase

Avant fix : `cdg1::iad1` (lambda à Washington, ~80 ms RTT vers Supabase EU). Après fix : `cdg1::cdg1` (lambda à Paris, ~5 ms RTT). À mesurer avec un benchmark : ouvrir Network DevTools sur `/conversations` et regarder le TTFB des appels `/api/conversations/list`.
