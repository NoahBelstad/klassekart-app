// src-tauri/src/main.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Student {
    pub id: String,
    pub name: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TableBlock {
    pub id: String,
    pub x: f64,
    pub y: f64,
    pub student_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SeatingChart {
    pub id: String,
    pub name: String,
    pub blocks: Vec<TableBlock>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Class {
    pub id: String,
    pub name: String,
    pub students: Vec<Student>,
    pub seating_chart: SeatingChart,
}

#[derive(Serialize, Deserialize, Default, Clone)]
pub struct AppStateData {
    pub classes: Vec<Class>,
}

pub struct AppState(pub Mutex<AppStateData>);

fn get_storage_path(app_handle: &AppHandle) -> PathBuf {
    let mut path = app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("./"));
    fs::create_dir_all(&path).ok();
    path.push("klassekart_data_v4.json");
    path
}

#[tauri::command]
fn get_classes(state: State<AppState>) -> Vec<Class> {
    let data = state.0.lock().unwrap();
    data.classes.clone()
}

#[tauri::command]
fn save_classes(
    app_handle: AppHandle,
    state: State<AppState>,
    classes: Vec<Class>,
) -> Result<(), String> {
    let mut data = state.0.lock().unwrap();
    data.classes = classes.clone();

    let path = get_storage_path(&app_handle);
    let json = serde_json::to_string_pretty(&classes).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())?;
    Ok(())
}

fn main() {
    let initial_data = AppStateData::default();

    tauri::Builder::default()
        .manage(AppState(Mutex::new(initial_data)))
        .setup(|app| {
            let path = get_storage_path(app.handle());
            if path.exists() {
                if let Ok(content) = fs::read_to_string(path) {
                    if let Ok(classes) = serde_json::from_str::<Vec<Class>>(&content) {
                        let state: State<AppState> = app.state();
                        state.0.lock().unwrap().classes = classes;
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_classes, save_classes])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
