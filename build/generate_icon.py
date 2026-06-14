"""Generate ICO and PNG icons for Mimo Chat using pure Pillow"""
import math
from PIL import Image, ImageDraw

SIZE = 512

def create_icon(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    s = size / 512  # scale factor

    # --- Background: rounded square with gradient ---
    corner_r = int(108 * s)

    for i in range(size):
        t = i / size
        r_c = int(99 + (59 - 99) * t)
        g_c = int(102 + (130 - 102) * t)
        b_c = int(241 + (246 - 241) * t)
        draw.rectangle(
            [0, i, size, i + 1],
            fill=(r_c, g_c, b_c, 255)
        )

    # Round corners
    mask = Image.new("L", (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([0, 0, size, size], radius=corner_r, fill=255)

    bg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bg.paste(img, mask=mask)
    img = bg
    draw = ImageDraw.Draw(img)

    # --- Decorative circles ---
    draw.ellipse(
        [int(300 * s), int(20 * s), int(520 * s), int(240 * s)],
        fill=(255, 255, 255, 15)
    )
    draw.ellipse(
        [int(30 * s), int(320 * s), int(220 * s), int(510 * s)],
        fill=(255, 255, 255, 10)
    )

    # --- Main chat bubble (larger, behind) ---
    bx, by, bw, bh = int(110 * s), int(95 * s), int(280 * s), int(230 * s)
    shadow_off = int(5 * s)

    # Shadow
    draw.rounded_rectangle(
        [bx + shadow_off, by + shadow_off, bx + bw + shadow_off, by + bh + shadow_off],
        radius=int(30 * s),
        fill=(0, 0, 0, 40)
    )
    # Body
    draw.rounded_rectangle(
        [bx, by, bx + bw, by + bh],
        radius=int(30 * s),
        fill=(255, 255, 255, 242)
    )
    # Tail
    tail_x = bx + int(60 * s)
    draw.polygon([
        (tail_x, by + bh),
        (tail_x - int(22 * s), by + bh + int(50 * s)),
        (tail_x + int(38 * s), by + bh),
    ], fill=(255, 255, 255, 242))

    # --- Smaller chat bubble (front) ---
    sx, sy, sw, sh = int(170 * s), int(175 * s), int(240 * s), int(185 * s)

    # Shadow
    draw.rounded_rectangle(
        [sx + shadow_off, sy + shadow_off, sx + sw + shadow_off, sy + sh + shadow_off],
        radius=int(26 * s),
        fill=(0, 0, 0, 30)
    )
    # Body
    draw.rounded_rectangle(
        [sx, sy, sx + sw, sy + sh],
        radius=int(26 * s),
        fill=(255, 255, 255, 235)
    )
    # Tail (right side)
    tail_x2 = sx + sw - int(60 * s)
    draw.polygon([
        (tail_x2, sy + sh),
        (tail_x2 + int(22 * s), sy + sh + int(45 * s)),
        (tail_x2 - int(35 * s), sy + sh),
    ], fill=(255, 255, 255, 235))

    # --- Three dots in main bubble ---
    dot_r = int(13 * s)
    dot_y = int(225 * s)
    dot_colors = [
        (99, 102, 241, 230),
        (59, 130, 246, 230),
        (37, 99, 235, 230),
    ]
    for i, color in enumerate(dot_colors):
        cx = int(205 * s) + int(48 * s) * i
        draw.ellipse(
            [cx - dot_r, dot_y - dot_r, cx + dot_r, dot_y + dot_r],
            fill=color
        )

    # --- Text lines in smaller bubble ---
    line_h = int(8 * s)
    line_r = int(4 * s)
    line_x = int(200 * s)
    lines = [
        (int(268 * s), (99, 102, 241, 130)),
        (int(235 * s), (59, 130, 246, 110)),
        (int(252 * s), (99, 102, 241, 90)),
    ]
    for i, (lw, color) in enumerate(lines):
        ly = int(280 * s) + int(24 * s) * i
        draw.rounded_rectangle(
            [line_x, ly, line_x + lw, ly + line_h],
            radius=line_r,
            fill=color
        )

    return img


# Generate source at 512
source = create_icon(512)

# Save 256x256 PNG
img256 = source.resize((256, 256), Image.LANCZOS)
img256.save("icon.png", format="PNG")
print("Created: icon.png (256x256)")

# Generate ICO: Pillow requires all images passed explicitly
ico_sizes = [16, 24, 32, 48, 64, 128, 256]
ico_images = []
for s in ico_sizes:
    ico_images.append(source.resize((s, s), Image.LANCZOS))

# Use the largest image as base, append the rest
ico_images[-1].save(
    "icon.ico",
    format="ICO",
    sizes=[(s, s) for s in ico_sizes],
    append_images=ico_images[:-1],
)
print("Created: icon.ico (multi-size)")

# Verify
from PIL import IcoImagePlugin
ico = IcoImagePlugin.IcoImageFile("icon.ico")
print(f"ICO sizes inside: {ico.info.get('sizes', 'unknown')}")
print("Done!")
