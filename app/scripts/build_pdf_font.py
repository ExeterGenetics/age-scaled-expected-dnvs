"""Subset DejaVu Sans (regular, bold, italic, bold italic) for the PDF report and write it as base64.

jsPDF's built-in fonts cover Latin-1 only, so symbols in the report (>=, x, ->, en
dash, micro, superscript digits) need an embedded font. DejaVu Sans is free to
redistribute (Bitstream Vera licence); the subset keeps the PDF code small.

Usage:
  python app/scripts/build_pdf_font.py DejaVuSans.ttf DejaVuSans-Bold.ttf DejaVuSans-Oblique.ttf DejaVuSans-BoldOblique.ttf
(DejaVu ships with matplotlib: matplotlib/mpl-data/fonts/ttf/)
Writes app/src/lib/pdfFont.ts.
"""
import base64
import io
import os
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

# Basic Latin, Latin-1, Greek mu and sigma, dashes and quotes, bullet, ellipsis,
# superscripts and subscripts, arrows, minus, less/greater-or-equal, approx
UNICODES = (list(range(0x20, 0x7F)) + list(range(0xA0, 0x100)) + [0x3BC, 0x3A3, 0x3C3]
            + list(range(0x2010, 0x2027)) + list(range(0x2070, 0x208F))
            + [0x2190, 0x2192, 0x2212, 0x2264, 0x2265, 0x2248])


def subset_b64(path):
    font = TTFont(path)
    opts = subset.Options()
    opts.layout_features = []
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    s = subset.Subsetter(opts)
    s.populate(unicodes=UNICODES)
    s.subset(font)
    buf = io.BytesIO()
    font.save(buf)
    return base64.b64encode(buf.getvalue()).decode()


def main(regular, bold, italic, bold_italic):
    out = os.path.join(os.path.dirname(__file__), "..", "src", "lib", "pdfFont.ts")
    r, b, i, bi = subset_b64(regular), subset_b64(bold), subset_b64(italic), subset_b64(bold_italic)
    with open(out, "w") as fh:
        fh.write("// DejaVu Sans, regular, bold, italic and bold italic, subset for the PDF report by scripts/build_pdf_font.py.\n")
        fh.write("// DejaVu fonts are free to use and redistribute (Bitstream Vera / DejaVu licence,\n")
        fh.write("// https://dejavu-fonts.github.io/License.html).\n")
        fh.write("export const DEJAVU_SANS = '%s'\n" % r)
        fh.write("export const DEJAVU_SANS_BOLD = '%s'\n" % b)
        fh.write("export const DEJAVU_SANS_ITALIC = '%s'\n" % i)
        fh.write("export const DEJAVU_SANS_BOLD_ITALIC = '%s'\n" % bi)
    print("wrote %s (%d base64 chars)" % (out, len(r) + len(b) + len(i) + len(bi)))


if __name__ == "__main__":
    main(*sys.argv[1:5])
