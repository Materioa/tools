// QPDF WASM Loader - tries multiple sources
class QPDFLoader {
    constructor() {
        this.qpdfSources = [
            {
                name: '@neslinesli93/qpdf-wasm',
                url: 'https://cdn.jsdelivr.net/npm/@neslinesli93/qpdf-wasm@0.3.0/dist/qpdf.min.js',
                globalVar: 'qpdfWasm',
                type: 'script'
            }
        ];
        this.loadedSource = null;
    }

    async loadQPDF() {
        // Common QPDF global variable names to check
        const commonGlobals = ['qpdfWasm', 'QPDF', 'QPDFWasm', 'qpdf', 'QPDFLib', 'Module', 'createQPDF', 'qpdfjs', 'QpdfWasm'];
        
        for (const source of this.qpdfSources) {
            try {
                await this.loadScript(source.url, source.type);
                
                // Check if the global variable is available
                if (window[source.globalVar]) {
                    this.loadedSource = source;
                    return window[source.globalVar];
                }
                
                // Also check for common QPDF global variable names
                for (const globalName of commonGlobals) {
                    if (window[globalName] && globalName !== source.globalVar) {
                        // Special handling for Emscripten Module
                        if (globalName === 'Module') {
                            this.loadedSource = { ...source, globalVar: globalName };
                            return window[globalName];
                        }
                        
                        // If it's a function, it might be a factory function
                        if (typeof window[globalName] === 'function') {
                            try {
                                const qpdfInstance = await window[globalName]();
                                if (qpdfInstance) {
                                    this.loadedSource = { ...source, globalVar: globalName };
                                    return qpdfInstance;
                                }
                            } catch (err) {
                                // Factory function failed, continue
                            }
                        }
                        
                        this.loadedSource = { ...source, globalVar: globalName };
                        return window[globalName];
                    }
                }
                
                // Wait a bit for the library to initialize
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                if (window[source.globalVar]) {
                    this.loadedSource = source;
                    return window[source.globalVar];
                }
                
                // Check again for common QPDF global variable names after delay
                for (const globalName of commonGlobals) {
                    if (window[globalName] && globalName !== source.globalVar) {
                        // Special handling for Emscripten Module
                        if (globalName === 'Module') {
                            this.loadedSource = { ...source, globalVar: globalName };
                            return window[globalName];
                        }
                        
                        // If it's a function, it might be a factory function
                        if (typeof window[globalName] === 'function') {
                            try {
                                const qpdfInstance = await window[globalName]();
                                if (qpdfInstance) {
                                    this.loadedSource = { ...source, globalVar: globalName };
                                    return qpdfInstance;
                                }
                            } catch (err) {
                                // Factory function failed after delay, continue
                            }
                        }
                        
                        this.loadedSource = { ...source, globalVar: globalName };
                        return window[globalName];
                    }
                }
                
            } catch (error) {
                // Source failed to load, try next source
            }
        }
        
        return null;
    }

