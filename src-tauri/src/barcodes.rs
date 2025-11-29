// src-tauri/src/barcodes.rs

use base64::prelude::*;
use datamatrix::placement::Bitmap;
use datamatrix::{DataMatrix, SymbolList};
use quickcodes::{generate, BarcodeType, ExportFormat};
use urlencoding::encode;

use barcoders::generators::image::{Color, Image as ImageGen, Rotation};
use barcoders::generators::svg::SVG as SvgGen;
use barcoders::sym::code128::Code128;

// Types that match what we used on the TS side
// Types that match what we used on the TS side
#[derive(serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CodeKind {
    Qr,
    Datamatrix,
    Ean13,
    Code128,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ImageFormat {
    Png,
    Svg,
}

// Small helper so we can map any error to String using Debug
fn to_err<E: std::fmt::Debug>(e: E) -> String {
    format!("{:?}", e)
}

fn normalize_ean13(input: &str) -> Result<String, String> {
    if !input.chars().all(|c| c.is_ascii_digit()) {
        return Err("EAN-13 must contain digits only".into());
    }

    match input.len() {
        12 => {
            // compute check digit
            let digits: Vec<u32> = input.chars().map(|c| c.to_digit(10).unwrap()).collect();

            let mut sum_odd = 0; // positions 1,3,5,... (0-based even)
            let mut sum_even = 0; // positions 2,4,6,... (0-based odd)

            for (i, d) in digits.iter().enumerate() {
                if i % 2 == 0 {
                    sum_odd += d;
                } else {
                    sum_even += d;
                }
            }

            let check = (10 - ((sum_odd + 3 * sum_even) % 10)) % 10;
            Ok(format!("{input}{check}"))
        }
        13 => {
            let digits: Vec<u32> = input.chars().map(|c| c.to_digit(10).unwrap()).collect();

            let check_given = digits[12];

            let mut sum_odd = 0;
            let mut sum_even = 0;

            for (i, d) in digits[..12].iter().enumerate() {
                if i % 2 == 0 {
                    sum_odd += d;
                } else {
                    sum_even += d;
                }
            }

            let check_calc = (10 - ((sum_odd + 3 * sum_even) % 10)) % 10;

            if check_calc != check_given {
                return Err(format!(
                    "Invalid EAN-13 check digit: expected {}, got {}",
                    check_calc, check_given
                ));
            }

            Ok(input.to_string())
        }
        _ => Err("EAN-13 must be 12 or 13 digits".into()),
    }
}

fn clean_for_code128(input: &str) -> String {
    input
        .chars()
        // drop control characters like \n, \r, \t etc.
        .filter(|c| !c.is_control())
        // keep only ASCII; replace non-ASCII with '?' so we still see something
        .map(|c| if c.is_ascii() { c } else { '?' })
        .collect()
}

fn to_code128_data(raw: &str) -> String {
    let cleaned = clean_for_code128(raw);

    // Start with Code128 charset B: 'Ɓ' (\u{0181})
    format!("\u{0181}{}", cleaned)
}

