"""Generate the presentation QR code in the Prashanth-Man brand palette."""

import argparse
import os

import qrcode
from qrcode.image.styledpil import StyledPilImage
from qrcode.image.styles.moduledrawers import RoundedModuleDrawer
from qrcode.image.styles.colormasks import SolidFillColorMask
from PIL import Image, ImageDraw

DEFAULT_URL = "https://sofiabetanzos.github.io/security-awareness-april/"
BRAND_PINK = "#D11269"
OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))
brand_rgb = tuple(bytes.fromhex(BRAND_PINK.lstrip("#")))

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--url", default=DEFAULT_URL, help="Destination encoded in the QR code")
parser.add_argument("--output", default="qr-code.png", help="Output filename")
args = parser.parse_args()

# Generate QR with high error correction so it stays scannable with a center overlay
qr = qrcode.QRCode(
    version=None,
    error_correction=qrcode.constants.ERROR_CORRECT_H,  # 30% error tolerance
    box_size=20,
    border=4,
)
qr.add_data(args.url)
qr.make(fit=True)

# Create the QR image with rounded modules in the brand color.
img = qr.make_image(
    image_factory=StyledPilImage,
    module_drawer=RoundedModuleDrawer(),
    color_mask=SolidFillColorMask(front_color=brand_rgb, back_color=(255, 255, 255)),
).convert("RGBA")

# Create a compact Prashanth portrait overlay for the center.
center_size = img.width // 4  # ~25% of QR width — safe with H error correction

# Draw a white circle background for the center
overlay = Image.new("RGBA", (center_size, center_size), (0, 0, 0, 0))
draw = ImageDraw.Draw(overlay)
margin = 4
draw.ellipse(
    [margin, margin, center_size - margin, center_size - margin],
    fill=(255, 255, 255, 255),
)

avatar_path = os.path.join(OUTPUT_DIR, "assets", "prashanth.png")
avatar = Image.open(avatar_path).convert("RGBA")
avatar.thumbnail(
    (int(center_size * 0.88), int(center_size * 0.88)),
    Image.Resampling.LANCZOS,
)
avatar_pos = (
    (center_size - avatar.width) // 2,
    (center_size - avatar.height) // 2,
)
overlay.alpha_composite(avatar, avatar_pos)

# Paste the overlay in the center
pos = ((img.width - center_size) // 2, (img.height - center_size) // 2)
img.paste(overlay, pos, overlay)

# Save
out_path = os.path.join(OUTPUT_DIR, args.output)
img.save(out_path, "PNG")
print(f"QR code saved to {out_path}")
print(f"Image size: {img.width}x{img.height}")
print(f"Destination: {args.url}")
