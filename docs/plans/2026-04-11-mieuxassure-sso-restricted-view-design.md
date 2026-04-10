# Design — Vue restreinte pour les clients SSO mieuxassure

**Date** : 2026-04-11
**Projet** : conversation-analyzer (Next.js / Vercel, repo `julienmessagingme/convanalyzer`)
**Scope** : uniquement ce projet. `keolis-upload-auxerre` (plateforme Mieux Assuré, code Express) non impacté.

## Objectif

Permettre aux utilisateurs qui arrivent sur le dashboard via le SSO depuis `mieuxassure.messagingme.app` d'accéder uniquement à une vue restreinte :
- Seul le 1er onglet (Dashboard) est accessible
- Seul le bouton de période "7j" est cliquable (tous les autres grisés)
- Les autres onglets sont grisés et non cliquables dans la sidebar
- L'accès direct par URL aux routes restreintes retourne une page 403 propre

Les utilisateurs qui se connectent directement sur `convanalyzer.messagingme.app/analyze` (admin) gardent la vue complète — **garantie absolue**, jamais restreints.

## Règle de restriction

Un helper `isRestrictedSession(session)` dans `src/lib/auth/session.ts` encapsule la règle :

```ts
export function isRestrictedSession(session: Session | null): boolean {
  if (!session) return false;
  if (session.role === "admin") return false;            // admin jamais restreint
  if (!session.externalHostname) return false;           // local client non-SSO non restreint
  return RESTRICTED_SSO_HOSTNAMES.has(session.externalHostname);
}
```

**Garantie admin** : la condition `session.role === "admin"` est prioritaire. Les sessions admin (JWT signé, cookie `ca_session`) ne peuvent pas être downgradées par un header proxy ; `getSessionFromMiddlewareHeader` privilégie le JWT cookie sur les headers proxy. Un admin qui bricolerait des headers ou utiliserait le sous-domaine client garde toujours `role: "admin"` et donc `isRestrictedSession = false`.

## Changements

### Nouveau fichier

- `src/components/ui/forbidden-page.tsx` — composant 403 "Accès non disponible dans votre offre"

### Fichiers modifiés

| Fichier | Changement |
|---|---|
| `src/lib/auth/session.ts` | Export de `isRestrictedSession(session)` + set `RESTRICTED_SSO_HOSTNAMES`. |
| `src/components/layout/sidebar.tsx` | Prop `restrictedMode?: boolean`. Les items autres que "Dashboard" sont rendus comme `<div>` désactivés (`opacity-50 cursor-not-allowed`, tooltip "Non disponible dans votre offre"). |
| `src/components/layout/period-selector.tsx` | Prop `restrictedMode?: boolean`. Force "7j" visuellement sélectionné, boutons 30j/90j/Personnalise `disabled opacity-50`, granularité masquée. |
| `src/app/[workspaceId]/layout.tsx` | Calcule `isRestrictedSession(session)`, passe à `<Sidebar restrictedMode={...}>`. |
| `src/app/[workspaceId]/page.tsx` | Force `period = "7d"` server-side si restricted (searchParams ignorés), passe `restrictedMode` à `<PeriodSelector>`. |
| `src/app/[workspaceId]/conversations/page.tsx` | Gate → `<ForbiddenPage />` |
| `src/app/[workspaceId]/conversations/[convId]/page.tsx` | Idem |
| `src/app/[workspaceId]/search/page.tsx` | Idem |
| `src/app/[workspaceId]/iterations/page.tsx` | Idem |
| `src/app/[workspaceId]/thematiques/page.tsx` | Idem |
| `src/app/[workspaceId]/analytics/page.tsx` | Idem |
| `src/app/[workspaceId]/tags/page.tsx` | Idem |
| `src/app/[workspaceId]/suggestions/page.tsx` | Idem |

## Flux utilisateur

### Admin (connecté direct sur convanalyzer.messagingme.app/analyze)
1. Login local → cookie `ca_session` JWT, `role: admin`, pas de `externalHostname`
2. Navigue sur n'importe quel workspace → `isRestrictedSession = false`
3. Sidebar complète, toutes périodes dispos, toutes routes accessibles
4. **Même si l'admin navigue via mieuxassure.messagingme.app/analyze**, sa session JWT est prioritaire → reste admin → reste non restreint

### Client SSO mieuxassure
1. Arrive sur https://mieuxassure.messagingme.app/analyze
2. NPM auth_request vers plateforme Mieux Assuré → forward avec headers `X-Proxy-Secret`, `X-User-*`, `X-Client-Hostname: mieuxassure.messagingme.app`
3. Middleware Next.js crée ou charge la session shadow SSO → `role: client`, `externalHostname: mieuxassure.messagingme.app`
4. `isRestrictedSession = true`
5. Dashboard s'affiche : sidebar grisée (sauf Dashboard), PeriodSelector bloqué sur 7j
6. Tentatives vers `/conversations`, `/search`, etc. → `ForbiddenPage`
7. URL bookmark `?period=90d` ignorée, serveur force `7d`

## Testing manuel

1. **Admin local** : login sur convanalyzer.messagingme.app/analyze, vérifier sidebar complète et tous les boutons période cliquables
2. **Admin via sous-domaine client** (cas rare mais valide) : naviguer vers mieuxassure.messagingme.app/analyze tout en ayant le cookie admin → doit rester admin et non restreint
3. **Client SSO** : logout admin, arriver sur mieuxassure.messagingme.app/analyze via lien depuis la plateforme Mieux Assuré → vérifier Dashboard seul + 7j seul + autres onglets grisés
4. **Client SSO URL bypass** : ajouter `?period=90d` à l'URL du dashboard → le dashboard doit rester sur 7j
5. **Client SSO route bypass** : taper `/analyze/<workspaceId>/conversations` → doit afficher ForbiddenPage

## Points de vigilance

- **Admin jamais restreint** : garantie #1 du design. Toute PR qui casse cette règle doit être rejetée.
- **Pas de fuite via la sidebar** : si le user arrive à cliquer sur un onglet grisé (impossible par design mais au cas où), la page elle-même le bloque via ForbiddenPage.
- **SSR dynamique** : `getSessionFromMiddlewareHeader` lit `headers()` et `cookies()` qui rendent les pages dynamic — cohérent avec le reste du codebase.
- **Fonte de la feature** : si on veut étendre les restrictions à d'autres clients (ex : donner aussi 30j pour certains tenants), il suffit d'étendre `RESTRICTED_SSO_HOSTNAMES` ou de remplacer le Set par une map de niveaux d'offre.

## Deploy

- `git push origin master` → auto-deploy Vercel (~2-3min)
- Pas de changement d'env vars nécessaire
- `keolis-upload-auxerre` : **non impacté**, ne pas toucher

## Code review

Après implémentation, lancer l'agent `feature-dev:code-reviewer` avec un brief spécifique :
- Garantie admin : vérifier qu'il n'y a aucun chemin qui restreigne un admin
- Complétude : toutes les routes non-Dashboard sont-elles bien gatées ?
- Cohérence SSR : les pages dynamiques restent dynamiques
- UX : tooltips présents, visuels cohérents entre sidebar et period-selector
- Bypass possibles : URL params, headers, cookies
