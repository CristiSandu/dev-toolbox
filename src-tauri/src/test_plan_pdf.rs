//! Shared, headless PDF generation for the desktop app and MCP.
use crate::{
    barcodes::{generate_barcode, CodeKind, ImageFormat},
    test_plans::{self, CaseContent, Product},
};
use base64::Engine;
use krilla::{
    action::LinkAction,
    annotation::{Annotation, LinkAnnotation, Target},
    color::rgb,
    geom::{PathBuilder, Point, Rect, Size, Transform},
    image::Image,
    metadata::Metadata,
    page::PageSettings,
    paint::Fill,
    text::{Font, TextDirection},
    Document,
};
use krilla_svg::{SurfaceExt, SvgSettings};
use pulldown_cmark::{Event, Options, Parser, Tag, TagEnd};
use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    io::Cursor,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};

const WIDTH: f32 = 595.28;
const HEIGHT: f32 = 841.89;
const MARGIN: f32 = 30.0;
const BOTTOM: f32 = HEIGHT - 36.0;
const BODY: f32 = WIDTH - MARGIN * 2.0;
const FONT_BYTES: [&[u8]; 4] = [
    include_bytes!("../assets/fonts/Roboto-Regular.ttf"),
    include_bytes!("../assets/fonts/Roboto-Medium.ttf"),
    include_bytes!("../assets/fonts/Roboto-Italic.ttf"),
    include_bytes!("../assets/fonts/Roboto-MediumItalic.ttf"),
];
#[derive(Clone, Default, PartialEq)]
struct Style {
    bold: bool,
    italic: bool,
    strike: bool,
    code: bool,
    link: Option<String>,
    muted: bool,
    error: bool,
}
impl Style {
    fn font(&self) -> usize {
        self.bold as usize + self.italic as usize * 2
    }
}
#[derive(Clone)]
struct Run {
    text: String,
    style: Style,
}
impl Run {
    fn plain(text: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            style: Style::default(),
        }
    }
}
#[derive(Clone)]
struct Line {
    runs: Vec<Run>,
    width: f32,
}
struct Fonts {
    fonts: Vec<Font>,
    faces: Vec<ttf_parser::Face<'static>>,
}
impl Fonts {
    fn new() -> Result<Self, String> {
        Ok(Self {
            fonts: FONT_BYTES
                .iter()
                .map(|bytes| {
                    Font::new(bytes.to_vec().into(), 0).ok_or("Cannot load PDF font".to_string())
                })
                .collect::<Result<_, _>>()?,
            faces: FONT_BYTES
                .iter()
                .map(|bytes| ttf_parser::Face::parse(bytes, 0).map_err(|e| e.to_string()))
                .collect::<Result<_, _>>()?,
        })
    }
    fn width(&self, text: &str, size: f32, style: &Style) -> f32 {
        let face = &self.faces[style.font()];
        text.chars()
            .map(|c| {
                face.glyph_index(c)
                    .and_then(|g| face.glyph_hor_advance(g))
                    .unwrap_or(face.units_per_em() / 2) as f32
            })
            .sum::<f32>()
            * size
            / face.units_per_em() as f32
    }
    fn lines(&self, runs: &[Run], width: f32, size: f32) -> Vec<Line> {
        let mut lines = vec![Line {
            runs: vec![],
            width: 0.0,
        }];
        for run in runs {
            let text = run
                .text
                .replace("\r\n", "\n")
                .replace('\r', "\n")
                .replace('\t', "    ");
            for (index, part) in text.split('\n').enumerate() {
                if index > 0 {
                    lines.push(Line {
                        runs: vec![],
                        width: 0.0,
                    });
                }
                for word in part.split_inclusive(' ') {
                    let advance = self.width(word, size, &run.style);
                    if advance <= width {
                        if lines.last().unwrap().width + advance > width
                            && lines.last().unwrap().width > 0.0
                        {
                            lines.push(Line {
                                runs: vec![],
                                width: 0.0,
                            });
                        }
                        append(lines.last_mut().unwrap(), word, &run.style, advance);
                    } else {
                        for character in word.chars() {
                            let value = character.to_string();
                            let advance = self.width(&value, size, &run.style);
                            if lines.last().unwrap().width + advance > width
                                && lines.last().unwrap().width > 0.0
                            {
                                lines.push(Line {
                                    runs: vec![],
                                    width: 0.0,
                                });
                            }
                            append(lines.last_mut().unwrap(), &value, &run.style, advance);
                        }
                    }
                }
            }
        }
        lines
    }
}
fn append(line: &mut Line, text: &str, style: &Style, width: f32) {
    if let Some(last) = line.runs.last_mut().filter(|last| last.style == *style) {
        last.text.push_str(text);
    } else {
        line.runs.push(Run {
            text: text.into(),
            style: style.clone(),
        });
    }
    line.width += width;
}
#[derive(Clone)]
enum Draw {
    Text {
        x: f32,
        y: f32,
        text: String,
        size: f32,
        style: Style,
    },
    Svg {
        x: f32,
        y: f32,
        w: f32,
        h: f32,
        tree: Arc<usvg::Tree>,
    },
    Image {
        x: f32,
        y: f32,
        w: f32,
        h: f32,
        image: Image,
    },
    Box {
        x: f32,
        y: f32,
        w: f32,
        h: f32,
        color: [u8; 3],
    },
}
impl Draw {
    fn offset(mut self, dx: f32, dy: f32) -> Self {
        let (x, y) = match &mut self {
            Self::Text { x, y, .. }
            | Self::Svg { x, y, .. }
            | Self::Image { x, y, .. }
            | Self::Box { x, y, .. } => (x, y),
        };
        *x += dx;
        *y += dy;
        self
    }
}
#[derive(Default)]
struct Fragment {
    ops: Vec<Draw>,
    height: f32,
}
impl Fragment {
    fn text(&mut self, fonts: &Fonts, runs: &[Run], width: f32, size: f32, center: bool) {
        for line in fonts.lines(runs, width, size) {
            line_ops(
                &mut self.ops,
                fonts,
                &line,
                if center {
                    (width - line.width).max(0.0) / 2.0
                } else {
                    0.0
                },
                self.height,
                size,
            );
            self.height += size * 1.2;
        }
    }
}
fn line_ops(ops: &mut Vec<Draw>, fonts: &Fonts, line: &Line, mut x: f32, y: f32, size: f32) {
    for run in &line.runs {
        let w = fonts.width(&run.text, size, &run.style);
        if run.style.code {
            ops.push(Draw::Box {
                x,
                y,
                w,
                h: size * 1.2,
                color: [238, 241, 244],
            });
        }
        ops.push(Draw::Text {
            x,
            y: y + size,
            text: run.text.clone(),
            size,
            style: run.style.clone(),
        });
        if run.style.strike {
            ops.push(Draw::Box {
                x,
                y: y + size * 0.65,
                w,
                h: 0.5,
                color: [25, 30, 36],
            });
        }
        x += w;
    }
}
struct Layout<'a> {
    fonts: &'a Fonts,
    pages: Vec<Vec<Draw>>,
    y: f32,
    cancelled: &'a AtomicBool,
}
impl<'a> Layout<'a> {
    fn new(fonts: &'a Fonts, cancelled: &'a AtomicBool) -> Self {
        Self {
            fonts,
            pages: vec![vec![]],
            y: MARGIN,
            cancelled,
        }
    }
    fn check(&self) -> Result<(), String> {
        check_cancelled(self.cancelled)
    }
    fn ensure(&mut self, height: f32) -> Result<(), String> {
        self.check()?;
        if self.y + height > BOTTOM && self.y > MARGIN {
            self.pages.push(vec![]);
            self.y = MARGIN;
        }
        Ok(())
    }
    fn put(&mut self, fragment: &Fragment, x: f32, y: f32) {
        self.pages
            .last_mut()
            .unwrap()
            .extend(fragment.ops.iter().cloned().map(|op| op.offset(x, y)));
    }
    fn text(
        &mut self,
        runs: &[Run],
        size: f32,
        indent: f32,
        after: f32,
        heading: bool,
    ) -> Result<(), String> {
        let lines = self.fonts.lines(runs, BODY - indent, size);
        self.ensure(if heading {
            size * 1.2 + 22.0
        } else {
            size * 1.2
        })?;
        for line in lines {
            self.ensure(size * 1.2)?;
            line_ops(
                self.pages.last_mut().unwrap(),
                self.fonts,
                &line,
                MARGIN + indent,
                self.y,
                size,
            );
            self.y += size * 1.2;
        }
        self.y += after;
        Ok(())
    }
    fn group_heading(
        &mut self,
        heading: &mut Option<Fragment>,
        following_height: f32,
    ) -> Result<(), String> {
        if heading
            .as_ref()
            .is_some_and(|h| h.height > BOTTOM - MARGIN - following_height)
        {
            return Err(
                "A list heading is too tall for an A4 page. Reduce line breaks in its name.".into(),
            );
        }
        self.ensure(heading.as_ref().map_or(0.0, |h| h.height) + following_height)?;
        if let Some(heading) = heading.take() {
            self.put(&heading, MARGIN, self.y);
            self.y += heading.height;
        }
        Ok(())
    }
    fn markdown(&mut self, source: &str) -> Result<(), String> {
        for block in markdown(source) {
            match block {
                Block::Text {
                    runs,
                    size,
                    indent,
                    before,
                    after,
                    heading,
                } => {
                    self.ensure(before + size * 1.2)?;
                    self.y += before;
                    self.text(&runs, size, indent, after, heading)?;
                }
                Block::Rule => {
                    self.ensure(8.0)?;
                    self.pages.last_mut().unwrap().push(Draw::Box {
                        x: MARGIN,
                        y: self.y + 3.0,
                        w: BODY,
                        h: 0.5,
                        color: [170, 179, 189],
                    });
                    self.y += 8.0;
                }
                Block::Table(rows) => self.table(&rows)?,
            }
        }
        Ok(())
    }
    fn table(&mut self, rows: &[Vec<Vec<Run>>]) -> Result<(), String> {
        let columns = rows.iter().map(Vec::len).max().unwrap_or(0);
        if columns == 0 {
            return Ok(());
        }
        let width = BODY / columns as f32;
        let mut header: Option<Vec<Vec<Line>>> = None;
        for (row_index, row) in rows.iter().enumerate() {
            let cells: Vec<Vec<Line>> = (0..columns)
                .map(|i| {
                    let mut runs = row.get(i).cloned().unwrap_or_default();
                    if row_index == 0 {
                        for run in &mut runs {
                            run.style.bold = true;
                        }
                    }
                    self.fonts.lines(&runs, (width - 8.0).max(8.0), 7.5)
                })
                .collect();
            if row_index == 0 {
                header = Some(cells.clone());
            }
            let total = cells.iter().map(Vec::len).max().unwrap_or(1);
            let mut offset = 0;
            while offset < total {
                self.check()?;
                let remaining = (BOTTOM - self.y - 6.0) / 9.0;
                let wanted = (total - offset) as f32;
                if remaining < 1.0 || (wanted <= 80.0 && wanted > remaining && offset == 0) {
                    self.pages.push(vec![]);
                    self.y = MARGIN;
                    if row_index > 0 {
                        if let Some(header) = &header {
                            let n = header.iter().map(Vec::len).max().unwrap_or(1);
                            if n <= 5 {
                                self.table_segment(header, 0, n, width, true);
                            }
                        }
                    }
                }
                let take =
                    (total - offset).min(((BOTTOM - self.y - 6.0) / 9.0).floor().max(1.0) as usize);
                self.table_segment(&cells, offset, take, width, row_index == 0);
                offset += take;
            }
        }
        self.y += 4.0;
        Ok(())
    }
    fn table_segment(
        &mut self,
        cells: &[Vec<Line>],
        start: usize,
        count: usize,
        width: f32,
        header: bool,
    ) {
        let h = count as f32 * 9.0 + 6.0;
        if header {
            self.pages.last_mut().unwrap().push(Draw::Box {
                x: MARGIN,
                y: self.y,
                w: BODY,
                h,
                color: [238, 241, 244],
            });
        }
        for (col, lines) in cells.iter().enumerate() {
            for (i, line) in lines.iter().skip(start).take(count).enumerate() {
                line_ops(
                    self.pages.last_mut().unwrap(),
                    self.fonts,
                    line,
                    MARGIN + col as f32 * width + 4.0,
                    self.y + 3.0 + i as f32 * 9.0,
                    7.5,
                );
            }
        }
        self.pages.last_mut().unwrap().push(Draw::Box {
            x: MARGIN,
            y: self.y + h,
            w: BODY,
            h: 0.4,
            color: [215, 223, 233],
        });
        self.y += h;
    }
}

