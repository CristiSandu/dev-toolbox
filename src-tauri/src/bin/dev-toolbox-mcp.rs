fn main() {
    let result = if std::env::args().any(|arg| arg == "--native") {
        dev_toolbox_lib::run_mcp()
    } else {
        dev_toolbox_lib::launch_mcp()
    };
    if let Err(error) = result {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
