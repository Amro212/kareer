Local document fonts (not loaded into page content scripts):

CMU Serif: cmunrm, cmunbx, cmunti, cmunbi from
https://github.com/stevenpetryk/computer-modern/tree/main/src
Original project: https://cm-unicode.sourceforge.io/
License: CMU-OFL.txt (unmodified fonts, SIL OFL 1.1).

Charter: regular, bold, italic, bold italic from
https://practicaltypography.com/fonts/Charter%20210112.zip
License: Charter-LICENSE.txt (original Bitstream donation notice).

vfs.json contains the original TTF bytes encoded as base64, for pdfmake
embedding and docx font embedding. No network font requests are needed.
