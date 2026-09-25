import { describe, expect, it } from 'vitest'
import { AdaptateurMemoire } from '../adaptateur-memoire'
import { lireSkill, MemoireAssistant } from './memoire'

const ouvrir = (fichiers: Record<string, string> = {}) => {
  const a = new AdaptateurMemoire(fichiers)
  return { a, m: new MemoireAssistant(a) }
}

describe('mémoire de l’assistant (_assistant/memoire.md)', () => {
  it('rien sur le disque : mémoire vide, aucun fichier créé à la lecture', async () => {
    const { a, m } = ouvrir()
    expect(await m.lire()).toEqual({ memoire: [], skills: [] })
    await expect(a.lire('_assistant/memoire.md')).rejects.toThrow()
  })

  it('retenir : fichier créé avec un en-tête, un fait par ligne, pas de doublon (casse, accents, espaces)', async () => {
    const { a, m } = ouvrir()
    await Promise.all([m.retenir('Semaine du  mardi'), m.retenir('Réponses courtes')])
    await m.retenir('semaine du MARDI')
    expect((await m.lire()).memoire).toEqual(['Semaine du mardi', 'Réponses courtes'])
    expect(await a.lire('_assistant/memoire.md')).toMatch(/^# Mémoire de l’assistant\n\n.*\n\n- Semaine du mardi\n- Réponses courtes\n$/)
  })

  it('oublier : seule la ligne du fait disparaît, le texte ajouté à la main reste', async () => {
    const { a, m } = ouvrir({ '_assistant/memoire.md': 'Mes notes\n\n- A\n* B\n- C\n' })
    expect((await m.lire()).memoire).toEqual(['A', 'B', 'C'])
    await m.oublier('b')
    await m.oublier('absent')
    expect(await a.lire('_assistant/memoire.md')).toBe('Mes notes\n\n- A\n- C\n')
  })
})

describe('skills (_assistant/skills/*.md)', () => {
  it('écrits puis relus à l’identique ; même nom = même fichier remplacé ; supprimés', async () => {
    const { a, m } = ouvrir()
    await m.enregistrerSkill({ nom: 'Revue : lundi', description: 'le lundi', instructions: '1. Filtrer\n2. Cocher' })
    expect(await a.lire('_assistant/skills/revue-lundi.md')).toBe('---\nnom: "Revue : lundi"\ndescription: le lundi\n---\n\n1. Filtrer\n2. Cocher\n')
    await m.enregistrerSkill({ nom: 'revue : LUNDI', description: 'v2', instructions: 'x' })
    expect((await m.lire()).skills).toEqual([{ nom: 'revue : LUNDI', description: 'v2', instructions: 'x' }])
    await m.supprimerSkill('Revue : lundi')
    expect((await m.lire()).skills).toEqual([])
  })

  it('lecture tolérante : un fichier sans frontmatter ni nom est ignoré', () => {
    expect(lireSkill('juste du texte')).toBeNull()
    expect(lireSkill('---\ndescription: x\n---\ncorps')).toBeNull()
    expect(lireSkill('﻿---\r\nnom: A\r\n---\r\ncorps\r\n')).toEqual({ nom: 'A', description: '', instructions: 'corps' })
  })
})
