import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { LigneChargee } from '../core/base'
import { differences, nomInattendu } from '../core/conflits'
import type { DepotBase } from '../core/depot-base'
import type { CopieConflit, DepotEspace } from '../core/depot-espace'
import { nomDe } from '../core/fichiers'
import { colonne as colonneDe } from '../core/schema'
import { useLancer } from './actions'
import { ValeurCompacte } from './cellules'

// Conflits de synchronisation (spec §4) : rien n'est tranché à la place de
// l'utilisateur. On montre les versions côte à côte, il choisit.

/** Fenêtre modale commune aux deux sortes de conflits. */
function Fenetre({ titre, fermer, children }: { titre: string; fermer: () => void; children: ReactNode }) {
  useEffect(() => {
    const clavier = (e: KeyboardEvent) => e.key === 'Escape' && fermer()
    document.addEventListener('keydown', clavier)
    return () => document.removeEventListener('keydown', clavier)
  }, [fermer])
  return createPortal(
    <div className="voile-fenetre" onMouseDown={(e) => e.target === e.currentTarget && fermer()}>
      <div className="fenetre" role="dialog" aria-label={titre}>
        <div className="entete-fenetre">
          <h2>{titre}</h2>
          <button className="discret" onClick={fermer} aria-label="Fermer">
            ✕
          </button>
        </div>
        <div className="corps-fenetre">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

const dateFichier = (ms: number) =>
  new Date(ms).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

// ── Ids en double ──────────────────────────────────────────────────

/** Bandeau d'une base dont des ids sont portés par plusieurs fichiers. */
export function BandeauDoublons({ depot, doublons }: { depot: DepotBase; doublons: ReadonlyMap<string, LigneChargee[]> }) {
  const [ouvert, setOuvert] = useState(false)
  const n = doublons.size
  return (
    <>
      <div className="bandeau-conflit">
        ⚠ {n === 1 ? 'Une ligne existe' : `${n} lignes existent`} en plusieurs exemplaires (même identifiant) : copie de fichier ou conflit de synchro.
        <button onClick={() => setOuvert(true)}>Comparer et choisir</button>
      </div>
      {ouvert && (
        <Fenetre titre="Lignes en plusieurs exemplaires" fermer={() => setOuvert(false)}>
          <p className="discret">
            Chaque groupe montre les fichiers qui portent le même identifiant, et ce qui les distingue. Tant que tu ne choisis pas, tous
            restent affichés et les liens vont vers le premier.
          </p>
          {[...doublons].map(([id, versions]) => (
            <GroupeDoublon key={id} depot={depot} versions={versions} />
          ))}
          {n === 0 && <p>Plus aucun conflit.</p>}
        </Fenetre>
      )}
    </>
  )
}

function GroupeDoublon({ depot, versions }: { depot: DepotBase; versions: LigneChargee[] }) {
  const lancer = useLancer()
  const [aConfirmer, setAConfirmer] = useState<string | null>(null)
  const diff = differences(versions, depot.schema)
  const colonnes = diff.colonnes.flatMap((cle) => colonneDe(depot.schema, cle) ?? [])

  return (
    <section className="groupe-doublon">
      <div className="defilement-horizontal">
        <table>
          <thead>
            <tr>
              <th>Fichier</th>
              {colonnes.map((c) => (
                <th key={c.cle}>{c.nom}</th>
              ))}
              {diff.corps && <th>Contenu</th>}
              <th />
            </tr>
          </thead>
          <tbody>
            {versions.map((l) => (
              <tr key={l.chemin}>
                <td>
                  <code>{nomDe(l.chemin)}</code>
                  <div className="discret">
                    modifié le {dateFichier(l.date)}
                    {nomInattendu(l) && ' · nom de copie'}
                  </div>
                </td>
                {colonnes.map((c) => (
                  <td key={c.cle}>{l.cellules[c.cle] ? <ValeurCompacte base={depot.schema.id} ligne={l} colonne={c} /> : <span className="discret">vide</span>}</td>
                ))}
                {diff.corps && <td className="extrait-corps">{l.corps.trim().slice(0, 160) || <span className="discret">vide</span>}</td>}
                <td className="actions-doublon">
                  {aConfirmer === l.chemin ? (
                    <>
                      <span>
                        {versions.length - 1 === 1 ? "L'autre fichier sera supprimé." : `Les ${versions.length - 1} autres fichiers seront supprimés.`}
                      </span>
                      <button className="danger" onClick={() => void lancer(depot.garderVersion(l.chemin))}>
                        Confirmer
                      </button>
                      <button onClick={() => setAConfirmer(null)}>Annuler</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setAConfirmer(l.chemin)}>Garder celle-ci</button>
                      <button
                        className="discret"
                        onClick={() => void lancer(depot.separer(l.chemin))}
                        title="Nouvel identifiant pour ce fichier : les deux deviennent des lignes distinctes. Les liens existants restent sur l'autre."
                      >
                        En faire une ligne à part
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {colonnes.length === 0 && !diff.corps && <p className="discret">Contenu identique : garder n'importe laquelle ne perd rien.</p>}
    </section>
  )
}

// ── Copies de conflit de configuration ─────────────────────────────

/** Entrée de la barre latérale quand des copies de conflit de configuration existent. */
export function AlerteCopies({ espace, copies }: { espace: DepotEspace; copies: CopieConflit[] }) {
  const [ouvert, setOuvert] = useState(false)
  if (copies.length === 0) return null
  return (
    <>
      <button className="discret alerte-copies" onClick={() => setOuvert(true)}>
        ⚠ {copies.length === 1 ? '1 copie de conflit' : `${copies.length} copies de conflit`}
      </button>
      {ouvert && (
        <Fenetre titre="Copies de conflit de synchro" fermer={() => setOuvert(false)}>
          <p className="discret">
            La synchro a gardé deux versions d'un fichier de réglages. Seul l'original est utilisé ; choisis celle à garder.
          </p>
          {copies.map((c) => (
            <CopieAResoudre key={c.chemin} espace={espace} copie={c} />
          ))}
          {copies.length === 0 && <p>Plus aucune copie.</p>}
        </Fenetre>
      )}
    </>
  )
}

function CopieAResoudre({ espace, copie }: { espace: DepotEspace; copie: CopieConflit }) {
  const lancer = useLancer()
  const [textes, setTextes] = useState<{ original: string | null; copie: string } | null>(null)
  useEffect(() => {
    void lancer(espace.lireCopieConflit(copie.chemin)).then((t) => t && setTextes(t))
  }, [espace, copie.chemin, lancer])
  return (
    <section className="copie-conflit">
      <div className="versions-copie">
        <div>
          <div className="nom-version">
            Original <code>{copie.original}</code>
          </div>
          <pre>{textes ? (textes.original ?? '(disparu)') : '…'}</pre>
          <button onClick={() => void lancer(espace.resoudreCopieConflit(copie.chemin, 'original'))}>Garder l'original</button>
        </div>
        <div>
          <div className="nom-version">
            Copie <code>{copie.chemin}</code>
          </div>
          <pre>{textes?.copie ?? '…'}</pre>
          <button onClick={() => void lancer(espace.resoudreCopieConflit(copie.chemin, 'copie'))}>Garder la copie</button>
        </div>
      </div>
    </section>
  )
}
