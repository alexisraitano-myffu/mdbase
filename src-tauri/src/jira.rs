//! Synchro Jira de l'app de bureau (spec §16, « Dans l'app de bureau ») : les
//! requêtes vers Jira Cloud partent d'ici, sans la restriction CORS d'une page.
//! La correspondance ticket → ligne reste dans le cœur TypeScript ; ici, seulement
//! le transport et les identifiants. Le token ne repart jamais vers l'interface.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::Duration;

/// Nom des identifiants dans le gestionnaire du système, un par site.
const SERVICE: &str = "mdbase-jira";
/// Message d'erreur quand aucune connexion n'est gardée pour le site, reconnu par l'adaptateur.
pub const SANS_CONNEXION: &str = "sans-connexion";

#[derive(Serialize, Deserialize)]
pub struct Identifiants {
    pub email: String,
    pub token: String,
}

#[derive(Serialize)]
pub struct Reponse {
    statut: u16,
    texte: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    attente: Option<u64>,
}

impl Reponse {
    pub fn ok(&self) -> bool {
        (200..300).contains(&self.statut)
    }
}

/// Domaine seul (« https://exemple.atlassian.net/jira/… » donne « exemple.atlassian.net »), refusé s'il contient autre chose qu'un nom d'hôte.
pub fn domaine(site: &str) -> Result<String, String> {
    let d = site.trim();
    let d = d.strip_prefix("https://").or_else(|| d.strip_prefix("http://")).unwrap_or(d);
    let d = d.split('/').next().unwrap_or("").to_ascii_lowercase();
    if d.is_empty() || !d.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-') {
        return Err(format!("site Jira invalide : {site}"));
    }
    Ok(d)
}

/// Seule l'API REST v3 est appelée, en lecture (la recherche JQL passe par un POST).
pub fn chemin_permis(methode: &str, chemin: &str) -> bool {
    matches!(methode, "GET" | "POST") && chemin.starts_with("/rest/api/3/") && !chemin.contains("..")
}

fn entree(site: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, &domaine(site)?).map_err(|e| e.to_string())
}

pub fn lire(site: &str) -> Option<Identifiants> {
    serde_json::from_str(&entree(site).ok()?.get_password().ok()?).ok()
}

pub fn garder(site: &str, id: &Identifiants) -> Result<(), String> {
    let texte = serde_json::to_string(id).map_err(|e| e.to_string())?;
    entree(site)?.set_password(&texte).map_err(|e| e.to_string())
}

pub fn oublier(site: &str) -> Result<(), String> {
    match entree(site)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| reqwest::Client::builder().timeout(Duration::from_secs(60)).build().expect("client HTTP"))
}

/// Une requête vers `https://<site><chemin>`, authentifiée par l'e-mail et le token.
pub async fn appeler(site: &str, id: &Identifiants, methode: &str, chemin: &str, corps: Option<String>) -> Result<Reponse, String> {
    if !chemin_permis(methode, chemin) {
        return Err(format!("requête Jira refusée : {methode} {chemin}"));
    }
    let racine = format!("https://{}", domaine(site)?);
    let requete = if methode == "POST" { client().post(racine.clone() + chemin) } else { client().get(racine.clone() + chemin) };
    let requete = requete
        .basic_auth(&id.email, Some(&id.token))
        .header("Accept", "application/json")
        .header("Content-Type", "application/json");
    let requete = match corps {
        Some(c) => requete.body(c),
        None => requete,
    };
    let r = requete
        .send()
        .await
        .map_err(|e| format!("Jira injoignable ({racine}) : {e}. Vérifie la connexion ou le proxy de l'entreprise."))?;
    let statut = r.status().as_u16();
    let attente = r.headers().get("Retry-After").and_then(|v| v.to_str().ok()).and_then(|v| v.parse().ok());
    let texte = r.text().await.unwrap_or_default();
    Ok(Reponse { statut, texte, attente })
}

/// Lanceur au démarrage posé par `mdbase-jira.mjs --demarrage` (src/outils/jira/demarrage.ts).
pub fn lanceur_script() -> Option<PathBuf> {
    let appdata = std::env::var_os("APPDATA")?;
    Some(PathBuf::from(appdata).join(r"Microsoft\Windows\Start Menu\Programs\Startup\mdbase-jira.cmd"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn domaine_seul_et_refus() {
        assert_eq!(domaine("https://Exemple.atlassian.net/jira/software").unwrap(), "exemple.atlassian.net");
        assert_eq!(domaine(" exemple.atlassian.net ").unwrap(), "exemple.atlassian.net");
        assert!(domaine("exemple.atlassian.net@pirate.org").is_err());
        assert!(domaine("").is_err());
    }

    #[test]
    fn api_v3_seulement() {
        assert!(chemin_permis("POST", "/rest/api/3/search/jql"));
        assert!(chemin_permis("GET", "/rest/api/3/field"));
        assert!(!chemin_permis("DELETE", "/rest/api/3/issue/1"));
        assert!(!chemin_permis("GET", "/rest/api/3/../../admin"));
        assert!(!chemin_permis("GET", "/secure/admin"));
    }
}
