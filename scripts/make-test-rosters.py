#!/usr/bin/env python3
"""Draws synthetic roster images in the same layout as the real banquets
roster, for the live tests in tests/live/. Meng's row in synthetic-roster.png
matches the expected-result table in the README.

    python3 scripts/make-test-rosters.py      # needs Pillow

Writes PNG/JPG files into tests/live/images/.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = Path(__file__).resolve().parent.parent / "tests" / "live" / "images"
FONT = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"
BOLD = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"

DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]
DATES = ["19-Oct-26", "20-Oct-26", "21-Oct-26", "22-Oct-26", "23-Oct-26", "24-Oct-26", "25-Oct-26"]
FUNCTIONS = [["195P DDPCT", "", "80P LUNCH", "", "300P GALA", "220P WEDDING", ""],
             ["", "40P MEETING", "", "120P DDPCT", "", "", "60P BRUNCH"]]
RED = "RED"

MENG = ["0730 - 1700", "0630 - 1600", "0615 - 1600", "0800 - 1800", "OFF", "1600 - 2700", RED]
STAFF = [
    ("Alex (FT)", ["0700 - 1530", "0700 - 1530", "OFF", "OFF", "1500 - 2330", "1500 - 2600", "0900 - 1730"]),
    ("Priya (FT)", ["OFF", "1400 - 2230", "1400 - 2230", "0800 - 1630", "1600 - 2700", "OFF", RED]),
    ("Jordan (PT)", ["", "", "0700 - 1300", "", "1700 - 2500", "1600 - 2700", ""]),
    ("Sam (FT)", ["0730 - 1600 Purchasing", "0730 - 1600 Purchasing", "0730 - 1600", "OFF", "OFF", "1500 - 2600", "1500 - 2330"]),
    ("Mengyu (PT)", ["1600 - 2400", "", "", "1700 - 2300", "1600 - 2700", "1600 - 2700", "OFF"]),
    ("Meng (PT)", MENG),
    ("Chris (PT)", [RED, RED, "0600 - 1430", "0600 - 1430", "", "1600 - 2700", "1000 - 1830"]),
    ("Taylor (FT)", ["1400 - 2230", "1400 - 2230", "OFF", "OFF", "1400 - 2230", "1500 - 2700", "1400 - 2230"]),
    ("Riley (PT)", ["", "0700 - 1200", "", "", "1700 - 2400", "1700 - 2600", ""]),
    ("Morgan (FT)", ["0630 - 1500", "OFF", "OFF", "0630 - 1500", "0630 - 1500", "0630 - 1500", "0630 - 1500"]),
]

NAME_W, DAY_W, ROW_H, MARGIN = 230, 175, 42, 30


def draw_roster(staff, path):
    font = ImageFont.truetype(FONT, 19)
    bold = ImageFont.truetype(BOLD, 19)
    title_font = ImageFont.truetype(BOLD, 28)
    width = MARGIN * 2 + NAME_W + DAY_W * 7
    rows = 2 + len(FUNCTIONS) + len(staff)
    height = MARGIN * 2 + 60 + ROW_H * rows
    image = Image.new("RGB", (width, height), "white")
    d = ImageDraw.Draw(image)
    d.text((width // 2, MARGIN + 22), "BANQUETS TEAM ROSTER 19/10 TO 25/10", font=title_font, fill="black", anchor="mm")

    top = MARGIN + 60

    def cell(col, row, text, fill=None, font=font):
        x0 = MARGIN + (0 if col == 0 else NAME_W + (col - 1) * DAY_W)
        x1 = x0 + (NAME_W if col == 0 else DAY_W)
        y0 = top + row * ROW_H
        y1 = y0 + ROW_H
        if fill:
            d.rectangle([x0, y0, x1, y1], fill=fill)
        d.rectangle([x0, y0, x1, y1], outline="#555555", width=1)
        if text:
            if col == 0:
                d.text((x0 + 10, (y0 + y1) // 2), text, font=font, fill="black", anchor="lm")
            else:
                d.text(((x0 + x1) // 2, (y0 + y1) // 2), text, font=font, fill="black", anchor="mm")

    cell(0, 0, "NAME", "#d9d9d9", bold)
    cell(0, 1, "", "#d9d9d9")
    for i, (day, date) in enumerate(zip(DAYS, DATES)):
        cell(i + 1, 0, day, "#d9d9d9", bold)
        cell(i + 1, 1, date, "#d9d9d9")
    for r, codes in enumerate(FUNCTIONS):
        cell(0, 2 + r, "FUNCTIONS" if r == 0 else "", "#fff2cc", bold)
        for i, code in enumerate(codes):
            cell(i + 1, 2 + r, code, "#fff2cc", bold)
    for r, (name, cells) in enumerate(staff):
        row = 2 + len(FUNCTIONS) + r
        cell(0, row, name)
        for i, text in enumerate(cells):
            if text == RED:
                cell(i + 1, row, "", "#ff0000")
            elif "Purchasing" in text:
                cell(i + 1, row, text.replace(" Purchasing", ""), None, ImageFont.truetype(FONT, 16))
                x0 = MARGIN + NAME_W + i * DAY_W
                y0 = top + row * ROW_H
                d.text((x0 + DAY_W // 2, y0 + ROW_H - 3), "Purchasing", font=ImageFont.truetype(FONT, 12), fill="#333333", anchor="mb")
            else:
                cell(i + 1, row, text)
    image.save(path)
    return image, top


def photo_of(image, path):
    """A phone photo of a screen: a little rotation, perspective, blur and JPEG noise."""
    w, h = image.size
    canvas = Image.new("RGB", (int(w * 1.15), int(h * 1.25)), "#7a7a7a")
    canvas.paste(image, (int(w * 0.07), int(h * 0.12)))
    canvas = canvas.rotate(2.5, resample=Image.BICUBIC, fillcolor="#7a7a7a")
    cw, ch = canvas.size
    canvas = canvas.transform(
        canvas.size,
        Image.QUAD,
        (int(cw * 0.015), 0, 0, ch, cw, int(ch * 0.985), int(cw * 0.98), int(ch * 0.01)),
        resample=Image.BICUBIC,
        fillcolor="#7a7a7a",
    )
    canvas = canvas.filter(ImageFilter.GaussianBlur(1.6))
    canvas.save(path, quality=62)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    roster, top = draw_roster(STAFF, OUT / "synthetic-roster.png")
    photo_of(roster, OUT / "synthetic-photo.jpg")

    meng_row = 2 + len(FUNCTIONS) + [name for name, _ in STAFF].index("Meng (PT)")
    roster.crop((0, 0, roster.width, top + meng_row * ROW_H - 2)).save(OUT / "synthetic-cropped.png")

    notes = [(n, c) if n != "Meng (PT)" else (n, ["0730 - 1700", "0630 - 1600", "", "0800 - 1800 Purchasing", "OFF", "1600 - 2700", RED]) for n, c in STAFF]
    draw_roster(notes, OUT / "synthetic-notes.png")

    twins = [(n if n != "Mengyu (PT)" else "Meng (FT)", c) for n, c in STAFF]
    draw_roster(twins, OUT / "synthetic-two-mengs.png")
    print("wrote", ", ".join(sorted(p.name for p in OUT.iterdir())))


if __name__ == "__main__":
    main()
