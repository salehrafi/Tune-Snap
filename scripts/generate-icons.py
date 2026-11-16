"""Generate Tune Snap's PNG icons.

Run once with Pillow available:
    python scripts/generate-icons.py

v2 artwork: a sharp-edged ink-black tile with a red-orange signal bar and a
white note, rasterized at 1024px and downscaled so the small sizes stay crisp.
Output lands in public/icon/.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SIZE = 1024
BAR_HEIGHT = 128
OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "icon"
FONT_PATH = Path("C:/Windows/Fonts/seguisym.ttf")

INK = (10, 10, 10, 255)
SIGNAL = (255, 90, 38, 255)
PAPER = (255, 255, 255, 255)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    icon = Image.new("RGBA", (SIZE, SIZE), INK)
    draw = ImageDraw.Draw(icon)
    draw.rectangle((0, SIZE - BAR_HEIGHT, SIZE - 1, SIZE - 1), fill=SIGNAL)

    font = ImageFont.truetype(str(FONT_PATH), 640)
    glyph = "\u266b"
    left, top, right, bottom = draw.textbbox((0, 0), glyph, font=font)
    width, height = right - left, bottom - top
    usable = SIZE - BAR_HEIGHT
    position = ((SIZE - width) / 2 - left, (usable - height) / 2 - top)
    draw.text(position, glyph, font=font, fill=PAPER)

    for size in (16, 32, 48, 128):
        icon.resize((size, size), Image.LANCZOS).save(OUT_DIR / f"{size}.png")
        print(f"wrote {OUT_DIR / f'{size}.png'}")


if __name__ == "__main__":
    main()
