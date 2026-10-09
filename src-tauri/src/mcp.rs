//! Claude (MCP) dans l'app de bureau (spec §17) : l'app ouverte exécute les
//! outils sur son espace, sans Node.
//!
//! - L'app écoute sur 127.0.0.1 (port libre), avec un jeton secret ; port et
//!   jeton sont écrits dans `mcp.json`, à côté des réglages. Chaque message reçu
//!   est passé à la page (événement), qui répond par la commande `mcp_reponse`.
//! - Le client MCP (Claude Desktop, Claude Code) lance `mdbase --mcp` : ce mode
//!   n'ouvre pas de fenêtre, il relaie les messages entre l'entrée et la sortie
//!   standard et l'app, et ouvre l'app si elle est fermée.

use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/// Événement envoyé à la page pour chaque message du client.
pub const EVENEMENT: &str = "mcp-requete";
const FICHIER_LIAISON: &str = "mcp.json";
/// Un appel d'outil long (beaucoup de lignes) reste sous cette limite.
const ATTENTE_REPONSE: Duration = Duration::from_secs(300);
/// Temps laissé à l'app pour s'ouvrir et charger son espace.
const ATTENTE_APP: Duration = Duration::from_secs(45);

#[derive(Default)]
pub struct Liaison {
    attentes: Mutex<HashMap<u64, mpsc::Sender<Option<String>>>>,
    suivant: AtomicU64,
    /// La page écoute : module activé et espace ouvert.
    pub pret: AtomicBool,
}

#[derive(Serialize, Clone)]
struct Requete {
    id: u64,
    message: String,
}

/// Dossier des réglages de mdbase, calculé de la même façon par l'app et par `mdbase --mcp`.
pub fn dossier_reglages() -> Option<PathBuf> {
    let base = if cfg!(windows) {
        PathBuf::from(std::env::var_os("APPDATA")?)
    } else if cfg!(target_os = "macos") {
        PathBuf::from(std::env::var_os("HOME")?).join("Library/Application Support")
    } else {
        std::env::var_os("XDG_CONFIG_HOME").map(PathBuf::from).or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))?
    };
    Some(base.join("mdbase"))
}

fn jeton() -> Result<String, String> {
    let mut octets = [0u8; 32];
    getrandom::fill(&mut octets).map_err(|e| e.to_string())?;
    Ok(octets.iter().map(|o| format!("{o:02x}")).collect())
}

/// Le jeton ne se lit que par l'utilisateur : 600 hors Windows (sous Windows,
/// le dossier du profil l'est déjà).
fn ecrire_liaison(fichier: &std::path::Path, contenu: &str) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        use std::io::Write;
        use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
        let mut f = fs::OpenOptions::new().write(true).create(true).truncate(true).mode(0o600).open(fichier)?;
        f.set_permissions(fs::Permissions::from_mode(0o600))?;
        f.write_all(contenu.as_bytes())
    }
    #[cfg(not(unix))]
    fs::write(fichier, contenu)
}