enum Block {
    Text {
        runs: Vec<Run>,
        size: f32,
        indent: f32,
        before: f32,
        after: f32,
        heading: bool,
    },
    Table(Vec<Vec<Vec<Run>>>),
    Rule,
}
fn safe_link(value: &str) -> Option<String> {
    tauri::Url::parse(value)
        .ok()
        .filter(|url| {
            matches!(url.scheme(), "http" | "https" | "mailto")
                && url.username().is_empty()
                && url.password().is_none()
        })
        .map(|_| value.to_string())
}
fn markdown(source: &str) -> Vec<Block> {
    let mut blocks = vec![];
    let mut runs = vec![];
    let mut style = Style::default();
    let mut size = 8.0;
    let mut heading = false;
    let mut code = false;
    let mut quote = 0;
    let mut lists: Vec<Option<u64>> = vec![];
    let mut table: Option<Vec<Vec<Vec<Run>>>> = None;
    let mut row: Vec<Vec<Run>> = vec![];
    let mut bold = 0;
    let mut italic = 0;
    let mut image_url = None;
    macro_rules! flush {
        () => {
            if !runs.is_empty() {
                blocks.push(Block::Text {
                    runs: std::mem::take(&mut runs),
                    size,
                    indent: (lists.len().saturating_sub(1) * 10 + quote * 10) as f32,
                    before: if heading { 4.0 } else { 0.0 },
                    after: if code { 4.0 } else { 2.0 },
                    heading,
                });
            }
        };
    }
    for event in Parser::new_ext(
        source,
        Options::ENABLE_TABLES
            | Options::ENABLE_STRIKETHROUGH
            | Options::ENABLE_TASKLISTS
            | Options::ENABLE_FOOTNOTES,
    ) {
        match event {
            Event::Start(Tag::Heading { level, .. }) => {
                flush!();
                size = [14.0, 12.0, 10.0, 9.0, 8.5, 8.0][level as usize - 1];
                heading = true;
                style.bold = true;
            }
            Event::End(TagEnd::Heading(_)) => {
                flush!();
                size = 8.0;
                heading = false;
                style.bold = bold > 0;
            }
            Event::End(TagEnd::Paragraph) => {
                if table.is_none() {
                    flush!();
                }
            }
            Event::Start(Tag::CodeBlock(_)) => {
                flush!();
                code = true;
                size = 7.5;
                style.code = true;
            }
            Event::End(TagEnd::CodeBlock) => {
                flush!();
                code = false;
                size = 8.0;
                style.code = false;
            }
            Event::Start(Tag::Strong) => {
                bold += 1;
                style.bold = true;
            }
            Event::End(TagEnd::Strong) => {
                bold -= 1;
                style.bold = bold > 0 || heading;
            }
            Event::Start(Tag::Emphasis) => {
                italic += 1;
                style.italic = true;
            }
            Event::End(TagEnd::Emphasis) => {
                italic -= 1;
                style.italic = italic > 0 || quote > 0;
            }
            Event::Start(Tag::Strikethrough) => style.strike = true,
            Event::End(TagEnd::Strikethrough) => style.strike = false,
            Event::Start(Tag::Link { dest_url, .. }) => style.link = safe_link(&dest_url),
            Event::End(TagEnd::Link) => style.link = None,
            Event::Start(Tag::Image { dest_url, .. }) => image_url = safe_link(&dest_url),
            Event::End(TagEnd::Image) => {
                if let Some(url) = image_url.take() {
                    runs.push(Run::plain(format!(" ({url})")));
                }
            }
            Event::Start(Tag::List(start)) => {
                flush!();
                lists.push(start);
            }
            Event::End(TagEnd::List(_)) => {
                flush!();
                lists.pop();
            }
            Event::Start(Tag::Item) => {
                flush!();
                let marker = if let Some(Some(n)) = lists.last_mut() {
                    let s = format!("{n}. ");
                    *n += 1;
                    s
                } else {
                    "• ".into()
                };
                runs.push(Run::plain(marker));
            }
            Event::End(TagEnd::Item) => {
                flush!();
            }
            Event::TaskListMarker(checked) => {
                runs.push(Run::plain(if checked { "[x] " } else { "[ ] " }))
            }
            Event::Start(Tag::BlockQuote(_)) => {
                flush!();
                quote += 1;
                style.italic = true;
            }
            Event::End(TagEnd::BlockQuote(_)) => {
                flush!();
                quote -= 1;
                style.italic = italic > 0;
            }
            Event::Start(Tag::Table(_)) => {
                flush!();
                table = Some(vec![]);
            }
            Event::End(TagEnd::TableCell) => {
                row.push(std::mem::take(&mut runs));
            }
            Event::End(TagEnd::TableHead) | Event::End(TagEnd::TableRow) => {
                if let Some(table) = &mut table {
                    table.push(std::mem::take(&mut row));
                }
            }
            Event::End(TagEnd::Table) => {
                blocks.push(Block::Table(table.take().unwrap_or_default()));
            }
            Event::Rule => {
                flush!();
                blocks.push(Block::Rule);
            }
            Event::Text(text) => runs.push(Run {
                text: text.into_string(),
                style: style.clone(),
            }),
            Event::Code(text) => {
                let mut code_style = style.clone();
                code_style.code = true;
                runs.push(Run {
                    text: text.into_string(),
                    style: code_style,
                });
            }
            Event::SoftBreak => runs.push(Run::plain(if code { "\n" } else { " " })),
            Event::HardBreak => runs.push(Run::plain("\n")),
            Event::FootnoteReference(label) => runs.push(Run::plain(format!("[{label}]"))),
            Event::Start(Tag::FootnoteDefinition(label)) => {
                flush!();
                runs.push(Run::plain(format!("[{label}] ")));
            }
            Event::End(TagEnd::FootnoteDefinition) => {
                flush!();
            }
            _ => {} // Raw HTML is never executed or embedded.
        }
    }
    flush!();
    blocks
}

