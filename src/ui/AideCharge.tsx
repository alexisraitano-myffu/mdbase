// Aide du plan de charge (spec §21) : le mode d'emploi en quelques blocs,
// ouvert par le « ? » de la barre. Chaque bloc répond à « je veux… ».

const BLOCS: { titre: string; texte: string[] }[] = [
  {
    titre: 'Lire la grille',
    texte: [
      'Une ligne par ressource, une colonne par jour, semaine ou mois. Une case montre la charge sur la capacité : « 3,5 / 4 » veut dire 3,5 jours occupés sur 4 possibles (en vue Jour, la charge seule). Au-dessus de chaque rôle, le total de l’équipe.',
      'Vert : il reste de la place. Orange : plein. Rouge : surchargé. Hachuré : absent ou fermé. Clique une case pour voir de quoi elle est faite.',
    ],
  },
  {
    titre: 'Affecter quelqu’un',
    texte: ['Glisse sur les cases d’une ressource, puis choisis le projet : l’affectation est créée sur cette période.'],
  },
  {
    titre: 'Ajuster un jour',
    texte: [
      'En vue Jour, clique une case et change sa valeur. « Ce jour » ne touche que ce jour (un point marque la case), « Toute l’affectation » change son rythme entier. « Revenir à l’affectation » efface l’ajustement.',
    ],
  },
  {
    titre: 'Essayer sans toucher au réel : les scénarios',
    texte: [
      'Dans le menu « Plan réel », choisis « Nouveau scénario » et donne-lui un nom. Tant qu’il est affiché, tout ce que tu crées ou modifies va dans ce scénario, en pointillé : le plan réel ne bouge pas.',
      'Repasse sur « Plan réel » pour comparer. « Confirmer » applique le scénario au réel, « Abandonner » l’efface. Tu peux en garder plusieurs côte à côte (Option A, Option B…).',
    ],
  },
  {
    titre: 'Voir si un projet rentre : Remplir',
    texte: [
      'Choisis le projet, puis une ligne par rôle : combien de jours, entre quelles dates. « Reprendre les besoins » pré-remplit ce qui manque encore au projet.',
      '« Au plus tôt » place les jours dès que quelqu’un est libre, « Lissé » les répartit régulièrement. Chaque ligne dit ce qui est placé, ce qui manque et quand ce sera fini. L’aperçu apparaît dans la grille ; « Créer » l’écrit dans un scénario.',
    ],
  },
  {
    titre: 'Besoins',
    texte: ['L’onglet compare, projet par projet, les jours demandés par rôle à ce qui est déjà affecté, dans la fenêtre du besoin (ses dates, ou celles de sa phase).'],
  },
  {
    titre: 'Moratoires',
    texte: ['La bande au-dessus des colonnes. Fermé (hachuré) : personne ne travaille. Gel des livraisons : Remplir termine avant.'],
  },
  {
    titre: 'Réglages',
    texte: ['« Options » choisit les bases et les colonnes que lit le plan de charge.'],
  },
]

export function AideCharge() {
  return (
    <div className="aide-charge" role="dialog" aria-label="Comment se servir du plan de charge">
      <strong>Le plan de charge</strong>
      {BLOCS.map((b) => (
        <section key={b.titre}>
          <h4>{b.titre}</h4>
          {b.texte.map((t) => (
            <p key={t}>{t}</p>
          ))}
        </section>
      ))}
    </div>
  )
}
