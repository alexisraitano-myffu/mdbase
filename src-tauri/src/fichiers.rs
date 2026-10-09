//! Fichiers de l'espace sur le disque : le pendant natif de `AdaptateurFichiers`
//! (src/core/fichiers.ts). Les chemins reçus sont ceux du cœur, relatifs à la
//! racine de l'espace et séparés par `/` : rien ne se lit ni ne s'écrit ailleurs.

use serde::Serialize;
use std::fs;
use std::io::{self, ErrorKind};
use std::path::{Path, PathBuf};
use std::thread::sleep;
use std::time::{Duration, UNIX_EPOCH};

/// Message d'erreur d'un fichier absent, reconnu par l'adaptateur TypeScript.
pub const INTROUVABLE: &str = "introuvable";

/// Suffixe du fichier temporaire d'une écriture : jamais listé, jamais signalé comme un changement.
pub const SUFFIXE_TEMPORAIRE: &str = ".mdbase-tmp";

/// Fichier temporaire d'une écriture, à côté de sa cible (même volume : le renommage reste atomique).
pub fn temporaire(cible: &Path) -> PathBuf {
    let nom = cible.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    cible.with_file_name(format!(".{nom}{SUFFIXE_TEMPORAIRE}"))
}

/// Erreur passagère sous Windows : fichier verrouillé un instant par la synchro (OneDrive), l'antivirus
/// ou l'indexation (accès refusé, violation de partage 32, de verrou 33).
fn passagere(e: &io::Error) -> bool {
    e.kind() == ErrorKind::PermissionDenied || matches!(e.raw_os_error(), Some(32) | Some(33))
}

/// Réessaie une opération qui échoue passagèrement, pendant environ une seconde au plus.
fn reessayer<T>(mut f: impl FnMut() -> io::Result<T>) -> io::Result<T> {
    let mut essai = 0;
    loop {
        match f() {
            Err(e) if passagere(&e) && essai < 7 => {
                essai += 1;
                sleep(Duration::from_millis(30 * essai));
            }
            r => return r,
        }
    }
}

#[derive(Serialize, Debug, PartialEq)]
pub struct Entree {
    pub nom: String,
    #[serde(rename = "type")]
    pub genre: &'static str,
}

/// Chemin du système pour un chemin du cœur ; refuse tout ce qui sortirait de la racine.
pub fn chemin(racine: &Path, c: &str) -> Result<PathBuf, String> {
    let mut p = racine.to_path_buf();
    for partie in c.split('/').filter(|s| !s.is_empty()) {
        if partie == "." || partie == ".." || partie.contains('\\') || partie.contains(':') {
            return Err(format!("Chemin refusé : {c}"));
        }
        p.push(partie);
    }
    Ok(p)
}

fn erreur(e: std::io::Error) -> String {
    if e.kind() == ErrorKind::NotFound {
        INTROUVABLE.to_string()
    } else {
        e.to_string()
    }
}

pub fn lister(racine: &Path, dossier: &str) -> Result<Vec<Entree>, String> {
    let mut entrees = Vec::new();
    for e in reessayer(|| fs::read_dir(chemin(racine, dossier).map_err(io::Error::other)?)).map_err(erreur)? {
        let e = e.map_err(erreur)?;
        let nom = e.file_name().to_string_lossy().into_owned();
        if nom.ends_with(SUFFIXE_TEMPORAIRE) {
            continue;
        }
        let genre = match e.file_type() {
            Ok(t) if t.is_dir() => "dossier",
            Ok(t) if t.is_file() => "fichier",
            _ => continue,
        };
        entrees.push(Entree { nom, genre });
    }
    Ok(entrees)
}

pub fn lire(racine: &Path, c: &str) -> Result<String, String> {
    let p = chemin(racine, c)?;
    reessayer(|| fs::read_to_string(&p)).map_err(erreur)
}

