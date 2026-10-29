"""Generate Tune Snap's PNG icons.

Run once with Pillow available:
    python scripts/generate-icons.py

The gradient/note artwork is rasterized at 1024px and downscaled so the small
sizes stay crisp. Output lands in public/icon/.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SIZE = 1024
RADIUS = 232
OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "icon"
FONT_PATH = Path("C:/Windows/Fonts/seguisym.ttf")

TOP = (124, 77, 255)
BOTTOM = (255, 77, 141)


def lerp(start: tuple[int, int, int], end: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(round(start[i] + (end[i] - start[i]) * t) for i in range(3))  # type: ignore[return-value]


def gradient() -> Image.Image:
    image = Image.new("RGBA", (SIZE, SIZE))
    pixels = image.load()
    for y in range(SIZE):
        color = lerp(TOP, BOTTOM, y / (SIZE - 1))
        for x in range(SIZE):
            pixels[x, y] = (*color, 255)
    return image


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    background = gradient()
    mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, SIZE - 1, SIZE - 1), radius=RADIUS, fill=255
    )

    icon = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    icon.paste(background, (0, 0), mask)

    font = ImageFont.truetype(str(FONT_PATH), 650)
    glyph = "\u266b"
    draw = ImageDraw.Draw(icon)
    left, top, right, bottom = draw.textbbox((0, 0), glyph, font=font)
    width, height = right - left, bottom - top
    position = ((SIZE - width) / 2 - left, (SIZE - height) / 2 - top - 12)

    # Soft shadow, then the note itself.
    draw.text((position[0] + 10, position[1] + 14), glyph, font=font, fill=(40, 10, 60, 60))
    draw.text(position, glyph, font=font, fill=(255, 255, 255, 255))

    for size in (16, 32, 48, 128):
        icon.resize((size, size), Image.LANCZOS).save(OUT_DIR / f"{size}.png")
        print(f"wrote {OUT_DIR / f'{size}.png'}")


if __name__ == "__main__":
    main()