/// Démarre l'écoute de l'app ; les messages arrivent à la page par `EVENEMENT`.
pub fn demarrer(app: AppHandle, liaison: Arc<Liaison>) -> Result<(), String> {
    let serveur = tiny_http::Server::http("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = serveur.server_addr().to_ip().map(|a| a.port()).ok_or("adresse d'écoute inconnue")?;
    let jeton = jeton()?;
    let dossier = dossier_reglages().ok_or("dossier des réglages introuvable")?;
    fs::create_dir_all(&dossier).map_err(|e| e.to_string())?;
    ecrire_liaison(&dossier.join(FICHIER_LIAISON), &json!({ "port": port, "jeton": jeton }).to_string()).map_err(|e| e.to_string())?;
    thread::spawn(move || {
        for requete in serveur.incoming_requests() {
            let (app, liaison, jeton) = (app.clone(), liaison.clone(), jeton.clone());
            thread::spawn(move || traiter(requete, &app, &liaison, &jeton));
        }
    });
    Ok(())
}

fn traiter(mut requete: tiny_http::Request, app: &AppHandle, liaison: &Liaison, jeton: &str) {
    let reponse = |code: u16, corps: String| tiny_http::Response::from_string(corps).with_status_code(code);
    let autorise = requete.headers().iter().any(|h| h.field.equiv("Authorization") && h.value.as_str() == format!("Bearer {jeton}"));
    if requete.method() != &tiny_http::Method::Post || requete.url() != "/mcp" || !autorise {
        let _ = requete.respond(reponse(401, String::new()));
        return;
    }
    if !liaison.pret.load(Ordering::SeqCst) {
        let _ = requete.respond(reponse(503, String::new()));
        return;
    }
    let mut message = String::new();
    if requete.as_reader().read_to_string(&mut message).is_err() {
        let _ = requete.respond(reponse(400, String::new()));
        return;
    }
    let id = liaison.suivant.fetch_add(1, Ordering::SeqCst);
    let (envoi, reception) = mpsc::channel();
    liaison.attentes.lock().unwrap().insert(id, envoi);
    let _ = app.emit(EVENEMENT, Requete { id, message });
    let r = match reception.recv_timeout(ATTENTE_REPONSE) {
        Ok(Some(texte)) => reponse(200, texte).with_header(tiny_http::Header::from_bytes("Content-Type", "application/json").unwrap()),
        Ok(None) => reponse(202, String::new()),
        Err(_) => {
            liaison.attentes.lock().unwrap().remove(&id);
            reponse(504, String::new())
        }
    };
    let _ = requete.respond(r);
}

/// Réponse de la page à un message ; `None` pour une notification.
pub fn repondre(liaison: &Liaison, id: u64, reponse: Option<String>) {
    if let Some(envoi) = liaison.attentes.lock().unwrap().remove(&id) {
        let _ = envoi.send(reponse);
    }
}

// ── Mode relais : `mdbase --mcp` ─────────────────────────────────────

fn lire_liaison() -> Option<(u16, String)> {
    let texte = fs::read_to_string(dossier_reglages()?.join(FICHIER_LIAISON)).ok()?;
    let v: Value = serde_json::from_str(&texte).ok()?;
    Some((v["port"].as_u64()? as u16, v["jeton"].as_str()?.to_string()))
}

/// Ouvre l'app, détachée du client : elle reste ouverte quand Claude se ferme.
fn ouvrir_app() {
    let Ok(exe) = std::env::current_exe() else { return };
    let mut commande = std::process::Command::new(&exe);
    commande.stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // Hors du groupe de processus du client (CREATE_BREAKAWAY_FROM_JOB | CREATE_NEW_PROCESS_GROUP) ; refusé, sans.
        if commande.creation_flags(0x0100_0000 | 0x0000_0200).spawn().is_ok() {
            return;
        }
        commande.creation_flags(0x0000_0200);
    }
    let _ = commande.spawn();
}

/// Relaie un message vers l'app ; `None` quand il n'appelle pas de réponse.
fn relayer_message(client: &reqwest::blocking::Client, message: &str, app_ouverte: &AtomicBool) -> Option<String> {
    let id = serde_json::from_str::<Value>(message).ok().map(|v| v["id"].clone()).filter(|id| !id.is_null());
    let debut = Instant::now();
    while debut.elapsed() < ATTENTE_APP {
        if let Some((port, jeton)) = lire_liaison() {
            match client.post(format!("http://127.0.0.1:{port}/mcp")).bearer_auth(&jeton).body(message.to_string()).send() {
                Ok(r) if r.status().as_u16() == 200 => return r.text().ok(),
                Ok(r) if r.status().as_u16() == 202 => return None,
                // 503 : l'app s'ouvre ou n'a pas d'espace ; 401 : fichier d'une session précédente, l'app va le réécrire.
                Ok(r) if matches!(r.status().as_u16(), 401 | 503) => {}
                Ok(_) => break,
                Err(e) if e.is_timeout() => break,
                Err(_) => {
                    if !app_ouverte.swap(true, Ordering::SeqCst) {
                        ouvrir_app();
                    }
                }
            }
        } else if !app_ouverte.swap(true, Ordering::SeqCst) {
            ouvrir_app();
        }
        thread::sleep(Duration::from_millis(400));
    }
    let id = id?;
    Some(
        json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32000, "message": "mdbase ne répond pas : ouvre l'app de bureau, un espace, et active le module Claude (MCP) dans Modules." } })
            .to_string(),
    )
}

/// Boucle du mode relais : une ligne JSON par message, sur l'entrée et la sortie standard.
pub fn relayer() {
    let client = reqwest::blocking::Client::builder().no_proxy().timeout(ATTENTE_REPONSE + Duration::from_secs(10)).build().expect("client local");
    let client = Arc::new(client);
    let app_ouverte = Arc::new(AtomicBool::new(false));
    let sortie = Arc::new(Mutex::new(std::io::stdout()));
    let mut fils = Vec::new();
    for ligne in std::io::stdin().lock().lines() {
        let Ok(ligne) = ligne else { break };
        if ligne.trim().is_empty() {
            continue;
        }
        let (client, app_ouverte, sortie) = (client.clone(), app_ouverte.clone(), sortie.clone());
        fils.push(thread::spawn(move || {
            if let Some(reponse) = relayer_message(&client, &ligne, &app_ouverte) {
                let mut s = sortie.lock().unwrap();
                let _ = writeln!(s, "{}", reponse.replace('\n', " "));
                let _ = s.flush();
            }
        }));
    }
    for f in fils {
        let _ = f.join();
    }
}

