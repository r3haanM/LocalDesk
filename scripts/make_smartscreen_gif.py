"""
Generates docs/screenshots/troubleshoot-smartscreen.gif — a faithful Windows
Defender SmartScreen walkthrough for the README troubleshooting section:
dialog appears -> cursor clicks "More info" -> "Run anyway" appears -> click ->
setup launches. 960x540, matches the existing README GIF dimensions.

Run: python scripts/make_smartscreen_gif.py
"""
from PIL import Image, ImageDraw, ImageFont

W, H = 960, 540
OUT = 'docs/screenshots/troubleshoot-smartscreen.gif'
ICON = 'public/brand/png/local-desk-app-icon-256x256.png'
EXE = 'Local-Desk-Setup-1.0.5-x64.exe'

F = 'C:/Windows/Fonts/segoeui.ttf'
FB = 'C:/Windows/Fonts/segoeuib.ttf'
f_body = ImageFont.truetype(F, 15)
f_small = ImageFont.truetype(F, 13)
f_title = ImageFont.truetype(FB, 17)
f_btn = ImageFont.truetype(F, 15)
f_mono = ImageFont.truetype('C:/Windows/Fonts/consola.ttf', 15)

SHIELD_BLUE = (0, 120, 215)
BTN_BLUE = SHIELD_BLUE


def cursor(d, x, y):
    d.polygon([(x, y), (x, y + 22), (x + 6, y + 16), (x + 10, y + 26),
               (x + 14, y + 24), (x + 10, y + 14), (x + 17, y + 14)],
              fill=(255, 255, 255), outline=(30, 30, 30))
    d.line([(x, y), (x, y + 22)], fill=(30, 30, 30))


def backdrop():
    im = Image.new('RGB', (W, H), (10, 23, 18))
    d = ImageDraw.Draw(im)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=(int(12 + 8 * t), int(28 + 10 * t), int(21 + 8 * t)))
    # downloaded file card
    d.rounded_rectangle([70, 130, 400, 330], 10, fill=(22, 38, 31), outline=(52, 211, 153), width=2)
    icon = Image.open(ICON).resize((72, 72))
    im.paste(icon, (96, 156), icon)
    d.text((96, 246), EXE, fill=(230, 240, 235), font=f_mono)
    d.text((96, 276), '1 file - 113 MB', fill=(150, 170, 162), font=f_small)
    return im, d


def dialog(d, expanded=False, run_hover=False, more_hover=False, dont_hover=False, pressed=None):
    # window
    x0, y0, x1, y1 = 300, 100, 830, 330
    d.rounded_rectangle([x0 + 6, y0 + 10, x1 + 6, y1 + 10], 8, fill=(0, 0, 0, 90))
    d.rounded_rectangle([x0, y0, x1, y1], 8, fill=(245, 246, 247), outline=(200, 203, 208))
    # shield glyph
    d.polygon([(x0 + 30, y0 + 26), (x0 + 52, y0 + 18), (x0 + 74, y0 + 26),
               (x0 + 74, y0 + 52), (x0 + 52, y0 + 72), (x0 + 30, y0 + 52)],
              fill=SHIELD_BLUE)
    d.rectangle([x0 + 49, y0 + 30, x0 + 55, y0 + 46], fill=(255, 255, 255))
    d.rectangle([x0 + 49, y0 + 50, x0 + 55, y0 + 53], fill=(255, 255, 255))
    d.text((x0 + 90, y0 + 24), 'Windows protected your PC', fill=(30, 30, 30), font=f_title)
    d.text((x0 + 30, y0 + 88),
           'Windows Defender SmartScreen prevented an unrecognized app',
           fill=(60, 60, 60), font=f_body)
    d.text((x0 + 30, y0 + 112), 'from starting. Running this app might put your PC at risk.',
           fill=(60, 60, 60), font=f_body)
    d.text((x0 + 30, y0 + 146), EXE, fill=(30, 30, 30), font=f_mono)
    if expanded:
        d.text((x0 + 30, y0 + 172), 'Publisher: Unknown Publisher', fill=(110, 110, 110), font=f_small)

    def btn(x, y, w, h, label, hover=False, pressed_btn=False, primary=False):
        if primary:
            fill = (200, 227, 255) if pressed_btn else ((214, 236, 255) if hover else SHIELD_BLUE)
            d.rounded_rectangle([x, y, x + w, y + h], 4, fill=fill,
                                outline=(20, 90, 158), width=1)
            d.text((x + w // 2, y + h // 2), label, fill=(255, 255, 255) if not pressed_btn else (20, 60, 110),
                   font=f_btn, anchor='mm')
        else:
            d.rounded_rectangle([x, y, x + w, y + h], 4, fill=(233, 234, 236) if hover else (251, 251, 252),
                                outline=(173, 176, 180), width=1)
            d.text((x + w // 2, y + h // 2), label, fill=(30, 30, 30), font=f_btn, anchor='mm')

    by = y1 - 58
    if not expanded:
        btn(x1 - 210, by, 92, 34, "Don't run", hover=dont_hover)
        if more_hover or pressed == 'more':
            d.rounded_rectangle([x1 - 106, by, x1 - 20, by + 34], 4, outline=SHIELD_BLUE, width=1)
        d.text((x1 - 63, by + 17), 'More info', fill=SHIELD_BLUE, font=f_btn, anchor='mm')
    else:
        btn(x1 - 262, by, 144, 34, "Don't run", hover=dont_hover)
        btn(x1 - 106, by, 92, 34, 'Run anyway', hover=run_hover, pressed_btn=(pressed == 'run'), primary=True)
        d.text((x0 + 30, y1 - 76), 'If the file came from a source you trust, click Run anyway.',
               fill=(110, 110, 110), font=f_small)


frames = []

# f1 — dialog appears
im, d = backdrop(); dialog(d); frames.append((im, 1300))

# f2 — cursor moves to More info
im, d = backdrop(); dialog(d, more_hover=True); cursor(d, 700, 300); frames.append((im, 900))

# f3 — expanded dialog with Run anyway
im, d = backdrop(); dialog(d, expanded=True); frames.append((im, 1300))

# f4 — cursor to Run anyway, hover
im, d = backdrop(); dialog(d, expanded=True, run_hover=True); cursor(d, 724, 330); frames.append((im, 900))

# f5 — click pressed
im, d = backdrop(); dialog(d, expanded=True, run_hover=True, pressed='run'); cursor(d, 724, 330); frames.append((im, 350))

# f6 — dialog closed, app launching
im, d = backdrop()
icon = Image.open(ICON).resize((96, 96))
im.paste(icon, (432, 210), icon)
d.text((352, 330), 'Setup running…', fill=(150, 220, 190), font=f_body, anchor='ma')
frames.append((im, 1700))

imgs = [f[0].convert('P', palette=Image.ADAPTIVE, colors=128) for f in frames]
durs = [f[1] for f in frames]
imgs[0].save(OUT, save_all=True, append_images=imgs[1:], duration=durs, loop=0, optimize=True)
print('saved', OUT, W, 'x', H, 'frames:', len(frames))