#[derive(Clone, Default)]
struct Asset {
    code: Option<Arc<usvg::Tree>>,
    error: Option<String>,
    image: Option<Image>,
}
fn code_asset(product: &Product) -> Result<Arc<usvg::Tree>, String> {
    if product.text.trim() != product.text
        || !product.text.is_ascii()
        || product.text.chars().any(char::is_control)
    {
        return Err(
            "Use printable ASCII without leading/trailing spaces or control characters.".into(),
        );
    }
    let kind = match product.code_type.as_str() {
        "QR Code" => CodeKind::Qr,
        "EAN-13" => CodeKind::Ean13,
        "DataMatrix" => CodeKind::Datamatrix,
        _ => CodeKind::Code128,
    };
    let data = generate_barcode(kind, product.text.clone(), ImageFormat::Svg)?;
    let mut svg = urlencoding::decode(data.split_once(',').ok_or("Invalid generated SVG")?.1)
        .map_err(|e| e.to_string())?
        .into_owned();
    while let Some(start) = svg.find("<text") {
        let Some(end) = svg[start..].find("</text>") else {
            break;
        };
        svg.replace_range(start..start + end + 7, "");
    }
    usvg::Tree::from_str(&svg, &usvg::Options::default())
        .map(Arc::new)
        .map_err(|e| e.to_string())
}
fn product_image(data: &str) -> Result<Image, String> {
    let bytes = base64::prelude::BASE64_STANDARD
        .decode(data.split_once(',').ok_or("Invalid image")?.1)
        .map_err(|e| e.to_string())?;
    let reader = image::ImageReader::new(Cursor::new(&bytes))
        .with_guessed_format()
        .map_err(|e| e.to_string())?;
    let (w, h) = reader.into_dimensions().map_err(|e| e.to_string())?;
    if w == 0 || h == 0 || w as u64 * h as u64 > 40_000_000 {
        return Err("Product image exceeds 40 million pixels".into());
    }
    let mut reader = image::ImageReader::new(Cursor::new(&bytes))
        .with_guessed_format()
        .map_err(|e| e.to_string())?;
    let mut limits = image::Limits::default();
    limits.max_alloc = Some(160_000_000);
    reader.limits(limits);
    let decoded = reader
        .decode()
        .map_err(|e| e.to_string())?
        .thumbnail(320, 320)
        .to_rgba8();
    let (width, height) = decoded.dimensions();
    Ok(Image::from_rgba8(decoded.into_raw(), width, height))
}
fn geometry(product: &Product, asset: &Asset) -> (f32, f32, f32) {
    let Some(code) = &asset.code else {
        return (0.0, 0.0, 0.0);
    };
    let unit = match product.code_type.as_str() {
        "QR Code" => 4.0,
        "DataMatrix" => 10.0,
        "EAN-13" => 2.0,
        _ => 1.0,
    };
    let quiet = match product.code_type.as_str() {
        "QR Code" => 4.0,
        "DataMatrix" => 1.0,
        "EAN-13" => 11.0,
        _ => 10.0,
    };
    (
        code.size().width(),
        code.size().height(),
        (code.size().width() + 2.0 * quiet * unit)
            * (if matches!(product.code_type.as_str(), "QR Code" | "DataMatrix") {
                1.15
            } else {
                1.0
            })
            / unit,
    )
}
fn columns(product: &Product, asset: &Asset, codes_only: bool) -> usize {
    if !codes_only
        && (product.text.len() > 180
            || product.description.len() > 350
            || product.image_url.len() > 180)
    {
        return 1;
    }
    let mut n = if matches!(product.code_type.as_str(), "QR Code" | "DataMatrix") {
        4
    } else {
        2
    };
    let min = geometry(product, asset).2;
    while n > 1 && min > cell_width(n) {
        n -= 1;
    }
    n
}
fn cell_width(n: usize) -> f32 {
    (BODY - (n - 1) as f32 * 12.0) / n as f32 - 14.0
}
fn caption(value: &str, width: f32) -> String {
    let compact = value.split_whitespace().collect::<Vec<_>>().join(" ");
    let limit = (width / 4.0).floor().clamp(16.0, 64.0) as usize;
    if compact.chars().count() <= limit {
        compact
    } else {
        compact
            .chars()
            .take(limit - 1)
            .chain(std::iter::once('…'))
            .collect()
    }
}
fn header(
    fonts: &Fonts,
    product: &Product,
    asset: &Asset,
    width: f32,
    codes_only: bool,
    number: usize,
) -> Fragment {
    let mut f = Fragment::default();
    if !codes_only {
        f.text(
            fonts,
            &[Run {
                text: format!(
                    "{number}. {}",
                    if product.title.is_empty() {
                        "Product"
                    } else {
                        &product.title
                    }
                ),
                style: Style {
                    bold: true,
                    ..Default::default()
                },
            }],
            width - if asset.image.is_some() { 34.0 } else { 0.0 },
            10.0,
            false,
        );
        f.text(
            fonts,
            &[Run {
                text: product.code_type.clone(),
                style: Style {
                    muted: true,
                    ..Default::default()
                },
            }],
            width,
            7.0,
            false,
        );
        if let Some(image) = &asset.image {
            let (w, h) = image.size();
            let scale = 28.0 / (w.max(h) as f32);
            f.ops.push(Draw::Image {
                x: width - 28.0,
                y: 0.0,
                w: w as f32 * scale,
                h: h as f32 * scale,
                image: image.clone(),
            });
            f.height = f.height.max(28.0);
        }
        f.height += 4.0;
    }
    if let Some(tree) = &asset.code {
        let (w, h, min) = geometry(product, asset);
        let matrix = matches!(product.code_type.as_str(), "QR Code" | "DataMatrix");
        let unit = match product.code_type.as_str() {
            "QR Code" => 4.0,
            "DataMatrix" => 10.0,
            "EAN-13" => 2.0,
            _ => 1.0,
        };
        let quiet_modules = match product.code_type.as_str() {
            "QR Code" => 4.0,
            "DataMatrix" => 1.0,
            "EAN-13" => 11.0,
            _ => 10.0,
        };
        let target = if matrix {
            if codes_only {
                72.0
            } else {
                56.0
            }
        } else if codes_only {
            width.min(360.0)
        } else {
            180.0
        };
        let minimum_scale = (if matrix { 1.15 } else { 1.0 }) / unit;
        let scale = (target / w)
            .max(minimum_scale)
            .min((width - 8.0) / (w + 2.0 * quiet_modules * unit));
        let quiet = (quiet_modules * unit * scale).max(4.0);
        let code_w = w * scale;
        let code_h = if matrix {
            code_w * h / w
        } else if codes_only {
            64.0
        } else {
            42.0
        };
        f.height += if matrix { quiet } else { 5.0 };
        f.ops.push(Draw::Svg {
            x: if codes_only {
                (width - code_w) / 2.0
            } else {
                quiet
            },
            y: f.height,
            w: code_w,
            h: code_h,
            tree: tree.clone(),
        });
        f.height += code_h + if matrix { quiet } else { 5.0 };
        if !codes_only && min > width {
            f.text(
                fonts,
                &[Run {
                    text: "Dense code: print enlarged for reliable scanning.".into(),
                    style: Style {
                        error: true,
                        ..Default::default()
                    },
                }],
                width,
                7.0,
                false,
            );
        }
    } else {
        f.text(
            fonts,
            &[Run {
                text: format!(
                    "Code unavailable: {}",
                    asset.error.as_deref().unwrap_or("Generation failed")
                ),
                style: Style {
                    error: true,
                    ..Default::default()
                },
            }],
            width,
            8.0,
            codes_only,
        );
    }
    if codes_only {
        f.height += 2.0;
        f.text(
            fonts,
            &[Run::plain(caption(&product.text, width))],
            width,
            7.0,
            true,
        );
        f.height += 3.0;
        f.text(
            fonts,
            &[Run {
                text: if product.title.is_empty() {
                    "Untitled product".into()
                } else {
                    product.title.clone()
                },
                style: Style {
                    bold: true,
                    ..Default::default()
                },
            }],
            width,
            9.0,
            true,
        );
    }
    f.height += 4.0;
    f
}
fn details(product: &Product, asset: &Asset) -> Vec<(Vec<Run>, f32)> {
    let mut result = vec![(
        vec![
            Run {
                text: "Value: ".into(),
                style: Style {
                    bold: true,
                    ..Default::default()
                },
            },
            Run::plain(&product.text),
        ],
        8.0,
    )];
    if !product.description.is_empty() {
        result.push((vec![Run::plain(&product.description)], 8.0));
    }
    if !product.image_url.is_empty() {
        result.push((
            vec![
                Run {
                    text: format!(
                        "{}: ",
                        if asset.image.is_some() {
                            "Image"
                        } else {
                            "Image unavailable"
                        }
                    ),
                    style: Style {
                        muted: true,
                        ..Default::default()
                    },
                },
                Run {
                    text: product.image_url.clone(),
                    style: Style {
                        link: safe_link(&product.image_url),
                        muted: true,
                        ..Default::default()
                    },
                },
            ],
            6.5,
        ));
    }
    result
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfResult {
    pub file_path: String,
    pub failed_codes: usize,
    pub unavailable_images: usize,
}
fn check_cancelled(cancelled: &AtomicBool) -> Result<(), String> {
    if cancelled.load(Ordering::Relaxed) {
        Err("PDF export cancelled".into())
    } else {
        Ok(())
    }
}

pub(crate) fn export(
    source: &CaseContent,
    project_name: &str,
    file_path: &str,
    codes_only: bool,
    cancelled: &AtomicBool,
    progress: impl Fn(String),
) -> Result<PdfResult, String> {
    test_plans::validate(source)?;
    if project_name.chars().count() > 200 {
        return Err("Project name exceeds 200 characters".into());
    }
    let products: Vec<&Product> = source.lists.iter().flat_map(|l| &l.products).collect();
    if codes_only && products.is_empty() {
        return Err("Add at least one product before exporting codes.".into());
    }
    let fonts = Fonts::new()?;
    let mut assets = HashMap::new();
    let mut codes = HashMap::new();
    let mut images = HashMap::new();
    let mut urls = vec![];
    let mut seen_urls = HashSet::new();
    let mut image_bytes = 0usize;
    if !codes_only {
        for p in &products {
            if !p.image_url.is_empty() && seen_urls.insert(p.image_url.clone()) {
                urls.push(p.image_url.clone());
            }
        }
    }
    for (batch, chunk) in urls.chunks(4).enumerate() {
        check_cancelled(cancelled)?;
        progress(format!(
            "Fetching product images: {} of {}",
            batch * 4,
            urls.len()
        ));
        let tasks: Vec<_> = chunk
            .iter()
            .map(|url| {
                tauri::async_runtime::spawn(test_plans::fetch_test_product_image(url.clone()))
            })
            .collect();
        for (url, task) in chunk.iter().zip(tasks) {
            let image = tauri::async_runtime::block_on(task)
                .ok()
                .and_then(Result::ok)
                .and_then(|data| product_image(&data).ok());
            // Bound aggregate decoded image memory, including documents with thousands of URLs.
            let image = image.filter(|image| {
                let (w, h) = image.size();
                let bytes = w as usize * h as usize * 4;
                if image_bytes + bytes > 64_000_000 {
                    false
                } else {
                    image_bytes += bytes;
                    true
                }
            });
            images.insert(url.clone(), image);
        }
    }
    let mut failed_codes = 0;
    let mut unavailable_images = 0;
    for (index, product) in products.iter().enumerate() {
        check_cancelled(cancelled)?;
        let code = codes
            .entry((product.code_type.clone(), product.text.clone()))
            .or_insert_with(|| code_asset(product))
            .clone();
        let image = images.get(&product.image_url).cloned().flatten();
        if code.is_err() {
            failed_codes += 1;
        }
        if !codes_only && !product.image_url.is_empty() && image.is_none() {
            unavailable_images += 1;
        }
        let asset = match code {
            Ok(code) => Asset {
                code: Some(code),
                image,
                error: None,
            },
            Err(error) => Asset {
                code: None,
                image,
                error: Some(error),
            },
        };
        assets.insert(product.id.clone(), asset);
        progress(format!(
            "Preparing PDF: {} of {} entries",
            index + 1,
            products.len()
        ));
    }
    progress("Building PDF pages…".into());
    let mut layout = Layout::new(&fonts, cancelled);
    if !codes_only {
        layout.text(
            &[Run {
                text: source.title.clone(),
                style: Style {
                    bold: true,
                    ..Default::default()
                },
            }],
            16.0,
            0.0,
            4.0,
            true,
        )?;
        layout.text(
            &[Run {
                text: format!(
                    "{project_name}  |  {} entries across {} lists",
                    products.len(),
                    source.lists.len()
                ),
                style: Style {
                    muted: true,
                    ..Default::default()
                },
            }],
            8.0,
            0.0,
            6.0,
            false,
        )?;
        layout.markdown(&source.description_markdown)?;
    }
    let groups: Vec<(&str, Vec<&Product>)> = if codes_only {
        vec![("", products.clone())]
    } else {
        source
            .lists
            .iter()
            .map(|l| (l.name.as_str(), l.products.iter().collect()))
            .collect()
    };
    let mut number = 0;
    for (name, products) in groups {
        let mut group_heading = if codes_only {
            None
        } else {
            let mut fragment = Fragment::default();
            fragment.height = 8.0;
            fragment.text(
                &fonts,
                &[Run {
                    text: format!("{name} - {} entries", products.len()),
                    style: Style {
                        bold: true,
                        ..Default::default()
                    },
                }],
                BODY,
                11.0,
                false,
            );
            fragment.height += 4.0;
            Some(fragment)
        };
        if products.is_empty() && !codes_only {
            layout.group_heading(&mut group_heading, 16.0)?;
            layout.text(
                &[Run::plain("No entries in this list.")],
                8.0,
                0.0,
                4.0,
                false,
            )?;
        }
        let mut index = 0;
        while index < products.len() {
            check_cancelled(cancelled)?;
            let product = products[index];
            let mut n = columns(product, &assets[&product.id], codes_only);
            if let Some(next) = products.get(index + 1) {
                let next_n = columns(next, &assets[&next.id], codes_only);
                if next_n > 1 && next_n < n {
                    n = next_n;
                }
            }
            let mut cards = vec![];
            for (offset, p) in products[index..].iter().take(n).enumerate() {
                if columns(p, &assets[&p.id], codes_only) < n {
                    break;
                }
                let mut card = header(
                    &fonts,
                    p,
                    &assets[&p.id],
                    cell_width(n),
                    codes_only,
                    number + offset + 1,
                );
                if !codes_only {
                    for (runs, size) in details(p, &assets[&p.id]) {
                        card.text(&fonts, &runs, cell_width(n), size, false);
                        card.height += 3.0;
                    }
                }
                if card.height > BOTTOM - MARGIN {
                    n = 1;
                    cards.clear();
                    break;
                }
                cards.push(card);
            }
            let heading_height = group_heading.as_ref().map_or(0.0, |heading| heading.height);
            if !codes_only
                && cards
                    .iter()
                    .any(|card| card.height + 12.0 + heading_height > BOTTOM - MARGIN)
            {
                n = 1;
            }
            if n == 1 && !codes_only {
                let card = header(
                    &fonts,
                    product,
                    &assets[&product.id],
                    BODY,
                    false,
                    number + 1,
                );
                if card.height + 12.0 > BOTTOM - MARGIN {
                    return Err("A product header is too tall for an A4 page. Reduce line breaks in its title.".into());
                }
                layout.group_heading(&mut group_heading, card.height + 12.0)?;
                layout.put(&card, MARGIN, layout.y);
                layout.y += card.height;
                for (runs, size) in details(product, &assets[&product.id]) {
                    layout.text(&runs, size, 0.0, 3.0, false)?;
                }
                layout.y += 5.0;
                index += 1;
                number += 1;
            } else {
                if cards.is_empty() {
                    return Err("A product label is too large for an A4 page".into());
                }
                let height = cards.iter().map(|c| c.height).fold(0.0, f32::max) + 12.0;
                layout.group_heading(&mut group_heading, height)?;
                for (col, card) in cards.iter().enumerate() {
                    layout.put(
                        card,
                        MARGIN + 7.0 + col as f32 * (cell_width(n) + 26.0),
                        layout.y + 6.0,
                    );
                }
                layout.y += height;
                index += cards.len();
                number += cards.len();
            }
        }
    }
    let bytes = render(
        &fonts,
        &layout.pages,
        &source.title,
        project_name,
        codes_only,
        cancelled,
    )?;
    check_cancelled(cancelled)?;
    progress("Saving PDF…".into());
    test_plans::write_case_pdf(file_path, &bytes)?;
    Ok(PdfResult {
        file_path: file_path.into(),
        failed_codes,
        unavailable_images,
    })
}
fn render(
    fonts: &Fonts,
    pages: &[Vec<Draw>],
    title: &str,
    project: &str,
    codes_only: bool,
    cancelled: &AtomicBool,
) -> Result<Vec<u8>, String> {
    let mut doc = Document::new();
    doc.set_metadata(
        Metadata::new()
            .title(title.into())
            .description(format!("Test case - {project}"))
            .creator("Dev Toolbox".into()),
    );
    for (index, ops) in pages.iter().enumerate() {
        check_cancelled(cancelled)?;
        let mut page = doc.start_page_with(PageSettings::from_wh(WIDTH, HEIGHT).unwrap());
        let mut surface = page.surface();
        let mut links = vec![];
        for op in ops {
            match op {
                Draw::Text {
                    x,
                    y,
                    text,
                    size,
                    style,
                } => {
                    let color = if style.error {
                        [155, 37, 37]
                    } else if style.link.is_some() {
                        [36, 81, 122]
                    } else if style.muted {
                        [82, 97, 112]
                    } else {
                        [25, 30, 36]
                    };
                    surface.set_fill(Some(Fill {
                        paint: rgb::Color::new(color[0], color[1], color[2]).into(),
                        ..Default::default()
                    }));
                    surface.draw_text(
                        Point::from_xy(*x, *y),
                        fonts.fonts[style.font()].clone(),
                        *size,
                        text,
                        false,
                        TextDirection::Auto,
                    );
                    if let Some(url) = &style.link {
                        if let Some(rect) = Rect::from_xywh(
                            *x,
                            *y - size,
                            fonts.width(text, *size, style).max(0.1),
                            size * 1.2,
                        ) {
                            links.push(Annotation::new_link(
                                LinkAnnotation::new(
                                    rect,
                                    Target::Action(LinkAction::new(url.clone()).into()),
                                ),
                                None,
                            ));
                        }
                    }
                }
                Draw::Svg { x, y, w, h, tree } => {
                    surface.push_transform(&Transform::from_translate(*x, *y));
                    surface
                        .draw_svg(tree, Size::from_wh(*w, *h).unwrap(), SvgSettings::default())
                        .ok_or("Could not render barcode SVG")?;
                    surface.pop();
                }
                Draw::Image { x, y, w, h, image } => {
                    surface.push_transform(&Transform::from_translate(*x, *y));
                    surface.draw_image(image.clone(), Size::from_wh(*w, *h).unwrap());
                    surface.pop();
                }
                Draw::Box { x, y, w, h, color } => {
                    if let Some(rect) = Rect::from_xywh(*x, *y, *w, *h) {
                        let mut path = PathBuilder::new();
                        path.push_rect(rect);
                        surface.set_fill(Some(Fill {
                            paint: rgb::Color::new(color[0], color[1], color[2]).into(),
                            ..Default::default()
                        }));
                        surface.draw_path(&path.finish().unwrap());
                    }
                }
            }
        }
        if !codes_only {
            let text = format!("Dev Toolbox  |  {} / {}", index + 1, pages.len());
            surface.set_fill(Some(Fill {
                paint: rgb::Color::new(82, 97, 112).into(),
                ..Default::default()
            }));
            surface.draw_text(
                Point::from_xy(
                    WIDTH - MARGIN - fonts.width(&text, 7.0, &Style::default()),
                    HEIGHT - 18.0,
                ),
                fonts.fonts[0].clone(),
                7.0,
                &text,
                false,
                TextDirection::Auto,
            );
        }
        surface.finish();
        for link in links {
            page.add_annotation(link);
        }
        page.finish();
    }
    doc.finish()
        .map_err(|e| format!("Could not build PDF: {e:?}"))
}

#[derive(Default)]
pub struct PdfJobs(std::sync::Mutex<HashMap<String, Arc<AtomicBool>>>);
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress {
    job_id: String,
    message: String,
}
#[tauri::command]
pub async fn export_test_case_pdf(
    app: tauri::AppHandle,
    jobs: tauri::State<'_, PdfJobs>,
    job_id: String,
    content: CaseContent,
    project_name: String,
    file_path: String,
    codes_only: bool,
) -> Result<PdfResult, String> {
    use tauri::Emitter;
    if job_id.is_empty() || job_id.len() > 100 {
        return Err("Invalid PDF job ID".into());
    }
    let cancelled = Arc::new(AtomicBool::new(false));
    {
        let mut active = jobs.0.lock().map_err(|e| e.to_string())?;
        if active.contains_key(&job_id) {
            return Err("PDF job is already running".into());
        }
        active.insert(job_id.clone(), cancelled.clone());
    }
    // Acknowledge registration so an early UI cancellation can be retried safely.
    let _ = app.emit(
        "test-plan-pdf-progress",
        Progress {
            job_id: job_id.clone(),
            message: "Preparing PDF…".into(),
        },
    );
    let progress_id = job_id.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        export(
            &content,
            &project_name,
            &file_path,
            codes_only,
            &cancelled,
            |message| {
                let _ = app.emit(
                    "test-plan-pdf-progress",
                    Progress {
                        job_id: progress_id.clone(),
                        message,
                    },
                );
            },
        )
    })
    .await
    .map_err(|e| e.to_string());
    jobs.0.lock().map_err(|e| e.to_string())?.remove(&job_id);
    result?
}
#[tauri::command]
pub fn cancel_test_case_pdf(jobs: tauri::State<'_, PdfJobs>, job_id: String) -> Result<(), String> {
    if let Some(token) = jobs.0.lock().map_err(|e| e.to_string())?.get(&job_id) {
        token.store(true, Ordering::Relaxed);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> CaseContent {
        serde_json::from_value(serde_json::json!({"schemaVersion":1,"title":"Checkout · Cafea și ceai · Проверка","descriptionMarkdown":"# Scan products\n\n**Every entry** must appear.\n\n- [x] Prepared\n- [ ] Verify\n\n| Format | Result |\n| --- | --- |\n| QR | Pass |\n\n```json\n{\"ready\": true}\n```\n\n<script>alert(1)</script>\n\n[Safe](https://example.com/source) [Unsafe](javascript:alert(1))","lists":[{"id":"l1","name":"Products","products":[{"id":"p1","title":"First duplicate","text":"0001","type":"QR Code","imageUrl":"","description":"Preserve this description"},{"id":"p2","title":"Second duplicate","text":"0001","type":"QR Code","imageUrl":"","description":""},{"id":"p3","title":"Invalid EAN","text":"123","type":"EAN-13","imageUrl":"","description":""}]},{"id":"l2","name":"Returns","products":[{"id":"p4","title":"Return crate","text":"RETURN-001","type":"Code128","imageUrl":"","description":""}]},{"id":"l3","name":"Empty list","products":[]}]})).unwrap()
    }
    fn read_pdf(path: &std::path::Path) -> (lopdf::Document, String) {
        let pdf = lopdf::Document::load(path).unwrap();
        let pages: Vec<_> = pdf.get_pages().keys().copied().collect();
        let text = pdf.extract_text(&pages).unwrap();
        (pdf, text)
    }
    #[test]
    fn full_pdf_preserves_unicode_metadata_duplicates_markdown_and_failed_codes() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("full.pdf");
        let source = fixture();
        let result = export(
            &source,
            "Project",
            path.to_str().unwrap(),
            false,
            &AtomicBool::new(false),
            |_| {},
        )
        .unwrap();
        assert_eq!(result.failed_codes, 1);
        let (pdf, text) = read_pdf(&path);
        for expected in [
            source.title.as_str(),
            "First duplicate",
            "Second duplicate",
            "Preserve this description",
            "123",
            "RETURN-001",
            "No entries in this list.",
            "[x]",
            "[ ]",
            "Format",
            "Result",
            "Pass",
            "ready",
            "Every entry",
            "Dev Toolbox",
        ] {
            assert!(text.contains(expected), "Missing {expected}: {text}");
        }
        assert!(text.find("First duplicate") < text.find("Second duplicate"));
        assert!(!text.contains("alert(1)"));
        let bytes = std::fs::read(path).unwrap();
        assert!(bytes.starts_with(b"%PDF-"));
        assert!(!bytes.windows(11).any(|bytes| bytes == b"javascript:"));
        assert!(pdf
            .objects
            .values()
            .filter_map(|o| o.as_dict().ok())
            .any(|d| d
                .get(b"Subtype")
                .and_then(lopdf::Object::as_name)
                .is_ok_and(|v| v == b"Type0")));
    }
    #[test]
    fn codes_only_pdf_omits_case_details_and_keeps_values_under_codes() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("codes.pdf");
        let source = fixture();
        export(
            &source,
            "Project",
            path.to_str().unwrap(),
            true,
            &AtomicBool::new(false),
            |_| {},
        )
        .unwrap();
        let (_, text) = read_pdf(&path);
        for expected in [
            "First duplicate",
            "Second duplicate",
            "0001",
            "RETURN-001",
            "Invalid EAN",
        ] {
            assert!(text.contains(expected), "Missing {expected}: {text}");
        }
        for excluded in [
            source.title.as_str(),
            "Project",
            "Scan products",
            "Preserve this description",
            "Dev Toolbox",
            "Value:",
        ] {
            assert!(!text.contains(excluded), "Unexpected {excluded}");
        }
    }
    #[test]
    fn captions_preserve_short_values_and_shorten_long_payloads_for_all_formats() {
        let fonts = Fonts::new().unwrap();
        let mut source = fixture();
        for kind in ["EAN-13", "Code128", "DataMatrix", "QR Code"] {
            let product = &mut source.lists[0].products[0];
            product.code_type = kind.into();
            product.text = if kind == "EAN-13" {
                "4006381333931".into()
            } else {
                "ABCDEFGHIJ".repeat(10)
            };
            let asset = match code_asset(product) {
                Ok(code) => Asset {
                    code: Some(code),
                    ..Default::default()
                },
                Err(error) => Asset {
                    error: Some(error),
                    ..Default::default()
                },
            };
            let f = header(&fonts, product, &asset, 230.0, true, 1);
            let labels: Vec<_> = f
                .ops
                .iter()
                .filter_map(|op| {
                    if let Draw::Text { text, size, .. } = op {
                        if *size == 7.0 {
                            Some(text.as_str())
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                })
                .collect();
            let caption = labels.join("");
            if kind == "EAN-13" {
                assert_eq!(caption, "4006381333931");
            } else {
                assert!(caption.starts_with("ABCDEFGHIJ"));
                assert!(caption.ends_with('…'));
                assert!(caption.chars().count() <= 64);
            }
        }
    }
    #[test]
    fn long_content_flows_without_losing_values_or_descriptions() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("long.pdf");
        let mut source = fixture();
        let value = "LONG".repeat(1000);
        let description = "Repeated details ".repeat(1000);
        source.lists[0].products[0].text = value.clone();
        source.lists[0].products[0].description = description.clone();
        export(
            &source,
            "Project",
            path.to_str().unwrap(),
            false,
            &AtomicBool::new(false),
            |_| {},
        )
        .unwrap();
        let (pdf, text) = read_pdf(&path);
        assert!(pdf.get_pages().len() > 2);
        let compact: String = text.chars().filter(|c| !c.is_whitespace()).collect();
        assert!(compact.contains(&value));
        // Footers appear between page fragments in extracted text.
        assert_eq!(text.matches("Repeated").count(), 1000);
        assert_eq!(text.matches("details").count(), 1000);
    }
    #[test]
    fn compact_description_fits_one_page_and_full_codes_have_bounded_height() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("compact.pdf");
        let mut source = fixture();
        source.lists = vec![test_plans::CodeList {
            id: "empty".into(),
            name: "Empty".into(),
            products: vec![],
        }];
        source.description_markdown=(0..8).map(|i|format!("## Test section {i}\n\n{}\n\n- Confirm the expected value.\n- Record the actual value.","Verify the expected product value and record the result. ".repeat(7))).collect::<Vec<_>>().join("\n\n");
        export(
            &source,
            "Project",
            path.to_str().unwrap(),
            false,
            &AtomicBool::new(false),
            |_| {},
        )
        .unwrap();
        assert_eq!(read_pdf(&path).0.get_pages().len(), 1);
        let product = Product {
            id: "p".into(),
            title: "Code128".into(),
            text: "ISP001-CRATE-1".into(),
            code_type: "Code128".into(),
            image_url: "".into(),
            description: "".into(),
        };
        let asset = Asset {
            code: Some(code_asset(&product).unwrap()),
            ..Default::default()
        };
        let card = header(&Fonts::new().unwrap(), &product, &asset, BODY, false, 1);
        for op in card.ops {
            if let Draw::Svg { h, .. } = op {
                assert!(h <= 42.0);
            }
        }
    }
    #[test]
    fn cancellation_and_invalid_content_never_overwrite_an_existing_export() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("keep.pdf");
        std::fs::write(&path, b"previous export").unwrap();
        let token = AtomicBool::new(false);
        assert!(export(
            &fixture(),
            "Project",
            path.to_str().unwrap(),
            false,
            &token,
            |message| {
                if message == "Building PDF pages…" {
                    token.store(true, Ordering::Relaxed);
                }
            }
        )
        .is_err());
        assert_eq!(std::fs::read(&path).unwrap(), b"previous export");
        let mut invalid = fixture();
        invalid.schema_version = 2;
        assert!(export(
            &invalid,
            "Project",
            path.to_str().unwrap(),
            false,
            &AtomicBool::new(false),
            |_| {}
        )
        .is_err());
        assert_eq!(std::fs::read(path).unwrap(), b"previous export");
    }
    #[test]
    fn table_cells_flow_across_pages_and_retain_the_last_row() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("table.pdf");
        let mut source = fixture();
        source.description_markdown = format!(
            "| Field | Value |\n|---|---|\n{}",
            (0..200)
                .map(|i| format!("| Row {i} | {} |", "Text ".repeat(15)))
                .collect::<Vec<_>>()
                .join("\n")
        );
        export(
            &source,
            "Project",
            path.to_str().unwrap(),
            false,
            &AtomicBool::new(false),
            |_| {},
        )
        .unwrap();
        let (pdf, text) = read_pdf(&path);
        assert!(pdf.get_pages().len() > 2);
        assert!(text.contains("Row 199"));
        assert!(text.matches("Field").count() > 1);
    }
    #[test]
    fn list_heading_stays_with_the_first_product_row() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("heading.pdf");
        let mut source = fixture();
        source.description_markdown = "Filler.\n\n".repeat(45);
        source.lists[0].name = format!("Unique group {}", "W".repeat(180));
        for product in &mut source.lists[0].products {
            product.description = "Details ".repeat(35);
        }
        export(
            &source,
            "Project",
            path.to_str().unwrap(),
            false,
            &AtomicBool::new(false),
            |_| {},
        )
        .unwrap();
        let (pdf, _) = read_pdf(&path);
        for page in pdf.get_pages().keys() {
            let text = pdf.extract_text(&[*page]).unwrap();
            if text.contains("Unique group") {
                assert!(
                    text.contains("First duplicate"),
                    "Orphaned heading on page {page}"
                );
            }
        }
    }
    #[test]
    fn invalid_images_are_rejected_and_all_supported_image_formats_decode() {
        assert!(product_image("data:image/png;base64,AAAA").is_err());
        for format in [
            image::ImageFormat::Png,
            image::ImageFormat::Jpeg,
            image::ImageFormat::Gif,
            image::ImageFormat::WebP,
        ] {
            let pixels = image::DynamicImage::ImageRgb8(image::RgbImage::from_pixel(
                2,
                2,
                image::Rgb([20, 40, 60]),
            ));
            let mut bytes = Cursor::new(vec![]);
            pixels.write_to(&mut bytes, format).unwrap();
            let data = format!(
                "data:image/fixture;base64,{}",
                base64::prelude::BASE64_STANDARD.encode(bytes.into_inner())
            );
            assert!(product_image(&data).is_ok(), "{format:?}");
        }
    }
}
