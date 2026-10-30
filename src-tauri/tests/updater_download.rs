use std::{
    io::{Read, Write},
    net::TcpListener,
    path::Path,
    thread,
    time::Duration,
};
use tauri_plugin_updater::UpdaterExt;

fn app() -> tauri::App<tauri::test::MockRuntime> {
    let production: serde_json::Value =
        serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
    assert_eq!(
        production["plugins"]["updater"]["requireSignedVersion"],
        true
    );
    assert!(production["plugins"]["updater"]["dangerousInsecureTransportProtocol"].is_null());
    let mut context = tauri::test::mock_context(tauri::test::noop_assets());
    // Only this in-memory test config permits a loopback HTTP server. No window or app database is created.
    context.config_mut().plugins.0.insert(
        "updater".into(),
        serde_json::json!({
            "pubkey": production["plugins"]["updater"]["pubkey"],
            "requireSignedVersion": true,
            "dangerousInsecureTransportProtocol": true,
        }),
    );
    tauri::test::mock_builder()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .build(context)
        .unwrap()
}

fn download(
    payload: Vec<u8>,
    signature: String,
    version: &str,
) -> tauri_plugin_updater::Result<Vec<u8>> {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let endpoint = format!("http://{address}/manifest");
    let manifest = serde_json::to_vec(&serde_json::json!({
        "version": version,
        "platforms": { "test-target": {
            "url": format!("http://{address}/payload"), "signature": signature,
        }},
    }))
    .unwrap();
    let server = thread::spawn(move || {
        for stream in listener.incoming().take(2) {
            let mut stream = stream.unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut request = Vec::new();
            while !request.ends_with(b"\r\n\r\n") {
                let mut byte = [0];
                if stream.read_exact(&mut byte).is_err() {
                    return;
                }
                request.push(byte[0]);
                assert!(request.len() < 16_384);
            }
            let body = if request.starts_with(b"GET /manifest ") {
                &manifest
            } else {
                &payload
            };
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            )
            .unwrap();
            stream.write_all(body).unwrap();
        }
    });
    let app = app();
    let result = tauri::async_runtime::block_on(async {
        let update = app
            .updater_builder()
            .no_proxy()
            .timeout(Duration::from_secs(10))
            .target("test-target")
            .endpoints(vec![endpoint.parse().unwrap()])?
            .build()?
            .check()
            .await?
            .unwrap();
        // Never call install: this checks real transport and signature verification only.
        update.download(|_, _| {}, || {}).await
    });
    // Wake accept if signature/version rejection happened before the payload request.
    let _ = std::net::TcpStream::connect(address);
    server.join().unwrap();
    result
}

#[test]
fn native_updater_accepts_signed_bytes_and_rejects_tampering() {
    let payload = include_bytes!("../../tests/fixtures/updater-payload.txt").to_vec();
    let signature = include_str!("../../tests/fixtures/updater-payload.txt.sig")
        .trim()
        .to_string();
    assert_eq!(
        download(payload.clone(), signature.clone(), "9999.0.0").unwrap(),
        payload
    );
    let mut tampered = payload.clone();
    tampered[0] ^= 1;
    assert!(matches!(
        download(tampered, signature.clone(), "9999.0.0"),
        Err(tauri_plugin_updater::Error::Minisign(_))
    ));
    assert!(matches!(
        download(payload, signature, "9999.0.1"),
        Err(tauri_plugin_updater::Error::SignedVersionMismatch { .. })
    ));
}

#[test]
#[ignore = "requires signed release artifacts (set UPDATER_SMOKE_DIRECTORY)"]
fn signed_release_artifacts_match_the_committed_public_key() {
    let directory =
        std::env::var_os("UPDATER_SMOKE_DIRECTORY").expect("UPDATER_SMOKE_DIRECTORY is required");
    let directory = Path::new(&directory);
    let mut count = 0;
    for entry in std::fs::read_dir(directory).unwrap() {
        let path = entry.unwrap().path();
        if path.extension().and_then(|s| s.to_str()) != Some("sig") {
            continue;
        }
        let artifact = path.with_extension("");
        let signature = std::fs::read_to_string(&path).unwrap().trim().to_string();
        let payload = std::fs::read(artifact).unwrap();
        assert_eq!(
            download(payload.clone(), signature, env!("CARGO_PKG_VERSION")).unwrap(),
            payload
        );
        count += 1;
    }
    assert!(count > 0, "No signed updater artifacts were provided");
}
