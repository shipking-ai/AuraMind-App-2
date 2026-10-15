"""Generate preview-aura-font.html specimen from the built AuraSans TTF."""
import html
from fontTools.ttLib import TTFont

TTF = "public/fonts/AuraSans-Regular.ttf"
OUT = "preview-aura-font.html"

f = TTFont(TTF)
cmap = f.getBestCmap()
glyf = f["glyf"]

entries = sorted(
    (cp, name) for cp, name in cmap.items() if name not in (".notdef", "space") and not glyf[name].isComposite()
)

GROUPS = [
    ("Uppercase", 0x41, 0x5A),
    ("Lowercase", 0x61, 0x7A),
    ("Digits", 0x30, 0x39),
    ("Punctuation", 0x20, 0x2F),
    ("Punctuation 2", 0x3A, 0x40),
    ("Brackets", 0x5B, 0x60),
    ("Symbols", 0x7B, 0x7E),
    ("Latin-1", 0xA0, 0xFF),
    ("Extended", 0x100, 0x17F),
    ("Extended Additional", 0x1E00, 0x1EFF),
    ("Greek", 0x370, 0x3FF),
    ("Cyrillic", 0x400, 0x4FF),
    ("General Punctuation", 0x2000, 0x206F),
    ("Currency", 0x20A0, 0x20CF),
    ("Misc", 0x180, 0x24FF),
]


def cell(cp, name):
    ch = chr(cp)
    safe = html.escape(ch)
    return (
        f'<div class="cell"><div class="glyph">{safe}</div>'
        f'<div class="meta">U+{cp:04X}<br>{html.escape(name)}</div></div>'
    )


def section(title, lo, hi):
    rows = [cell(cp, cmap[cp]) for cp, name in entries if lo <= cp <= hi]
    if not rows:
        return ""
    return f'<h2>{title}</h2><div class="grid">{"".join(rows)}</div>'


body = []
body.append(f'<h2>Full glyph set — {len(entries)} characters</h2>')

for title, lo, hi in GROUPS:
    body.append(section(title, lo, hi))

extra = [cp for cp, _ in entries if cp > 0x24FF and not (0xE000 <= cp <= 0xF8FF)]
if extra:
    body.append(section("Extra (beyond U+24FF)", 0x2500, 0x10FFFF))

PANG = [
    ("The quick brown fox jumps over the lazy dog", 48),
    ("Pack my box with five dozen liquor jugs", 32),
    ("Sphinx of black quartz, judge my vow", 28),
    ("AURA SANS — BonaMind Brand Display", 40),
    ("0123456789 $ € £ ¥ ₹ ¢ % ‰ & @ # *", 30),
    ("“Smart quotes” ‘and’ — dashes … ellipses", 26),
    ("À Â Ä Æ Ç È É Ê Ë Î Ï Ñ Ò Ó Ô Ö Ù Û Ü Ÿ ß", 30),
]

sizes = "".join(
    f'<div class="pang" style="font-size:{size}px">{html.escape(text)}</div>' for text, size in PANG
)

page = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AuraSans — Specimen</title>
<style>
  @font-face {{
    font-family: 'AuraSans';
    src: url('public/fonts/AuraSans-Regular.woff2') format('woff2'),
         url('public/fonts/AuraSans-Regular.ttf') format('truetype');
    font-weight: 400;
    font-style: normal;
  }}
  @font-face {{
    font-family: 'AuraScript';
    src: url('public/fonts/AuraScript-Regular.woff2') format('woff2'),
         url('public/fonts/AuraScript-Regular.ttf') format('truetype');
    font-weight: 400;
    font-style: normal;
  }}
  @font-face {{
    font-family: 'AuraSans';
    src: url('public/fonts/AuraSans-Bold.woff2') format('woff2'),
         url('public/fonts/AuraSans-Bold.ttf') format('truetype');
    font-weight: 700;
    font-style: normal;
  }}
  @font-face {{
    font-family: 'AuraSans';
    src: url('public/fonts/AuraSans-Italic.woff2') format('woff2'),
         url('public/fonts/AuraSans-Italic.ttf') format('truetype');
    font-weight: 400;
    font-style: italic;
  }}
  @font-face {{
    font-family: 'AuraSans';
    src: url('public/fonts/AuraSans-BoldItalic.woff2') format('woff2'),
         url('public/fonts/AuraSans-BoldItalic.ttf') format('truetype');
    font-weight: 700;
    font-style: italic;
  }}
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{
    font-family: 'AuraSans', sans-serif;
    background: #f4f1ea;
    color: #1d1b16;
    padding: 48px 32px 96px;
    max-width: 1180px;
    margin: 0 auto;
    font-variation-settings: normal;
  }}
  .bar {{ position: sticky; top: 0; z-index: 5; background: rgba(244,241,234,.92);
         backdrop-filter: blur(6px); padding: 14px 0 12px; margin-bottom: 24px;
         border-bottom: 1px solid rgba(0,0,0,.12); display: flex; align-items: center; gap: 12px; }}
  .bar .tag {{ font-size: 11px; letter-spacing: 2px; text-transform: uppercase; opacity: .5; }}
  .opt {{ font-size: 13px; padding: 6px 16px; border-radius: 999px; cursor: pointer;
         border: 1px solid rgba(0,0,0,.18); background: #fff; color: #1d1b16;
         user-select: none; }}
  .opt.active {{ background: #1d1b16; color: #f4f1ea; border-color: #1d1b16; }}
  h1 {{ font-size: 44px; letter-spacing: 1px; margin-bottom: 8px; }}
  .sub {{ font-size: 15px; opacity: .55; margin-bottom: 40px; letter-spacing: 2px; text-transform: uppercase; }}
  .pang {{ margin: 18px 0; line-height: 1.25; }}
  h2 {{ font-size: 13px; letter-spacing: 3px; text-transform: uppercase; opacity: .45;
        margin: 48px 0 18px; border-bottom: 1px solid rgba(0,0,0,.12); padding-bottom: 8px; }}
  .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(64px, 1fr)); gap: 8px; }}
  .cell {{ background: #fff; border-radius: 8px; padding: 10px 4px 8px; text-align: center;
           box-shadow: 0 1px 2px rgba(0,0,0,.06); }}
  .glyph {{ font-size: 30px; line-height: 1.15; height: 40px; }}
  .meta {{ font-size: 9px; color: #999; line-height: 1.35; }}
  .note {{ margin-top: 48px; font-size: 13px; opacity: .5; line-height: 1.6; }}
</style>
</head>
<body>
  <div class="bar">
    <span class="tag">Family</span>
    <span class="opt fam" data-fam="AuraSans">Sans</span>
    <span class="opt fam" data-fam="AuraScript">Script</span>
    <span class="tag">Style</span>
    <span class="opt" data-w="400" data-st="normal">Regular</span>
    <span class="opt" data-w="700" data-st="normal">Bold</span>
    <span class="opt" data-w="400" data-st="italic">Italic</span>
    <span class="opt" data-w="700" data-st="italic">Bold Italic</span>
  </div>
  <h1>AuraSans</h1>
  <div class="sub">Custom geometric sans — specimen</div>
  {sizes}
  {''.join(body)}
  <div class="note">
    Built from {len(entries)} glyph definitions. Rendered live from
    <code>public/fonts/AuraSans-*.woff2</code> / <code>AuraScript-Regular.woff2</code> via @font-face.
  </div>
<script>
  const sans = document.querySelectorAll('.opt.fam');
  const style = document.querySelectorAll('.opt:not(.fam)');
  sans.forEach(o => o.addEventListener('click', () => {{
    sans.forEach(x => x.classList.remove('active'));
    o.classList.add('active');
    document.body.style.fontFamily = "'" + o.dataset.fam + "', cursive";
  }}));
  style.forEach(o => o.addEventListener('click', () => {{
    style.forEach(x => x.classList.remove('active'));
    o.classList.add('active');
    document.body.style.fontWeight = o.dataset.w;
    document.body.style.fontStyle = o.dataset.st;
  }}));
  sans[0].classList.add('active');
  style[0].classList.add('active');
</script>
</body>
</html>
"""

with open(OUT, "w", encoding="utf-8") as fh:
    fh.write(page)

print(f"wrote {OUT} with {len(entries)} glyphs")
