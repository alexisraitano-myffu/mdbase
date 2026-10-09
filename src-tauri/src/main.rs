// Pas de console à côté de la fenêtre sous Windows, en version publiée.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Lancé par un client MCP (Claude) : relais sans fenêtre vers l'app ouverte.
    if std::env::args().any(|a| a == "--mcp") {
        return mdbase_lib::relayer_mcp();
    }
    mdbase_lib::lancer()
}
