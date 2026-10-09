//! Échos de nos propres écritures : la surveillance du dossier voit aussi les
//! fichiers que l'app vient d'écrire. Les signaler ferait relire l'espace à chaque
//! frappe (les écritures partent toutes les 300 ms), et une relecture qui croise
//! une écriture en cours peut faire disparaître des lignes ou une base.

use crate::fichiers::SUFFIXE_TEMPORAIRE;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

/// Délai pendant lequel un changement d'un fichier qu'on vient d'écrire est tenu pour un écho.
const DELAI: Duration = Duration::from_secs(2);

#[derive(Default)]
pub struct Echos(HashMap<PathBuf, Instant>);

impl Echos {
    /// Note un fichier que l'app écrit, renomme ou supprime.
    pub fn noter(&mut self, chemin: PathBuf, maintenant: Instant) {
        self.0.retain(|_, t| maintenant.duration_since(*t) < DELAI);
        self.0.insert(chemin, maintenant);
    }

    /// Faux quand tous les changements viennent de l'app : ses fichiers récents, leurs
    /// dossiers (que certains systèmes signalent aussi) et ses fichiers temporaires.
    pub fn a_signaler<'a>(&self, changes: impl IntoIterator<Item = &'a Path>, maintenant: Instant) -> bool {
        let recent = |p: &Path| self.0.get(p).is_some_and(|t| maintenant.duration_since(*t) < DELAI);
        let dossier = |p: &Path| self.0.iter().any(|(c, t)| maintenant.duration_since(*t) < DELAI && c.parent() == Some(p));
        let temporaire = |p: &Path| p.file_name().is_some_and(|n| n.to_string_lossy().ends_with(SUFFIXE_TEMPORAIRE));
        changes.into_iter().any(|p| !(recent(p) || dossier(p) || temporaire(p)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ignore_nos_ecritures_recentes_seulement() {
        let t = Instant::now();
        let mut e = Echos::default();
        e.noter(PathBuf::from("/esp/b/a.md"), t);
        let p = |s: &str| PathBuf::from(s);
        let a = p("/esp/b/a.md");
        let dossier = p("/esp/b");
        let temp = p("/esp/b/.a.md.mdbase-tmp");
        let autre = p("/esp/b/c.md");
        assert!(!e.a_signaler([a.as_path(), dossier.as_path(), temp.as_path()], t));
        // Un fichier changé ailleurs dans le même lot est signalé.
        assert!(e.a_signaler([a.as_path(), autre.as_path()], t));
        // Passé le délai, un changement de notre fichier vient d'ailleurs (synchro, script Jira).
        assert!(e.a_signaler([a.as_path()], t + DELAI));
    }
}
