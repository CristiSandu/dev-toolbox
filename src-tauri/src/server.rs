use chrono::Utc;
use serde::Deserialize;
use std::thread;
use tiny_http::{Header, Method, Response, Server};
use tauri::Emitter;

use crate::print_queue::{insert_print_job, PrintJob};

#[derive(Deserialize)]
struct PrintApiPayload {
    #[serde(rename = "batchId")]
    batch_id: Option<String>,
    #[serde(rename = "requestedBy")]
    requested_by: Option<String>,
    /// Accept either a single payload or an array of jobs
    payload: Option<String>,
    jobs: Option<Vec<String>>,
}

fn json_header() -> Header {
    Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap()
}

pub fn spawn_print_server(app: tauri::AppHandle) {
    let port: u16 = std::env::var("PRINT_QUEUE_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3333);

    thread::spawn(move || {
        let addr = format!("0.0.0.0:{port}");
        let server = match Server::http(&addr) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("Print server failed to start on {addr}: {e}");
                return;
            }
        };

        println!("Print queue listening on http://{addr}/print");

        'request_loop: for mut request in server.incoming_requests() {
            if request.method() != &Method::Post || request.url() != "/print" {
                let _ = request.respond(Response::from_string("Not Found").with_status_code(404));
                continue;
            }

            let mut body = String::new();
            if let Err(err) = request.as_reader().read_to_string(&mut body) {
                let _ = request.respond(
                    Response::from_string(format!("Failed to read body: {err}"))
                        .with_status_code(400),
                );
                continue;
            }

            let parsed: PrintApiPayload = match serde_json::from_str(&body) {
                Ok(p) => p,
                Err(err) => {
                    let _ = request.respond(
                        Response::from_string(format!("Invalid JSON: {err}"))
                            .with_status_code(400),
                    );
                    continue;
                }
            };

            let batch_id = parsed
                .batch_id
                .unwrap_or_else(|| format!("api-{}", Utc::now().format("%Y%m%d%H%M%S")));
            let requested_by = parsed.requested_by.unwrap_or_else(|| "remote".into());
            let mut payloads: Vec<String> = Vec::new();

            if let Some(jobs) = parsed.jobs {
                payloads.extend(jobs.into_iter().filter(|j| !j.trim().is_empty()));
            }

            if let Some(single) = parsed.payload {
                if !single.trim().is_empty() {
                    payloads.push(single);
                }
            }

            if payloads.is_empty() {
                let _ = request.respond(
                    Response::from_string("No payloads provided").with_status_code(400),
                );
                continue;
            }

            let mut created: Vec<PrintJob> = Vec::new();
            for payload in payloads {
                match insert_print_job(&app, &batch_id, &requested_by, &payload) {
                    Ok(job) => created.push(job),
                    Err(err) => {
                        let _ = request.respond(
                            Response::from_string(format!("Failed to enqueue: {err}"))
                                .with_status_code(500),
                        );
                        continue 'request_loop;
                    }
                }
            }

            let body = serde_json::to_string(&created).unwrap_or_else(|_| "[]".into());
            let _ = app.emit("print-queue-updated", &created);
            let _ = request.respond(
                Response::from_string(body)
                    .with_header(json_header())
                    .with_status_code(200),
            );
        }
    });
}