#[tauri::command]
pub fn generate_barcode(
    kind: CodeKind,
    data: String,
    format: ImageFormat,
) -> Result<String, String> {
    match (kind, format) {
        //
        // ---------- QR via quickcodes ----------
        //
        (CodeKind::Qr, ImageFormat::Svg) => {
            let svg_bytes =
                generate(BarcodeType::QRCode, &data, ExportFormat::SVG).map_err(to_err)?;
            let svg = String::from_utf8(svg_bytes).map_err(to_err)?;
            Ok(format!("data:image/svg+xml;utf8,{}", encode(&svg)))
        }
        (CodeKind::Qr, ImageFormat::Png) => {
            let png_bytes =
                generate(BarcodeType::QRCode, &data, ExportFormat::PNG).map_err(to_err)?;
            let b64 = BASE64_STANDARD.encode(png_bytes);
            Ok(format!("data:image/png;base64,{}", b64))
        }

        //
        // ---------- EAN-13 via quickcodes ----------
        //
        (CodeKind::Ean13, ImageFormat::Svg) => {
            let normalized = normalize_ean13(&data)?;
            let svg_bytes =
                generate(BarcodeType::EAN13, &normalized, ExportFormat::SVG).map_err(to_err)?;
            let svg = String::from_utf8(svg_bytes).map_err(to_err)?;
            Ok(format!("data:image/svg+xml;utf8,{}", encode(&svg)))
        }
        (CodeKind::Ean13, ImageFormat::Png) => {
            let normalized = normalize_ean13(&data)?;
            let png_bytes =
                generate(BarcodeType::EAN13, &normalized, ExportFormat::PNG).map_err(to_err)?;
            let b64 = BASE64_STANDARD.encode(png_bytes);
            Ok(format!("data:image/png;base64,{}", b64))
        }

        //
        // ---------- Code128 via barcoders ----------
        //
        (CodeKind::Code128, ImageFormat::Svg) => {
            eprintln!("Entering Code128 SVG branch with data: {data:?}");

            let cleaned = to_code128_data(&data);
            if cleaned.is_empty() {
                return Err("Input is empty or only contains invalid characters".into());
            }

            let barcode = Code128::new(&cleaned).map_err(|e| format!("Code128 error: {:?}", e))?;
            let encoded = barcode.encode();

            // height in px; 60–100 is usually good
            let svg_gen = SvgGen::new(80);
            // SvgGen::generate already returns Result<String, Error>
            let svg_str = svg_gen
                .generate(&encoded)
                .map_err(|e| format!("Code128 SVG error: {:?}", e))?;

            Ok(format!("data:image/svg+xml;utf8,{}", encode(&svg_str)))
        }

        (CodeKind::Code128, ImageFormat::Png) => {
            let cleaned = to_code128_data(&data);
            if cleaned.is_empty() {
                return Err("Input is empty or only contains invalid characters".into());
            }

            let barcode = Code128::new(&cleaned).map_err(|e| format!("Code128 error: {:?}", e))?;
            let encoded = barcode.encode();

            let img_gen = ImageGen::PNG {
                height: 80,
                xdim: 2, // bar width in px; 2–3 px is safe for scanners
                rotation: Rotation::Zero,
                background: Color::new([255, 255, 255, 255]), // white
                foreground: Color::new([0, 0, 0, 255]),       // black
            };

            let png_bytes = img_gen
                .generate(&encoded)
                .map_err(|e| format!("Code128 PNG error: {:?}", e))?;

            let b64 = BASE64_STANDARD.encode(png_bytes);
            Ok(format!("data:image/png;base64,{}", b64))
        }

        //
        // ---------- DataMatrix via datamatrix crate ----------
        //
        (CodeKind::Datamatrix, ImageFormat::Svg) => {
            // Encode the payload
            let code = DataMatrix::encode(data.as_bytes(), SymbolList::default())
                .map_err(|e| format!("encode error: {:?}", e))?;

            let bitmap: Bitmap<bool> = code.bitmap();

            // Each module size in px
            let module_size: u32 = 10;
            // Quiet zone in modules
            let quiet_zone: u32 = 1;

            let w_modules = bitmap.width() as u32;
            let h_modules = bitmap.height() as u32;

            let total_w = (w_modules + 2 * quiet_zone) * module_size;
            let total_h = (h_modules + 2 * quiet_zone) * module_size;

            // Build SVG
            let mut svg = String::new();
            use std::fmt::Write;

            write!(
        &mut svg,
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" shape-rendering="crispEdges">"#,
        w = total_w,
        h = total_h
    ).unwrap();

            // White background
            svg.push_str(r#"<rect width="100%" height="100%" fill="white"/>"#);

            // Draw modules
            for (x, y) in bitmap.pixels() {
                let x_px = (x as u32 + quiet_zone) * module_size;
                let y_px = (y as u32 + quiet_zone) * module_size;

                writeln!(
                    &mut svg,
                    r#"<rect x="{x}" y="{y}" width="{s}" height="{s}" fill="black"/>"#,
                    x = x_px,
                    y = y_px,
                    s = module_size
                )
                .unwrap();
            }

            svg.push_str("</svg>");

            // Pack as data URL for <img src="...">
            let encoded = encode(&svg);
            Ok(format!("data:image/svg+xml;utf8,{}", encoded))
        }

        (CodeKind::Datamatrix, ImageFormat::Png) => {
            // If you need PNG DataMatrix, we can rasterize via `image` crate later.
            Err("PNG for DataMatrix not implemented yet – use SVG".to_string())
        }
    }
}
