// Seed agent conversations for testing
const API = "http://localhost:3000/analyze/api/ingest";
const KEY = "mieuxassure-ingest-key-2026";

const convs = [
  {
    workspace_id: "225831",
    external_id: "agent-conv-001",
    client_id: "33612345678",
    messages: [
      "",
      { type: "text", text: "Bonjour, j\u2019ai eu un accident la semaine derni\u00e8re et personne ne m\u2019a rappel\u00e9", time: "2026-03-20T09:15:00+01:00" },
      "Sent",
      { type: "text", text: "Bonjour, je suis d\u00e9sol\u00e9 pour ce d\u00e9lai. Pouvez-vous me donner votre num\u00e9ro de contrat ?", agent_id: 101, time: "2026-03-20T09:16:00+01:00" },
      "",
      { type: "text", text: "C\u2019est le MA-2024-8834. J\u2019ai appel\u00e9 3 fois et on me balade", time: "2026-03-20T09:17:00+01:00" },
      "Sent",
      { type: "text", text: "Je comprends votre frustration. L\u2019expert n\u2019a pas encore \u00e9t\u00e9 mandat\u00e9. Je m\u2019en occupe.", agent_id: 101, time: "2026-03-20T09:18:00+01:00" },
      "",
      { type: "text", text: "\u00c7a fait une semaine ! C\u2019est inacceptable", time: "2026-03-20T09:19:00+01:00" },
      "Sent",
      { type: "text", text: "Vous avez raison. Je mandate l\u2019expert et vous rappelle demain matin.", agent_id: 101, time: "2026-03-20T09:20:00+01:00" },
      "",
      { type: "text", text: "Merci. J\u2019esp\u00e8re que \u00e7a va bouger cette fois.", time: "2026-03-20T09:21:00+01:00" },
    ],
  },
  {
    workspace_id: "225831",
    external_id: "agent-conv-002",
    client_id: "33698765432",
    messages: [
      "",
      { type: "text", text: "Bonjour je voudrais r\u00e9silier mon contrat auto", time: "2026-03-21T14:00:00+01:00" },
      "Sent",
      { type: "text", text: "Quel est le motif de r\u00e9siliation ?", agent_id: 102, time: "2026-03-21T14:01:00+01:00" },
      "",
      { type: "text", text: "J\u2019ai trouv\u00e9 moins cher ailleurs, 40 euros de moins par mois", time: "2026-03-21T14:02:00+01:00" },
      "Sent",
      { type: "text", text: "Je peux vous proposer 85\u20ac au lieu de 120\u20ac. Notre meilleure offre fid\u00e9lit\u00e9.", agent_id: 102, time: "2026-03-21T14:06:00+01:00" },
      "",
      { type: "text", text: "OK \u00e7a me va, on fait \u00e7a", time: "2026-03-21T14:07:00+01:00" },
      "Sent",
      { type: "text", text: "Parfait ! Nouveau contrat par email. Bonne journ\u00e9e !", agent_id: 102, time: "2026-03-21T14:08:00+01:00" },
    ],
  },
  {
    workspace_id: "225831",
    external_id: "agent-conv-003",
    client_id: "33655443322",
    messages: [
      "",
      { type: "text", text: "Est-ce que mon assurance couvre le vol dans la voiture ?", time: "2026-03-22T10:30:00+01:00" },
      "Sent",
      { type: "text", text: "Laissez-moi v\u00e9rifier. Votre num\u00e9ro de contrat ?", agent_id: 101, time: "2026-03-22T10:31:00+01:00" },
      "",
      { type: "text", text: "MA-2025-1122", time: "2026-03-22T10:32:00+01:00" },
      "Sent",
      { type: "text", text: "Formule Confort : vol d\u2019effets personnels couvert jusqu\u2019\u00e0 500\u20ac si effraction.", agent_id: 101, time: "2026-03-22T10:34:00+01:00" },
      "",
      { type: "text", text: "D\u2019accord merci pour l\u2019info", time: "2026-03-22T10:35:00+01:00" },
    ],
  },
  {
    workspace_id: "225831",
    external_id: "agent-conv-004",
    client_id: "33677889900",
    messages: [
      "",
      { type: "text", text: "JE VEUX PARLER A UN RESPONSABLE IMMEDIATEMENT", time: "2026-03-19T16:00:00+01:00" },
      "Sent",
      { type: "text", text: "Je suis Karim, responsable sinistres. Que puis-je faire ?", agent_id: 103, time: "2026-03-19T16:01:00+01:00" },
      "",
      { type: "text", text: "Mon accident date de 2 mois et vous refusez de rembourser ! C\u2019est du vol !", time: "2026-03-19T16:02:00+01:00" },
      "Sent",
      { type: "text", text: "Le constat indique 50/50. Nous avons rembours\u00e9 1600\u20ac sur 3200\u20ac.", agent_id: 103, time: "2026-03-19T16:06:00+01:00" },
      "",
      { type: "text", text: "J\u2019ai une dashcam ! Personne ne m\u2019a demand\u00e9 la vid\u00e9o !", time: "2026-03-19T16:07:00+01:00" },
      "Sent",
      { type: "text", text: "Envoyez-la \u00e0 sinistres@mieuxassure.fr. Retour sous 48h.", agent_id: 103, time: "2026-03-19T16:08:00+01:00" },
      "",
      { type: "text", text: "Vous avez int\u00e9r\u00eat \u00e0 faire le n\u00e9cessaire cette fois", time: "2026-03-19T16:09:00+01:00" },
    ],
  },
  {
    workspace_id: "225831",
    external_id: "agent-conv-005",
    client_id: "33611223344",
    messages: [
      "",
      { type: "text", text: "Je viens d\u2019acheter une Peugeot 3008 de 2025, faut changer mon contrat", time: "2026-03-23T11:00:00+01:00" },
      "Sent",
      { type: "text", text: "F\u00e9licitations ! Il me faut la carte grise. \u00c7a passera \u00e0 95\u20ac au lieu de 75\u20ac.", agent_id: 102, time: "2026-03-23T11:01:00+01:00" },
      "",
      { type: "text", text: "20 euros de plus, \u00e7a va. On fait \u00e7a", time: "2026-03-23T11:02:00+01:00" },
      "Sent",
      { type: "text", text: "Parfait ! Bonne route avec votre 3008 !", agent_id: 102, time: "2026-03-23T11:03:00+01:00" },
    ],
  },
  {
    workspace_id: "225831",
    external_id: "agent-conv-006",
    client_id: "33644556677",
    messages: [
      "",
      { type: "text", text: "J\u2019ai besoin de ma carte verte EN URGENCE je pars en Espagne demain", time: "2026-03-22T17:00:00+01:00" },
      "Sent",
      { type: "text", text: "Je vous envoie une attestation par email. Valable dans toute l\u2019UE.", agent_id: 101, time: "2026-03-22T17:01:00+01:00" },
      "",
      { type: "text", text: "Super merci beaucoup !", time: "2026-03-22T17:04:00+01:00" },
    ],
  },
  {
    workspace_id: "225831",
    external_id: "agent-conv-007",
    client_id: "33633221100",
    messages: [
      "",
      { type: "text", text: "Mon tarif a augment\u00e9 de 15% sans pr\u00e9venir c\u2019est quoi cette arnaque", time: "2026-03-18T09:30:00+01:00" },
      "Sent",
      { type: "text", text: "L\u2019avis d\u2019\u00e9ch\u00e9ance a \u00e9t\u00e9 envoy\u00e9 \u00e0 votre ancienne adresse. Avez-vous d\u00e9m\u00e9nag\u00e9 ?", agent_id: 102, time: "2026-03-18T09:32:00+01:00" },
      "",
      { type: "text", text: "Oui en janvier. Et je conteste ! 15% c\u2019est abusif", time: "2026-03-18T09:33:00+01:00" },
      "Sent",
      { type: "text", text: "Je note la contestation. Ancien tarif maintenu. Retour sous 5 jours.", agent_id: 102, time: "2026-03-18T09:38:00+01:00" },
    ],
  },
  {
    workspace_id: "225831",
    external_id: "agent-conv-008",
    client_id: "33699887766",
    messages: [
      "",
      { type: "text", text: "Ma voiture est en panne sur l\u2019A6 je suis bloqu\u00e9 !", time: "2026-03-21T08:00:00+01:00" },
      "Sent",
      { type: "text", text: "Restez en s\u00e9curit\u00e9. D\u00e9panneur en route, 25 min. Gilet et triangle ?", agent_id: 103, time: "2026-03-21T08:01:00+01:00" },
      "",
      { type: "text", text: "Direction Paris apr\u00e8s Auxerre Nord. Oui gilet ok", time: "2026-03-21T08:02:00+01:00" },
      "Sent",
      { type: "text", text: "Parfait. V\u00e9hicule de remplacement pr\u00e9vu. Courage !", agent_id: 103, time: "2026-03-21T08:04:00+01:00" },
    ],
  },
];

async function seed() {
  for (let i = 0; i < convs.length; i++) {
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": KEY },
        body: JSON.stringify(convs[i]),
      });
      const data = await res.json();
      console.log(`Conv ${i + 1}: ${data.type || "?"} - ${data.message_count || 0} msgs - dup=${data.duplicate || false}`);
    } catch (e) {
      console.log(`Conv ${i + 1}: ERROR - ${e.message}`);
    }
  }
}

seed();
