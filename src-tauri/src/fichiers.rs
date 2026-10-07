//! Fichiers de l'espace sur le disque : le pendant natif de `AdaptateurFichiers`
//! (src/core/fichiers.ts). Les chemins reçus sont ceux du cœur, relatifs à la
//! racine de l'espace et séparés par `/` : rien ne se lit ni ne s'écrit ailleurs.

use serde::Serialize;
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

/// Message d'erreur d'un fichier absent, reconnu par l'adaptateur TypeScript.
pub const INTROUVABLE: &str = "introuvable";

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
    for e in fs::read_dir(chemin(racine, dossier)?).map_err(erreur)? {
        let e = e.map_err(erreur)?;
        let genre = match e.file_type() {
            Ok(t) if t.is_dir() => "dossier",
            Ok(t) if t.is_file() => "fichier",
            _ => continue,
        };
        entrees.push(Entree { nom: e.file_name().to_string_lossy().into_owned(), genre });
    }
    Ok(entrees)
}

pub fn lire(racine: &Path, c: &str) -> Result<String, String> {
    fs::read_to_string(chemin(racine, c)?).map_err(erreur)
}

pub fn ecrire(racine: &Path, c: &str, contenu: &str) -> Result<(), String> {
    let cible = chemin(racine, c)?;
    if let Some(parent) = cible.parent() {
        fs::create_dir_all(parent).map_err(erreur)?;
    }
    fs::write(cible, contenu).map_err(erreur)
}

pub fn renommer(racine: &Path, ancien: &str, nouveau: &str) -> Result<(), String> {
    fs::rename(chemin(racine, ancien)?, chemin(racine, nouveau)?).map_err(erreur)
}

/// Un dossier n'est supprimé que vide, comme dans les autres adaptateurs.
pub fn supprimer(racine: &Path, c: &str) -> Result<(), String> {
    let cible = chemin(racine, c)?;
    if fs::metadata(&cible).map_err(erreur)?.is_dir() {
        fs::remove_dir(cible).map_err(erreur)
    } else {
        fs::remove_file(cible).map_err(erreur)
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
}
