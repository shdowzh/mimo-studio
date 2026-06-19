"""Generate ICO and PNG icons for MiMo Studio — OpenClaw coral style"""
from PIL import Image, ImageDraw

SIZE = 1024


def lerp(a: int, b: int, t: float) -> int:
    return int(a + (b - a) * t)


def hex_to_rgba(h: str, alpha: int = 255):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4)) + (alpha,)


def create_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    s = size / SIZE

    # --- Background: rounded square with subtle rose->white gradient ---
    corner_r = int(220 * s)
    bg_top = hex_to_rgba("#FFF1F2")
    bg_bottom = hex_to_rgba("#FFFFFF")

    # Draw vertical gradient
    for y in range(size):
        t = y / size
        r = lerp(bg_top[0], bg_bottom[0], t)
        g = lerp(bg_top[1], bg_bottom[1], t)
        b = lerp(bg_top[2], bg_bottom[2], t)
        draw.rectangle([0, y, size, y + 1], fill=(r, g, b, 255))

    # Round corners via mask
    mask = Image.new("L", (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([0, 0, size, size], radius=corner_r, fill=255)
    bg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bg.paste(img, mask=mask)
    img = bg
    draw = ImageDraw.Draw(img)

    # --- Coral chat bubble ---
    bubble_w = int(560 * s)
    bubble_h = int(480 * s)
    bubble_x = (size - bubble_w) // 2
    bubble_y = (size - bubble_h) // 2 - int(30 * s)
    bubble_r = int(120 * s)
    coral = hex_to_rgba("#FB7185")
    coral_dark = hex_to_rgba("#F43F5E")

    # Soft drop shadow
    shadow_off = int(16 * s)
    shadow_blur = int(32 * s)
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle(
        [bubble_x + shadow_off, bubble_y + shadow_off, bubble_x + bubble_w + shadow_off, bubble_y + bubble_h + shadow_off],
        radius=bubble_r,
        fill=(251, 113, 133, 40),
    )
    # Blur shadow roughly by resizing down/up
    shadow = shadow.resize((size // 8, size // 8), Image.Resampling.LANCZOS).resize((size, size), Image.Resampling.LANCZOS)
    img = Image.alpha_composite(img, shadow)
    draw = ImageDraw.Draw(img)

    # Bubble body with subtle top highlight
    draw.rounded_rectangle(
        [bubble_x, bubble_y, bubble_x + bubble_w, bubble_y + bubble_h],
        radius=bubble_r,
        fill=coral,
    )

    # Bubble tail (bottom-left)
    tail_w = int(70 * s)
    tail_h = int(60 * s)
    tail_x = bubble_x + int(100 * s)
    tail_y = bubble_y + bubble_h - int(20 * s)
    draw.polygon([
        (tail_x, tail_y),
        (tail_x - tail_w, tail_y + tail_h),
        (tail_x + tail_w, tail_y),
    ], fill=coral)

    # --- White "M" mark inside bubble ---
    stroke = int(54 * s)
    white = (255, 255, 255, 255)

    # Coordinates relative to bubble
    bx, by = bubble_x, bubble_y
    def px(x: float) -> int:
        return bx + int(x * bubble_w)
    def py(y: float) -> int:
        return by + int(y * bubble_h)

    m_points = [
        (px(0.28), py(0.35)),  # left top
        (px(0.28), py(0.72)),  # left bottom
        (px(0.28), py(0.35)),  # left top again
        (px(0.50), py(0.72)),  # middle bottom
        (px(0.72), py(0.35)),  # right top
        (px(0.72), py(0.72)),  # right bottom
    ]

    # Draw thick polyline with rounded joints
    draw.line(m_points, fill=white, width=stroke, joint="curve")

    # Round caps at the three terminal points
    caps = [m_points[1], m_points[3], m_points[5]]
    for x, y in caps:
        r = stroke // 2
        draw.ellipse([x - r, y - r, x + r, y + r], fill=white)

    return img


if __name__ == "__main__":
    # Generate source at 1024
    source = create_icon(1024)

    # Save 1024x1024 PNG (macOS app icon source)
    source.save("icon.png", format="PNG")
    print("Created: icon.png (1024x1024)")

    # Generate ICO: Pillow requires all images passed explicitly
    ico_sizes = [16, 24, 32, 48, 64, 128, 256]
    ico_images = []
    for s in ico_sizes:
        ico_images.append(source.resize((s, s), Image.Resampling.LANCZOS))

    ico_images[-1].save(
        "icon.ico",
        format="ICO",
        sizes=[(s, s) for s in ico_sizes],
        append_images=ico_images[:-1],
    )
    print("Created: icon.ico (multi-size)")

    print("Done!")
