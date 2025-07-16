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

// Make it globally available
window.QPDFLoader = QPDFLoader;
