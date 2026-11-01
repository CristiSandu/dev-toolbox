fn main() {
    if let Err(error) = dev_toolbox_lib::run_mcp() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
