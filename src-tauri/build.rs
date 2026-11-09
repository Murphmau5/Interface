fn main() {
    tauri_build::build();
    #[cfg(windows)]
    embed_test_manifest();
}

/// 测试二进制没有 tauri 生成的 Windows 清单，会加载 comctl32 v5，
/// 而 tao/muda 导入了只有 v6 才有的 TaskDialogIndirect，导致 STATUS_ENTRYPOINT_NOT_FOUND。
/// 这里单独给 `cargo test` 链接一份 comctl32 v6 清单。
#[cfg(windows)]
fn embed_test_manifest() {
    use std::path::PathBuf;
    use std::process::Command;

    const MANIFEST: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <dependency>
    <dependentAssembly>
      <assemblyIdentity type="win32" name="Microsoft.Windows.Common-Controls" version="6.0.0.0" processorArchitecture="*" publicKeyToken="6595b64144ccf1df" language="*"/>
    </dependentAssembly>
  </dependency>
</assembly>
"#;

    let out_dir = match std::env::var("OUT_DIR") {
        Ok(value) => PathBuf::from(value),
        Err(_) => return,
    };
    let xml_path = out_dir.join("test-manifest.xml");
    let rc_path = out_dir.join("test-manifest.rc");
    let obj_path = out_dir.join("test-manifest.o");

    if std::fs::write(&xml_path, MANIFEST).is_err() {
        return;
    }
    let rc_body = format!("1 24 \"{}\"\n", xml_path.display().to_string().replace('\\', "/"));
    if std::fs::write(&rc_path, rc_body).is_err() {
        return;
    }

    let status = Command::new("windres")
        .arg("--input")
        .arg(&rc_path)
        .arg("--output")
        .arg(&obj_path)
        .arg("--output-format=coff")
        .status();
    println!("cargo:rerun-if-env-changed=JX_TEST_MANIFEST");
    if let Ok(status) = status {
        // `cargo:rustc-link-arg-tests` 不会作用于 --lib 单元测试目标，
        // 因此只在显式设置 JX_TEST_MANIFEST 时给本次构建的全部目标加清单。
        if status.success() && std::env::var_os("JX_TEST_MANIFEST").is_some() {
            println!("cargo:rustc-link-arg={}", obj_path.display());
        }
    }
}