    loadScript(url, type = 'script') {
        return new Promise((resolve, reject) => {
            // Remove any existing script with the same URL
            const existingScript = document.querySelector(`script[src="${url}"]`);
            if (existingScript) {
                existingScript.remove();
            }

            const script = document.createElement('script');
            script.src = url;
            
            if (type === 'module') {
                script.type = 'module';
            }
            
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    getLoadedSourceInfo() {
        return this.loadedSource;
    }
}

// QPDF Compression Test Utility
class QPDFCompressionTester {
    constructor(qpdfWasm) {
        this.qpdfWasm = qpdfWasm;
    }

    async testCompression(pdfBytes) {
        if (!this.qpdfWasm) {
            throw new Error('QPDF WASM not available');
        }

        const testResults = {};
        const levels = ['light', 'medium', 'high', 'extreme'];

        for (const level of levels) {
            try {
                const startTime = performance.now();
                const compressedBytes = await this.compressWithLevel(pdfBytes, level);
                const endTime = performance.now();

                testResults[level] = {
                    originalSize: pdfBytes.length,
                    compressedSize: compressedBytes.length,
                    compressionRatio: (compressedBytes.length / pdfBytes.length * 100).toFixed(2) + '%',
                    timeMs: Math.round(endTime - startTime),
                    success: true
                };
            } catch (error) {
                testResults[level] = {
                    success: false,
                    error: error.message
                };
            }
        }

        return testResults;
    }

    async compressWithLevel(pdfBytes, level) {
        const compressionArgs = {
            'light': [
                '--compress-streams=y',
                '--object-streams=preserve',
                '--remove-unreferenced-resources=auto'
            ],
            'medium': [
                '--compress-streams=y',
                '--object-streams=generate',
                '--remove-unreferenced-resources=yes',
                '--optimize-images'
            ],
            'high': [
                '--compress-streams=y',
                '--object-streams=generate',
                '--remove-unreferenced-resources=yes',
                '--optimize-images',
                '--recompress-flate'
            ],
            'extreme': [
                '--compress-streams=y',
                '--object-streams=generate',
                '--remove-unreferenced-resources=yes',
                '--optimize-images',
                '--recompress-flate',
                '--normalize-content=y'
            ]
        };

        const args = compressionArgs[level] || compressionArgs.medium;

        if (this.qpdfWasm.FS && this.qpdfWasm.callMain) {
            return await this.compressWithFS(pdfBytes, args);
        } else if (this.qpdfWasm.run) {
            return await this.qpdfWasm.run(args, new Uint8Array(pdfBytes));
        } else {
            throw new Error('Unsupported QPDF WASM API');
        }
    }

    async compressWithFS(pdfBytes, args) {
        const inputFile = `test_input_${Date.now()}.pdf`;
        const outputFile = `test_output_${Date.now()}.pdf`;

        try {
            this.qpdfWasm.FS.writeFile(inputFile, new Uint8Array(pdfBytes));
            
            const result = this.qpdfWasm.callMain([...args, inputFile, outputFile]);
            
            if (result !== 0) {
                throw new Error(`QPDF compression failed with exit code: ${result}`);
            }
            
            const compressedBytes = this.qpdfWasm.FS.readFile(outputFile);
            
            // Cleanup
            this.qpdfWasm.FS.unlink(inputFile);
            this.qpdfWasm.FS.unlink(outputFile);
            
            return compressedBytes;
        } catch (error) {
            // Cleanup on error
            try {
                this.qpdfWasm.FS.unlink(inputFile);
                this.qpdfWasm.FS.unlink(outputFile);
            } catch (cleanupError) {
                // Ignore cleanup errors
            }
            throw error;
        }
    }
}

// Ghostscript WASM Compression Test Utility
class GhostscriptCompressionTester {
    constructor(ghostscriptWasm) {
        this.ghostscriptWasm = ghostscriptWasm;
    }

    async testCompression(pdfBytes) {
        if (!this.ghostscriptWasm) {
            throw new Error('Ghostscript WASM not available');
        }

        const testResults = {};
        const levels = ['light', 'medium', 'high', 'extreme'];

        for (const level of levels) {
            try {
                const startTime = performance.now();
                const compressedBytes = await this.compressWithLevel(pdfBytes, level);
                const endTime = performance.now();

                testResults[level] = {
                    originalSize: pdfBytes.length,
                    compressedSize: compressedBytes.length,
                    compressionRatio: (compressedBytes.length / pdfBytes.length * 100).toFixed(2) + '%',
                    timeMs: Math.round(endTime - startTime),
                    success: true
                };
            } catch (error) {
                testResults[level] = {
                    success: false,
                    error: error.message
                };
            }
        }

        return testResults;
    }

    async compressWithLevel(pdfBytes, level) {
        const compressionParams = {
            'light': {
                imageQuality: 0.9,
                colorImageResolution: 300,
                grayImageResolution: 300,
                monoImageResolution: 1200,
                compressPages: true,
                compressImages: true,
                embedAllFonts: true
            },
            'medium': {
                imageQuality: 0.75,
                colorImageResolution: 200,
                grayImageResolution: 200,
                monoImageResolution: 1200,
                compressPages: true,
                compressImages: true,
                embedAllFonts: true
            },
            'high': {
                imageQuality: 0.6,
                colorImageResolution: 150,
                grayImageResolution: 150,
                monoImageResolution: 1200,
                compressPages: true,
                compressImages: true,
                embedAllFonts: true
            },
            'extreme': {
                imageQuality: 0.4,
                colorImageResolution: 100,
                grayImageResolution: 100,
                monoImageResolution: 600,
                compressPages: true,
                compressImages: true,
                embedAllFonts: false
            }
        };

        const params = compressionParams[level] || compressionParams.medium;
        
        // Build Ghostscript command arguments
        const args = [
            'gs',
            '-sDEVICE=pdfwrite',
            '-dCompatibilityLevel=1.4',
            '-dPDFSETTINGS=/printer',
            '-dNOPAUSE',
            '-dQUIET',
            '-dBATCH',
            '-dSAFER',
            '-dAutoRotatePages=/None',
            '-dAutoFilterColorImages=false',
            '-dAutoFilterGrayImages=false',
            '-dOptimize=true',
            '-dEmbedAllFonts=' + (params.embedAllFonts ? 'true' : 'false'),
            '-dSubsetFonts=true',
            '-dCompressPages=' + (params.compressPages ? 'true' : 'false'),
            '-dUseFlateCompression=true',
            '-dColorImageFilter=/DCTEncode',
            '-dGrayImageFilter=/DCTEncode',
            '-dMonoImageFilter=/CCITTFaxEncode',
            `-dColorImageResolution=${params.colorImageResolution}`,
            `-dGrayImageResolution=${params.grayImageResolution}`,
            `-dMonoImageResolution=${params.monoImageResolution}`,
            `-dJPEGQ=${Math.round(params.imageQuality * 100)}`,
            '-sOutputFile=output.pdf',
            'input.pdf'
        ];

        if (this.ghostscriptWasm.FS && this.ghostscriptWasm.callMain) {
            return await this.compressWithFS(pdfBytes, args);
        } else if (this.ghostscriptWasm.compress) {
            return await this.ghostscriptWasm.compress(new Uint8Array(pdfBytes), params);
        } else {
            throw new Error('Unsupported Ghostscript WASM API');
        }
    }

    async compressWithFS(pdfBytes, args) {
        const inputFile = `gs_input_${Date.now()}.pdf`;
        const outputFile = `gs_output_${Date.now()}.pdf`;

        try {
            this.ghostscriptWasm.FS.writeFile(inputFile, new Uint8Array(pdfBytes));
            
            // Update args to use the generated filenames
            const updatedArgs = args.map(arg => {
                if (arg === 'input.pdf') return inputFile;
                if (arg === '-sOutputFile=output.pdf') return `-sOutputFile=${outputFile}`;
                return arg;
            });
            
            const result = this.ghostscriptWasm.callMain(updatedArgs);
            
            if (result !== 0) {
                throw new Error(`Ghostscript compression failed with exit code: ${result}`);
            }
            
            const compressedBytes = this.ghostscriptWasm.FS.readFile(outputFile);
            
            // Cleanup
            this.ghostscriptWasm.FS.unlink(inputFile);
            this.ghostscriptWasm.FS.unlink(outputFile);
            
            return compressedBytes;
        } catch (error) {
            // Cleanup on error
            try {
                this.ghostscriptWasm.FS.unlink(inputFile);
                this.ghostscriptWasm.FS.unlink(outputFile);
            } catch (cleanupError) {
                // Ignore cleanup errors
            }
            throw error;
        }
    }
}

// Make it globally available
window.QPDFLoader = QPDFLoader;

// Make tester available globally for debugging
window.QPDFCompressionTester = QPDFCompressionTester;

// Make tester available globally for debugging
window.GhostscriptCompressionTester = GhostscriptCompressionTester;