// ── Claude Desktop ───────────────────────────────────────────────────

/// Fichiers de configuration de Claude Desktop sur ce poste (installation classique, ou depuis le Microsoft Store).
fn configs_claude_desktop() -> Vec<PathBuf> {
    let mut dossiers = Vec::new();
    if cfg!(windows) {
        if let Some(a) = std::env::var_os("APPDATA") {
            dossiers.push(PathBuf::from(a).join("Claude"));
        }
        if let Some(l) = std::env::var_os("LOCALAPPDATA") {
            if let Ok(paquets) = fs::read_dir(PathBuf::from(l).join("Packages")) {
                for p in paquets.flatten() {
                    if p.file_name().to_string_lossy().starts_with("Claude_") {
                        dossiers.push(p.path().join(r"LocalCache\Roaming\Claude"));
                    }
                }
            }
        }
    } else if let Some(h) = std::env::var_os("HOME") {
        dossiers.push(PathBuf::from(h).join("Library/Application Support/Claude"));
    }
    let existants: Vec<PathBuf> = dossiers.iter().filter(|d| d.is_dir()).cloned().collect();
    let retenus = if existants.is_empty() { dossiers.into_iter().take(1).collect() } else { existants };
    retenus.into_iter().map(|d| d.join("claude_desktop_config.json")).collect()
}

/// Ajoute (ou remplace) le serveur `mdbase` dans une configuration, sans toucher au reste.
pub fn fusionner_config(texte: Option<&str>, exe: &Path) -> Result<String, String> {
    let mut v: Value = match texte.map(str::trim).filter(|t| !t.is_empty()) {
        Some(t) => serde_json::from_str(t).map_err(|e| format!("configuration de Claude Desktop illisible, laissée telle quelle : {e}"))?,
        None => json!({}),
    };
    let racine = v.as_object_mut().ok_or("configuration de Claude Desktop inattendue (pas un objet)")?;
    let serveurs = racine.entry("mcpServers").or_insert_with(|| json!({}));
    let serveurs = serveurs.as_object_mut().ok_or("mcpServers inattendu (pas un objet)")?;
    serveurs.insert("mdbase".into(), json!({ "command": exe.to_string_lossy(), "args": ["--mcp"] }));
    serde_json::to_string_pretty(&v).map_err(|e| e.to_string())
}

/// Branche mdbase dans Claude Desktop ; renvoie les fichiers modifiés. Une copie de chacun est gardée la première fois.
pub fn connecter_claude_desktop() -> Result<Vec<String>, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let mut faits = Vec::new();
    for f in configs_claude_desktop() {
        let actuel = fs::read_to_string(&f).ok();
        let nouveau = fusionner_config(actuel.as_deref(), &exe)?;
        if let Some(parent) = f.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let copie = f.with_file_name("claude_desktop_config.avant-mdbase.json");
        if let Some(a) = &actuel {
            if !copie.exists() {
                fs::write(&copie, a).map_err(|e| e.to_string())?;
            }
        }
        fs::write(&f, nouveau).map_err(|e| e.to_string())?;
        faits.push(f.to_string_lossy().into_owned());
    }
    Ok(faits)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fusion_garde_le_reste_de_la_configuration() {
        let exe = Path::new("C:/Apps/mdbase.exe");
        let avant = r#"{ "mcpServers": { "autre": { "command": "x" } }, "theme": "dark" }"#;
        let v: Value = serde_json::from_str(&fusionner_config(Some(avant), exe).unwrap()).unwrap();
        assert_eq!(v["theme"], "dark");
        assert_eq!(v["mcpServers"]["autre"]["command"], "x");
        assert_eq!(v["mcpServers"]["mdbase"]["args"], json!(["--mcp"]));
        assert_eq!(v["mcpServers"]["mdbase"]["command"], "C:/Apps/mdbase.exe");
        assert!(fusionner_config(None, exe).unwrap().contains("mdbase"));
        assert!(fusionner_config(Some("{ pas du json"), exe).is_err());
    }

    #[test]
    fn liaison_repond_au_bon_message() {
        let l = Liaison::default();
        let (envoi, reception) = mpsc::channel();
        l.attentes.lock().unwrap().insert(7, envoi);
        repondre(&l, 8, Some("autre".into()));
        repondre(&l, 7, Some("ok".into()));
        assert_eq!(reception.recv().unwrap(), Some("ok".into()));
        assert!(l.attentes.lock().unwrap().is_empty());
    }
}
