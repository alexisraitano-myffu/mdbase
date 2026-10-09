//! App de bureau de mdbase (spec §17) : l'app web dans une fenêtre native, avec
//! un accès direct au dossier de l'espace (pas de File System Access) et la
//! surveillance de ce dossier.

mod echos;
mod fichiers;
mod jira;

use echos::Echos;
use fichiers::Entree;
use notify_debouncer_mini::{new_debouncer, notify::RecursiveMode, Debouncer};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

/// Événement envoyé à la page quand un fichier de l'espace change sur le disque.
const ESPACE_MODIFIE: &str = "espace-modifie";
const FICHIER_REGLAGES: &str = "espace.json";

#[derive(Default)]
struct Espace {
    racine: Mutex<Option<PathBuf>>,
    surveillance: Mutex<Option<Debouncer<notify_debouncer_mini::notify::RecommendedWatcher>>>,
    echos: Arc<Mutex<Echos>>,
}

impl Espace {
    fn racine(&self) -> Result<PathBuf, String> {
        self.racine.lock().unwrap().clone().ok_or_else(|| "Aucun espace ouvert".to_string())
    }

    /// Note des fichiers que l'app va toucher, pour ne pas relire l'espace sur leur écho.
    fn noter(&self, racine: &Path, chemins: &[&str]) {
        let mut echos = self.echos.lock().unwrap();
        for c in chemins {
            if let Ok(p) = fichiers::chemin(racine, c) {
                echos.noter(p, Instant::now());
            }
        }
    }
}

fn reglages(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join(FICHIER_REGLAGES))
}

/// Ouvre un espace : le retient pour le prochain lancement et surveille ses fichiers.
fn ouvrir(app: &AppHandle, espace: &Espace, racine: PathBuf) -> Result<String, String> {
    let mut surveillance = new_debouncer(Duration::from_millis(300), {
        let app = app.clone();
        let echos = espace.echos.clone();
        move |r: notify_debouncer_mini::DebounceEventResult| {
            if let Ok(changes) = r {
                if echos.lock().unwrap().a_signaler(changes.iter().map(|c| c.path.as_path()), Instant::now()) {
                    let _ = app.emit(ESPACE_MODIFIE, ());
                }
            }
        }
    })
    .map_err(|e| e.to_string())?;
    // Sans surveillance (dossier réseau…), l'app relit l'espace au retour sur la fenêtre, comme dans le navigateur.
    if surveillance.watcher().watch(&racine, RecursiveMode::Recursive).is_ok() {
        *espace.surveillance.lock().unwrap() = Some(surveillance);
    }
    if let Some(f) = reglages(app) {
        let _ = f.parent().map(fs::create_dir_all);
        let _ = fs::write(f, serde_json::json!({ "dossier": racine }).to_string());
    }
    let texte = racine.to_string_lossy().into_owned();
    *espace.racine.lock().unwrap() = Some(racine);
    Ok(texte)
}

/// Le dernier espace ouvert, s'il existe toujours.
#[tauri::command]
fn dossier_memorise(app: AppHandle, espace: State<Espace>) -> Result<Option<String>, String> {
    let lu = reglages(&app).and_then(|f| fs::read_to_string(f).ok());
    let dossier = lu
        .and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok())
        .and_then(|v| v["dossier"].as_str().map(PathBuf::from))
        .filter(|d| d.is_dir());
    match dossier {
        Some(d) => ouvrir(&app, &espace, d).map(Some),
        None => Ok(None),
    }
}

/// Fenêtre du système pour choisir le dossier ; `None` si elle est fermée.
#[tauri::command]
async fn choisir_dossier(app: AppHandle, espace: State<'_, Espace>) -> Result<Option<String>, String> {
    let Some(choix) = app.dialog().file().set_title("Dossier de l'espace").blocking_pick_folder() else {
        return Ok(None);
    };
    let racine = choix.into_path().map_err(|e| e.to_string())?;
    ouvrir(&app, &espace, racine).map(Some)
}

fn avec<T>(espace: &Espace, f: impl FnOnce(&Path) -> Result<T, String>) -> Result<T, String> {
    f(&espace.racine()?)
}

#[tauri::command]
fn lister(espace: State<Espace>, dossier: String) -> Result<Vec<Entree>, String> {
    avec(&espace, |r| fichiers::lister(r, &dossier))
}

#[tauri::command]
fn lire(espace: State<Espace>, chemin: String) -> Result<String, String> {
    avec(&espace, |r| fichiers::lire(r, &chemin))
}

#[tauri::command]
fn ecrire(espace: State<Espace>, chemin: String, contenu: String) -> Result<(), String> {
    avec(&espace, |r| {
        espace.noter(r, &[&chemin]);
        fichiers::ecrire(r, &chemin, &contenu)
    })
}

#[tauri::command]
fn renommer(espace: State<Espace>, ancien: String, nouveau: String) -> Result<(), String> {
    avec(&espace, |r| {
        espace.noter(r, &[&ancien, &nouveau]);
        fichiers::renommer(r, &ancien, &nouveau)
    })
}

#[tauri::command]
fn supprimer(espace: State<Espace>, chemin: String) -> Result<(), String> {
    avec(&espace, |r| {
        espace.noter(r, &[&chemin]);
        fichiers::supprimer(r, &chemin)
    })
}

#[tauri::command]
fn date_modification(espace: State<Espace>, chemin: String) -> Result<f64, String> {
    avec(&espace, |r| fichiers::date_modification(r, &chemin))
}

/// E-mail de la connexion Jira gardée pour ce site, `None` sans connexion (le token ne sort pas d'ici).
#[tauri::command]
fn jira_connexion(site: String) -> Option<String> {
    jira::lire(&site).map(|id| id.email)
}

/// Vérifie l'e-mail et le token auprès de Jira, et ne les garde que s'ils sont acceptés.
#[tauri::command]
async fn jira_connecter(site: String, email: String, token: String) -> Result<jira::Reponse, String> {
    let id = jira::Identifiants { email: email.trim().to_string(), token: token.trim().to_string() };
    let r = jira::appeler(&site, &id, "GET", "/rest/api/3/myself", None).await?;
    if r.ok() {
        jira::garder(&site, &id)?;
    }
    Ok(r)
}

#[tauri::command]
fn jira_oublier(site: String) -> Result<(), String> {
    jira::oublier(&site)
}

#[tauri::command]
async fn jira_appeler(site: String, methode: String, chemin: String, corps: Option<String>) -> Result<jira::Reponse, String> {
    let id = jira::lire(&site).ok_or(jira::SANS_CONNEXION)?;
    jira::appeler(&site, &id, &methode, &chemin, corps).await
}

/// Vrai si le script de synchro est aussi lancé à l'ouverture de session (deux synchros sur la même base).
#[tauri::command]
fn jira_script_au_demarrage() -> bool {
    jira::lanceur_script().is_some_and(|f| f.is_file())
}

#[tauri::command]
fn jira_retirer_script_au_demarrage() -> Result<(), String> {
    match jira::lanceur_script() {
        Some(f) if f.is_file() => fs::remove_file(f).map_err(|e| e.to_string()),
        _ => Ok(()),
    }
}

pub fn lancer() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Espace::default())
        .invoke_handler(tauri::generate_handler![
            dossier_memorise,
            choisir_dossier,
            lister,
            lire,
            ecrire,
            renommer,
            supprimer,
            date_modification,
            jira_connexion,
            jira_connecter,
            jira_oublier,
            jira_appeler,
            jira_script_au_demarrage,
            jira_retirer_script_au_demarrage
        ])
        .run(tauri::generate_context!())
        .expect("lancement de mdbase");
}