pub fn ecrire(racine: &Path, c: &str, contenu: &str) -> Result<(), String> {
    let cible = chemin(racine, c)?;
    if let Some(parent) = cible.parent() {
        fs::create_dir_all(parent).map_err(erreur)?;
    }
    // Écrit à côté puis renomme : une lecture faite pendant l'écriture (la surveillance, la synchro, une
    // autre app) voit l'ancien contenu ou le nouveau, jamais un fichier vide ou à moitié écrit.
    let temp = temporaire(&cible);
    reessayer(|| fs::write(&temp, contenu)).map_err(erreur)?;
    reessayer(|| fs::rename(&temp, &cible)).map_err(|e| {
        let _ = fs::remove_file(&temp);
        erreur(e)
    })
}

pub fn renommer(racine: &Path, ancien: &str, nouveau: &str) -> Result<(), String> {
    let (a, n) = (chemin(racine, ancien)?, chemin(racine, nouveau)?);
    reessayer(|| fs::rename(&a, &n)).map_err(erreur)
}

/// Un dossier n'est supprimé que vide, comme dans les autres adaptateurs.
pub fn supprimer(racine: &Path, c: &str) -> Result<(), String> {
    let cible = chemin(racine, c)?;
    if fs::metadata(&cible).map_err(erreur)?.is_dir() {
        reessayer(|| fs::remove_dir(&cible)).map_err(erreur)
    } else {
        reessayer(|| fs::remove_file(&cible)).map_err(erreur)
    }
}

/// Date de modification en millisecondes depuis 1970.
pub fn date_modification(racine: &Path, c: &str) -> Result<f64, String> {
    let date = fs::metadata(chemin(racine, c)?).and_then(|m| m.modified()).map_err(erreur)?;
    Ok(date.duration_since(UNIX_EPOCH).map(|d| d.as_secs_f64() * 1000.0).unwrap_or(0.0))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuse_de_sortir_de_la_racine() {
        let r = Path::new("/espace");
        assert_eq!(chemin(r, "projets/a.md").unwrap(), Path::new("/espace/projets/a.md"));
        assert_eq!(chemin(r, "").unwrap(), Path::new("/espace"));
        for c in ["../x", "a/../../x", "./a", "a\\..\\x", "C:/x"] {
            assert!(chemin(r, c).is_err(), "{c} devrait être refusé");
        }
    }

    #[test]
    fn lit_ecrit_renomme_supprime() {
        let d = tempfile::tempdir().unwrap();
        let r = d.path();
        ecrire(r, "projets/a.md", "é").unwrap();
        assert_eq!(lire(r, "projets/a.md").unwrap(), "é");
        assert_eq!(lister(r, "").unwrap(), vec![Entree { nom: "projets".into(), genre: "dossier" }]);
        assert!(date_modification(r, "projets/a.md").unwrap() > 0.0);
        renommer(r, "projets/a.md", "projets/b.md").unwrap();
        assert_eq!(lire(r, "projets/a.md").unwrap_err(), INTROUVABLE);
        assert_eq!(lister(r, "projets").unwrap(), vec![Entree { nom: "b.md".into(), genre: "fichier" }]);
        // Un dossier plein n'est pas supprimé.
        assert!(supprimer(r, "projets").is_err());
        supprimer(r, "projets/b.md").unwrap();
        supprimer(r, "projets").unwrap();
        assert_eq!(lister(r, "projets").unwrap_err(), INTROUVABLE);
        assert_eq!(supprimer(r, "absent.md").unwrap_err(), INTROUVABLE);
    }

    #[test]
    fn ecriture_atomique_sans_temporaire_visible() {
        let d = tempfile::tempdir().unwrap();
        let r = d.path();
        ecrire(r, "b/a.md", "un").unwrap();
        ecrire(r, "b/a.md", "deux").unwrap();
        assert_eq!(lire(r, "b/a.md").unwrap(), "deux");
        assert!(!temporaire(&r.join("b/a.md")).exists());
        // Un temporaire resté là (écriture interrompue) n'est jamais listé.
        fs::write(temporaire(&r.join("b/c.md")), "x").unwrap();
        assert_eq!(lister(r, "b").unwrap(), vec![Entree { nom: "a.md".into(), genre: "fichier" }]);
    }
}
