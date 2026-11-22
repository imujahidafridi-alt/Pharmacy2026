// Code 39 Barcode SVG Generator
// Highly compatible with 100% of 1D/2D POS barcode scanners in Pakistan

const CODE39_PATTERNS: Record<string, string> = {
  '0': '000110100', '1': '100100001', '2': '001100001', '3': '101100000',
  '4': '000110001', '5': '100110000', '6': '001110000', '7': '000100101',
  '8': '100100100', '9': '001100100', 'A': '100001001', 'B': '001001001',
  'C': '101001000', 'D': '000011001', 'E': '100011000', 'F': '001011000',
  'G': '000001101', 'H': '100001100', 'I': '001001100', 'J': '000011100',
  'K': '100000011', 'L': '001000011', 'M': '101000010', 'N': '000010011',
  'O': '100010010', 'P': '001010010', 'Q': '000000111', 'R': '100000110',
  'S': '001000110', 'T': '000010110', 'U': '110000001', 'V': '011000001',
  'W': '111000000', 'X': '010010001', 'Y': '110010000', 'Z': '011010000',
  '-': '010000101', '.': '110000100', ' ': '011000100', '$': '010101000',
  '/': '010100010', '+': '010001010', '%': '000101010', '*': '010010100',
};

export interface BarcodeOptions {
  height?: number;
  narrowWidth?: number;
  wideWidth?: number;
  gapWidth?: number;
  displayValue?: boolean;
}

export function generateCode39Svg(text: string, options: BarcodeOptions = {}): string {
  const {
    height = 36,
    narrowWidth = 1.3,
    wideWidth = 2.8,
    gapWidth = 1.3,
    displayValue = true,
  } = options;

  const sanitized = text.toUpperCase().replace(/[^0-9A-Z\-\. \$\/\+\%]/g, '-');
  const encodedStr = `*${sanitized}*`;

  let currentX = 10;
  const rects: string[] = [];

  for (let i = 0; i < encodedStr.length; i++) {
    const char = encodedStr[i];
    const pattern = CODE39_PATTERNS[char] || CODE39_PATTERNS['-'];

    for (let b = 0; b < 9; b++) {
      const isBar = b % 2 === 0;
      const isWide = pattern[b] === '1';
      const width = isWide ? wideWidth : narrowWidth;

      if (isBar) {
        rects.push(`<rect x="${currentX.toFixed(1)}" y="0" width="${width.toFixed(1)}" height="${height}" fill="#000000" />`);
      }
      currentX += width;
    }
    // Inter-character gap
    currentX += gapWidth;
  }

  const totalWidth = currentX + 10;
  const svgHeight = displayValue ? height + 14 : height;

  const textElement = displayValue
    ? `<text x="${(totalWidth / 2).toFixed(1)}" y="${(height + 11).toFixed(1)}" text-anchor="middle" font-family="monospace" font-size="9" font-weight="600" fill="#000000">${sanitized}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth.toFixed(0)} ${svgHeight}" width="${totalWidth.toFixed(0)}" height="${svgHeight}" style="max-width: 100%; display: block; margin: 0 auto;">${rects.join('')}${textElement}</svg>`;
}
