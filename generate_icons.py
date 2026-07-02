from PIL import Image, ImageDraw

NAVY = (33, 42, 56, 255)      # #212A38
BRASS = (173, 122, 44, 255)   # #AD7A2C
WHITE = (247, 248, 243, 255)  # #F7F8F3


def base_square(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, 0, size, size], fill=NAVY)
    return img, draw


def draw_stamp(draw, size, scale):
    cx = cy = size / 2
    r = (size * scale) / 2
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=BRASS)

    stroke_w = max(int(size * 0.05), 4)
    p1 = (cx - r * 0.42, cy + r * 0.02)
    p2 = (cx - r * 0.08, cy + r * 0.36)
    p3 = (cx + r * 0.48, cy - r * 0.34)
    draw.line([p1, p2, p3], fill=WHITE, width=stroke_w, joint='curve')
    for pt in (p1, p2, p3):
        draw.ellipse([pt[0] - stroke_w / 2, pt[1] - stroke_w / 2,
                       pt[0] + stroke_w / 2, pt[1] + stroke_w / 2], fill=WHITE)


def rounded(img, size, radius_pct=0.22):
    mask = Image.new('L', (size, size), 0)
    mdraw = ImageDraw.Draw(mask)
    mdraw.rounded_rectangle([0, 0, size, size], radius=int(size * radius_pct), fill=255)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def make_icon(size, maskable=False):
    img, draw = base_square(size)
    scale = 0.60 if maskable else 0.70
    draw_stamp(draw, size, scale)
    if maskable:
        return img  # full-bleed square; OS applies its own mask
    return rounded(img, size)


make_icon(192).save('icons/icon-192.png')
make_icon(512).save('icons/icon-512.png')
make_icon(512, maskable=True).save('icons/icon-maskable-512.png')

apple = make_icon(180).convert('RGB')  # Apple wants no alpha channel
apple.save('icons/apple-touch-icon.png')

print('Icons generated.')
