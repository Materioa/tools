# PDF Metadata Editor & Linearizer

A web-based tool for editing PDF metadata and linearizing PDFs for faster web viewing using QPDF WebAssembly.

## Features

### ✅ Working Features
- **PDF File Upload**: Browse or drag-and-drop PDF files
- **PDF Viewer**: View PDF pages with zoom and navigation controls
- **Metadata Editing**: Edit title, author, subject, keywords, creator, producer, and dates
- **Custom Metadata Fields**: Add custom metadata fields
- **File Download**: Download PDFs with updated metadata

### ⚠️ Linearization Status
- **QPDF WASM Integration**: Attempts to load QPDF WebAssembly for real PDF linearization
- **Current Status**: QPDF WASM packages have CDN distribution issues
- **Fallback**: Shows clear warnings when linearization is unavailable
- **Metadata Only**: App works perfectly for metadata editing without linearization

## How to Use

1. **Upload PDF**: Click "Browse Files" or drag-and-drop a PDF file
2. **Edit Metadata**: Fill in the metadata fields as desired
3. **Process**: 
   - If QPDF WASM loads: Get real linearization + metadata updates
   - If QPDF unavailable: Get metadata updates only
4. **Download**: Save your updated PDF

## Getting QPDF Linearization Working

### Option 1: Host QPDF WASM Locally
1. Download a working QPDF WASM build
2. Place it in the project directory as `qpdf-wasm-local.js`
3. Update the global variable to match the QPDF API

### Option 2: Use Reliable CDN
1. Find a working QPDF WASM CDN source
2. Update `qpdf-loader.js` with the correct URL and global variable
3. Test that the WASM file loads and provides the expected API

### Option 3: Server-Side Implementation
1. Install QPDF on your server: `sudo apt-get install qpdf`
2. Create an API endpoint that accepts PDF files
3. Use QPDF command-line: `qpdf --linearize input.pdf output.pdf`
4. Return the linearized PDF to the client

## QPDF WASM Packages Tested

The app attempts to load from these sources:
- `@neslinesli93/qpdf-wasm` (GitHub: neslinesli93/qpdf-wasm)
- `qpdf-wasm-esm-embedded`
- Local implementation placeholder

## Files Structure

```
├── index.html          # Main application HTML
├── app.js             # Main application logic
├── style.css          # Application styles
├── qpdf-loader.js     # Dynamic QPDF WASM loader
├── qpdf-wasm-local.js # Local QPDF placeholder
└── README.md          # This file
```

## Development Notes

- **No Simulation**: Removed all fake/simulated linearization
- **Real QPDF Only**: Only uses actual QPDF WASM when available
- **Clear Feedback**: Users know exactly what features are available
- **Graceful Degradation**: Works perfectly for metadata editing alone

## Browser Compatibility

- Chrome/Edge: ✅ Full support
- Firefox: ✅ Full support  
- Safari: ✅ Full support
- Requires: Modern browser with WebAssembly support

## License

This project demonstrates PDF processing in the browser and is intended for educational/development purposes.
