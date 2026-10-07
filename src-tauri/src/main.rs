// Pas de console à côté de la fenêtre sous Windows, en version publiée.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    mdbase_lib::lancer()
}
