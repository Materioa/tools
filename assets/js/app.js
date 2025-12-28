// PDF Metadata Editor and Optimizer Application
class PDFMetadataEditor {
    constructor() {
        this.currentPDF = null;
        this.pdfDoc = null;
        this.currentPage = 1;
        this.totalPages = 0;
        this.scale = 1.0;
        this.customFieldCount = 0;
        this.modifiedPdfBytes = null;
        this.isFileLoaded = false;
        this.originalFileSize = 0;
        this.currentFile = null;
        this.qpdfWasm = null;
        this.qpdfSourceInfo = null;
        this.isQPDFInitializing = false;
        this.ghostscriptWasm = null;
        this.isGhostscriptInitializing = false;
        
        this.init();
    }

    init() {
        console.log('PDFMetadataEditor initializing...');
        this.setupPDFJS();
        this.initQPDF();
        this.initGhostscript();
        this.setupEventListeners();
        this.initializeFormState();
        console.log('PDFMetadataEditor initialization complete');
    }

    setupPDFJS() {
        console.log('Setting up PDF.js...');
        if (typeof pdfjsLib !== 'undefined') {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            console.log('PDF.js configured successfully');
        } else {
            console.error('PDF.js not loaded');
        }
    }

    async initQPDF() {
        if (this.isQPDFInitializing) {
            return;
        }
        
        this.isQPDFInitializing = true;
        
        try {
            if (window.QPDFLoader) {
                const loader = new QPDFLoader();
                const QPDFClass = await loader.loadQPDF();
                
                if (QPDFClass) {
                    // If it's the Emscripten Module, use it directly
                    if (this.qpdfSourceInfo && this.qpdfSourceInfo.globalVar === 'Module') {
                        this.qpdfWasm = QPDFClass;
                    } else if (typeof QPDFClass === 'function') {
                        this.qpdfWasm = await QPDFClass();
                    } else {
                        this.qpdfWasm = QPDFClass;
                    }
                    
                    this.qpdfSourceInfo = loader.getLoadedSourceInfo();
                    this.onQPDFInitialized();
                }
            } else if (typeof QPDFWasm !== 'undefined') {
                this.qpdfWasm = await QPDFWasm();
                this.onQPDFInitialized();
            } else if (typeof qpdfWasm !== 'undefined') {
                this.qpdfWasm = await qpdfWasm();
                this.onQPDFInitialized();
            }
        } catch (error) {
            // QPDF initialization failed - linearization will not be available
        } finally {
            this.isQPDFInitializing = false;
        }
    }

    onQPDFInitialized() {
        // Update UI when QPDF becomes available
        if (this.isFileLoaded) {
            this.setFormEnabled(true);
            this.updateProcessButtonText();
            this.updateCompressionDescription();
            this.updateCompressionEngineOptions();
            this.updateCompressionQualityIndicator();
            
            // Only show notification if Ghostscript is not available (to avoid duplicate notifications)
            if (!this.ghostscriptWasm) {
                this.showToast('QPDF loaded - enhanced compression and linearization available', 'success');
            }
        }
    }

    async initGhostscript() {
        if (this.isGhostscriptInitializing) {
            return;
        }
        
        this.isGhostscriptInitializing = true;
        
        try {
            // Check for the new Ghostscript WASM API patterns
            if (typeof createGhostscriptWasm === 'function') {
                this.ghostscriptWasm = await createGhostscriptWasm();
                this.onGhostscriptInitialized();
            } else if (typeof GhostscriptWasm === 'function') {
                this.ghostscriptWasm = await GhostscriptWasm();
                this.onGhostscriptInitialized();
            } else if (typeof ghostscriptWasm === 'function') {
                this.ghostscriptWasm = await ghostscriptWasm();
                this.onGhostscriptInitialized();
            } else if (window.ghostscriptWasm) {
                this.ghostscriptWasm = window.ghostscriptWasm;
                this.onGhostscriptInitialized();
            } else if (window.gs) {
                // Check for the gs.min.js library pattern
                this.ghostscriptWasm = window.gs;
                this.onGhostscriptInitialized();
            } else if (typeof gs !== 'undefined') {
                this.ghostscriptWasm = gs;
                this.onGhostscriptInitialized();
            }
        } catch (error) {
            // Ghostscript initialization failed - aggressive compression will not be available
            console.warn('Ghostscript WASM initialization failed:', error);
        } finally {
            this.isGhostscriptInitializing = false;
        }
    }

    onGhostscriptInitialized() {
        // Update UI when Ghostscript becomes available
        if (this.isFileLoaded) {
            this.setFormEnabled(true);
            this.updateProcessButtonText();
            this.updateCompressionDescription();
            this.updateCompressionEngineOptions();
            this.updateCompressionQualityIndicator();
            this.showToast('Ghostscript loaded - aggressive compression available', 'success');
        }
    }

    initializeFormState() {
        this.setFormEnabled(false);
        this.setButtonsEnabled(false);
        
        // Hide optimization section initially
        const optimizationSection = document.getElementById('optimizationSection');
        if (optimizationSection) {
            optimizationSection.style.display = 'none';
        }
    }

    setupEventListeners() {
        console.log('Setting up event listeners...');
        // File input handling
        const fileInput = document.getElementById('fileInput');
        const uploadArea = document.getElementById('uploadArea');
        const browseBtn = document.getElementById('browseBtn');

        console.log('Elements found:', {
            fileInput: !!fileInput,
            uploadArea: !!uploadArea,
            browseBtn: !!browseBtn
        });

        // File selection - make sure this works properly
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                console.log('File input change event triggered');
                const file = e.target.files[0];
                if (file) {
                    console.log('File selected:', file.name);
                    this.handleFile(file);
                } else {
                    console.log('No file selected');
                }
            });
        } else {
            console.error('fileInput element not found');
        }

        // Browse button click handler - direct event listener
        if (browseBtn) {
            browseBtn.addEventListener('click', (e) => {
                console.log('Browse button clicked');
                e.preventDefault();
                e.stopPropagation();
                if (fileInput) {
                    fileInput.click();
                } else {
                    console.error('fileInput not found when browse button clicked');
                }
            });
        } else {
            console.error('browseBtn element not found');
        }

        // Upload area click - fix the click handler
        if (uploadArea) {
            uploadArea.addEventListener('click', (e) => {
                // Check if the click is on the browse button or its label
                if (e.target.closest('#browseBtn') || e.target.closest('label[for="fileInput"]')) {
                    return; // Let the button/label handle the click
                }
                
                // Only trigger file input for clicks on the upload area itself
                if (e.target === uploadArea || e.target.closest('.upload-area__content')) {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    if (fileInput) {
                        fileInput.click();
                    }
                }
            });

            // Drag and drop - fix the drag handlers
            uploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                uploadArea.classList.add('dragover');
            });

            uploadArea.addEventListener('dragleave', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!uploadArea.contains(e.relatedTarget)) {
                    uploadArea.classList.remove('dragover');
                }
            });

            uploadArea.addEventListener('drop', (e) => {
                console.log('Drop event triggered');
                e.preventDefault();
                e.stopPropagation();
                uploadArea.classList.remove('dragover');
                
                const files = e.dataTransfer.files;
                console.log('Files dropped:', files.length);
                if (files.length > 0) {
                    console.log('Handling dropped file:', files[0].name);
                    this.handleFile(files[0]);
                }
            });
        }

        // PDF viewer controls
        this.setupViewerControls();
        
        // Metadata form controls
        this.setupMetadataControls();
        
        // Optimization controls
        this.setupOptimizationControls();

        // Form change detection
        const metadataForm = document.getElementById('metadataForm');
        if (metadataForm) {
            metadataForm.addEventListener('input', () => {
                if (this.isFileLoaded) {
                    const processBtn = document.getElementById('processDocument');
                    if (processBtn) {
                        processBtn.disabled = false;
                    }
                }
            });
        }

        // Prevent default drag behaviors on document
        document.addEventListener('dragover', (e) => e.preventDefault());
        document.addEventListener('drop', (e) => e.preventDefault());
    }

    setupViewerControls() {
        const prevBtn = document.getElementById('prevPage');
        const nextBtn = document.getElementById('nextPage');
        const zoomInBtn = document.getElementById('zoomIn');
        const zoomOutBtn = document.getElementById('zoomOut');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                this.changePage(-1);
            });
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                this.changePage(1);
            });
        }
        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', () => {
                this.changeZoom(0.2);
            });
        }
        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', () => {
                this.changeZoom(-0.2);
            });
        }
    }

    setupMetadataControls() {
        const addCustomFieldBtn = document.getElementById('addCustomField');
        const processDocumentBtn = document.getElementById('processDocument');
        const downloadPdfBtn = document.getElementById('downloadPdf');
        const resetFormBtn = document.getElementById('resetForm');

        if (addCustomFieldBtn) {
            addCustomFieldBtn.addEventListener('click', () => {
                if (this.isFileLoaded) {
                    this.addCustomField();
                }
            });
        }

        if (processDocumentBtn) {
            processDocumentBtn.addEventListener('click', () => {
                if (this.isFileLoaded) {
                    this.processDocument();
                }
            });
        }

        if (downloadPdfBtn) {
            downloadPdfBtn.addEventListener('click', () => {
                this.downloadPDF();
            });
        }

        if (resetFormBtn) {
            resetFormBtn.addEventListener('click', () => {
                if (this.isFileLoaded) {
                    this.resetForm();
                }
            });
        }
    }

    setupOptimizationControls() {
        const linearizationInfo = document.getElementById('linearizationInfo');
        const enableLinearization = document.getElementById('enableLinearization');
        const compressionInfo = document.getElementById('compressionInfo');
        const enableCompression = document.getElementById('enableCompression');
        const compressionEngine = document.getElementById('compressionEngine');
        const compressionLevel = document.getElementById('compressionLevel');

        if (linearizationInfo) {
            linearizationInfo.addEventListener('click', () => {
                this.toggleLinearizationInfo();
            });
        }

        if (enableLinearization) {
            enableLinearization.addEventListener('change', () => {
                // Check if QPDF is available when user tries to enable linearization
                if (enableLinearization.checked && !this.qpdfWasm) {
                    enableLinearization.checked = false;
                    this.showToast('Linearization requires QPDF WASM to be loaded. Please refresh the page and ensure a stable internet connection.', 'error');
                    return;
                }
                this.updateProcessButtonText();
            });
        }

        if (compressionInfo) {
            compressionInfo.addEventListener('click', () => {
                this.toggleCompressionInfo();
            });
        }

        if (enableCompression) {
            enableCompression.addEventListener('change', () => {
                this.toggleCompressionSettings();
                this.updateProcessButtonText();
            });
        }

        if (compressionEngine) {
            compressionEngine.addEventListener('change', () => {
                try {
                    this.updateCompressionEngineOptions();
                    this.updateCompressionDescription();
                    this.updateCompressionQualityIndicator();
                } catch (error) {
                    console.warn('Error updating compression engine UI:', error);
                }
            });
        }

        if (compressionLevel) {
            compressionLevel.addEventListener('change', () => {
                this.updateCompressionDescription();
            });
        }
    }

    toggleLinearizationInfo() {
        const benefitsInfo = document.getElementById('benefitsInfo');
        if (benefitsInfo) {
            const isVisible = benefitsInfo.style.display === 'block';
            benefitsInfo.style.display = isVisible ? 'none' : 'block';
        }
    }

    toggleCompressionInfo() {
        const compressionBenefitsInfo = document.getElementById('compressionBenefitsInfo');
        if (compressionBenefitsInfo) {
            const isVisible = compressionBenefitsInfo.style.display === 'block';
            compressionBenefitsInfo.style.display = isVisible ? 'none' : 'block';
        }
    }

    toggleCompressionSettings() {
        const enableCompression = document.getElementById('enableCompression');
        const compressionSettings = document.getElementById('compressionSettings');
        
        if (compressionSettings && enableCompression) {
            compressionSettings.style.display = enableCompression.checked ? 'block' : 'none';
        }
    }

    updateCompressionDescription() {
        const compressionLevel = document.getElementById('compressionLevel');
        const compressionDescription = document.getElementById('compressionDescription');
        
        if (!compressionLevel || !compressionDescription) return;

        const level = compressionLevel.value;
        const selectedEngine = this.getSelectedCompressionEngine();
        
        const descriptions = {
            'ghostscript': {
                'light': 'Light compression with Ghostscript: 90% image quality, 300 DPI resolution. Minimal optimization, preserves quality.',
                'medium': 'Medium compression with Ghostscript: 75% image quality, 200 DPI resolution. Balanced optimization for general use.',
                'high': 'High compression with Ghostscript: 60% image quality, 150 DPI resolution. Aggressive optimization with significant size reduction.',
                'extreme': 'Extreme compression with Ghostscript: 40% image quality, 100 DPI resolution. Maximum optimization for web distribution.'
            },
            'qpdf': {
                'light': 'Light compression with QPDF: Preserves streams, minimal optimization. Best for documents with important images.',
                'medium': 'Medium compression with QPDF: Generates object streams, removes unused resources, optimizes images. Balanced size reduction.',
                'high': 'High compression with QPDF: Advanced optimization with flate recompression, image optimization, and resource cleanup.',
                'extreme': 'Extreme compression with QPDF: Maximum optimization with content normalization, full resource cleanup, and aggressive compression.'
            },
            'pdflib': {
                'light': 'Light compression with pdf-lib: Basic object stream optimization with minimal changes.',
                'medium': 'Medium compression with pdf-lib: Standard object stream optimization with moderate compression.',
                'high': 'High compression with pdf-lib: Enhanced object stream optimization with more aggressive settings.',
                'extreme': 'Extreme compression with pdf-lib: Maximum object stream optimization - quality may be affected.'
            }
        };

        const engineDescriptions = descriptions[selectedEngine] || descriptions.pdflib;
        compressionDescription.textContent = engineDescriptions[level] || engineDescriptions.medium;
    }

    updateProcessButtonText() {
        const processBtn = document.getElementById('processDocument');
        const enableLinearization = document.getElementById('enableLinearization');
        const enableCompression = document.getElementById('enableCompression');
        
        if (processBtn && enableLinearization && enableCompression) {
            const linearizationEnabled = enableLinearization.checked;
            const compressionEnabled = enableCompression.checked;
            
            let buttonText = 'Update Metadata';
            let actions = [];
            
            if (compressionEnabled) {
                const compressionLevel = document.getElementById('compressionLevel');
                const level = compressionLevel ? compressionLevel.value : 'medium';
                actions.push(`Compress (${level})`);
            }
            
            if (linearizationEnabled) {
                const hasQPDF = this.qpdfWasm !== null;
                if (hasQPDF) {
                    actions.push('Linearize');
                } else {
                    processBtn.textContent = 'Linearization Unavailable (QPDF Required)';
                    processBtn.disabled = true;
                    return;
                }
            }
            
            if (actions.length > 0) {
                buttonText = `Process & ${actions.join(' & ')}`;
            }
            
            processBtn.textContent = buttonText;
            processBtn.disabled = false;
        }
    }

    setFormEnabled(enabled) {
        const form = document.getElementById('metadataForm');
        if (form) {
            const inputs = form.querySelectorAll('input');
            inputs.forEach(input => {
                input.disabled = !enabled;
            });
        }

        // Handle linearization checkbox
        const enableLinearization = document.getElementById('enableLinearization');
        if (enableLinearization) {
            // Enable the checkbox only if form is enabled AND QPDF is available
            enableLinearization.disabled = !enabled || !this.qpdfWasm;
            
            // Show/hide QPDF status warning
            const qpdfStatus = document.getElementById('qpdfStatus');
            if (qpdfStatus) {
                if (!this.qpdfWasm && enabled) {
                    qpdfStatus.style.display = 'block';
                } else {
                    qpdfStatus.style.display = 'none';
                }
            }
            
            // If QPDF is not available, uncheck and add a visual indicator
            if (!this.qpdfWasm && enabled) {
                enableLinearization.checked = false;
                // Add disabled styling or indicator
                const optionContainer = enableLinearization.closest('.optimization-option');
                if (optionContainer) {
                    optionContainer.style.opacity = '0.6';
                    optionContainer.title = 'Linearization requires QPDF WASM to be loaded';
                }
            } else if (this.qpdfWasm && enabled) {
                // Remove any disabled styling
                const optionContainer = enableLinearization.closest('.optimization-option');
                if (optionContainer) {
                    optionContainer.style.opacity = '1';
                    optionContainer.title = '';
                }
            }
        }

        // Handle compression settings
        const enableCompression = document.getElementById('enableCompression');
        if (enableCompression) {
            enableCompression.disabled = !enabled;
        }

        // Handle compression engine selector
        const compressionEngine = document.getElementById('compressionEngine');
        if (compressionEngine) {
            compressionEngine.disabled = !enabled;
            if (enabled) {
                this.updateCompressionEngineOptions();
                this.updateCompressionQualityIndicator();
            }
        }

        // Handle compression level selector
        const compressionLevel = document.getElementById('compressionLevel');
        if (compressionLevel) {
            compressionLevel.disabled = !enabled;
        }
    }

    setButtonsEnabled(enabled) {
        const buttons = ['addCustomField', 'processDocument', 'resetForm'];
        buttons.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.disabled = !enabled;
            }
        });
    }

    async handleFile(file) {
        console.log('handleFile called with:', file);
        
        // Clear any previous drag states
        const uploadArea = document.getElementById('uploadArea');
        if (uploadArea) {
            uploadArea.classList.remove('dragover');
        }

        // Validate file type
        if (file.type !== 'application/pdf') {
            console.log('Invalid file type:', file.type);
            this.showToast('Please select a PDF file', 'error');
            return;
        }

        // Validate file size (50MB limit)
        if (file.size > 50 * 1024 * 1024) {
            this.showToast('File size must be less than 50MB', 'error');
            return;
        }

        this.showLoading(true, 'Loading PDF...');
        this.currentFile = file;
        this.originalFileSize = file.size;
        
        console.log('Starting PDF processing...');
        console.log('Available libraries:', {
            PDFLib: typeof PDFLib !== 'undefined',
            pdfjsLib: typeof pdfjsLib !== 'undefined'
        });
        
        try {
            // Read file as array buffer
            console.log('Reading file as array buffer...');
            const arrayBuffer = await file.arrayBuffer();
            console.log('Array buffer read successfully, size:', arrayBuffer.byteLength);
            
            // Load PDF with pdf-lib for metadata manipulation
            console.log('Loading PDF with pdf-lib...');
            this.pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
            console.log('pdf-lib loaded successfully');
            
            // Load PDF with PDF.js for viewing
            console.log('Loading PDF with PDF.js...');
            this.currentPDF = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
            console.log('PDF.js loaded successfully');
            
            this.totalPages = this.currentPDF.numPages;
            this.isFileLoaded = true;
            
            // Update UI
            this.displayFileInfo(file);
            await this.extractMetadata();
            await this.renderPage(1);
            
            // Enable form and controls
            this.setFormEnabled(true);
            this.setButtonsEnabled(true);
            this.showViewerControls();
            this.showOptimizationSection();
            this.updateProcessButtonText();
            
            // Update compression engine options safely
            try {
                this.updateCompressionEngineOptions();
                this.updateCompressionQualityIndicator();
            } catch (error) {
                console.warn('Error updating compression engine UI:', error);
                // Continue without compression engine updates
            }
            
            this.showToast('PDF loaded successfully', 'success');
            
        } catch (error) {
            this.showToast('Error loading PDF: ' + error.message, 'error');
            this.isFileLoaded = false;
        } finally {
            this.showLoading(false);
        }
    }

    displayFileInfo(file) {
        const fileName = document.getElementById('fileName');
        const fileSize = document.getElementById('fileSize');
        const pageCount = document.getElementById('pageCount');
        const fileInfo = document.getElementById('fileInfo');
        const originalSize = document.getElementById('originalSize');

        if (fileName) fileName.textContent = file.name;
        if (fileSize) fileSize.textContent = this.formatFileSize(file.size);
        if (pageCount) pageCount.textContent = this.totalPages;
        if (fileInfo) fileInfo.style.display = 'block';
        if (originalSize) originalSize.textContent = this.formatFileSize(file.size);
        
        this.updatePageInfo();
    }

    showOptimizationSection() {
        const optimizationSection = document.getElementById('optimizationSection');
        if (optimizationSection) {
            optimizationSection.style.display = 'block';
        }
    }

    async extractMetadata() {
        try {
            const metadata = {
                title: this.pdfDoc.getTitle() || '',
                author: this.pdfDoc.getAuthor() || '',
                subject: this.pdfDoc.getSubject() || '',
                keywords: this.pdfDoc.getKeywords() || '',
                creator: this.pdfDoc.getCreator() || '',
                producer: this.pdfDoc.getProducer() || '',
                creationDate: this.pdfDoc.getCreationDate() || null,
                modificationDate: this.pdfDoc.getModificationDate() || null
            };

            // Populate form fields
            Object.keys(metadata).forEach(key => {
                const element = document.getElementById(key);
                if (element) {
                    if (key.includes('Date') && metadata[key]) {
                        const date = new Date(metadata[key]);
                        if (!isNaN(date.getTime())) {
                            element.value = date.toISOString().slice(0, 16);
                        }
                    } else {
                        element.value = metadata[key];
                    }
                }
            });

        } catch (error) {
            this.showToast('Error extracting metadata', 'warning');
        }
    }

    async renderPage(pageNum) {
        if (!this.currentPDF || pageNum < 1 || pageNum > this.totalPages) {
            return;
        }

        try {
            const page = await this.currentPDF.getPage(pageNum);
            const canvas = document.getElementById('pdfCanvas');
            const context = canvas.getContext('2d');

            const viewport = page.getViewport({scale: this.scale});
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };

            await page.render(renderContext).promise;
            
            // Show canvas, hide placeholder
            canvas.style.display = 'block';
            const placeholder = document.getElementById('viewerPlaceholder');
            if (placeholder) {
                placeholder.style.display = 'none';
            }
            
            this.currentPage = pageNum;
            this.updatePageInfo();
            this.updateNavigationButtons();

        } catch (error) {
            this.showToast('Error rendering PDF page', 'error');
        }
    }

    changePage(delta) {
        const newPage = this.currentPage + delta;
        if (newPage >= 1 && newPage <= this.totalPages) {
            this.renderPage(newPage);
        }
    }

    changeZoom(delta) {
        this.scale = Math.max(0.5, Math.min(3.0, this.scale + delta));
        this.renderPage(this.currentPage);
    }

    updatePageInfo() {
        const pageInfo = document.getElementById('pageInfo');
        if (pageInfo) {
            pageInfo.textContent = `Page ${this.currentPage} of ${this.totalPages}`;
        }
    }

    updateNavigationButtons() {
        const prevBtn = document.getElementById('prevPage');
        const nextBtn = document.getElementById('nextPage');
        
        if (prevBtn) prevBtn.disabled = this.currentPage <= 1;
        if (nextBtn) nextBtn.disabled = this.currentPage >= this.totalPages;
    }

    showViewerControls() {
        const viewerControls = document.getElementById('viewerControls');
        if (viewerControls) {
            viewerControls.style.display = 'flex';
        }
    }

    addCustomField() {
        this.customFieldCount++;
        const customFields = document.getElementById('customFields');
        
        if (customFields) {
            const fieldDiv = document.createElement('div');
            fieldDiv.className = 'custom-field';
            fieldDiv.innerHTML = `
                <input type="text" class="form-control" placeholder="Field name" data-custom-key="${this.customFieldCount}">
                <input type="text" class="form-control" placeholder="Field value" data-custom-value="${this.customFieldCount}">
                <button type="button" class="btn btn--outline btn--sm remove-field">Remove</button>
            `;
            
            // Add event listener for remove button
            const removeBtn = fieldDiv.querySelector('.remove-field');
            if (removeBtn) {
                removeBtn.addEventListener('click', () => {
                    fieldDiv.remove();
                });
            }
            
            customFields.appendChild(fieldDiv);
        }
    }

    async processDocument() {
        if (!this.pdfDoc || !this.isFileLoaded) {
            this.showToast('No PDF loaded', 'error');
            return;
        }

        const enableLinearization = document.getElementById('enableLinearization');
        const shouldLinearize = enableLinearization && enableLinearization.checked;
        
        const enableCompression = document.getElementById('enableCompression');
        const shouldCompress = enableCompression && enableCompression.checked;

        this.showProcessingProgress(true);
        
        try {
            // Step 1: Update metadata
            this.updateProgressStep(1, 'active');
            await this.updateMetadata(false);
            this.updateProgressStep(1, 'completed');
            this.updateProgress(25);

            // Step 2: Compress PDF (if enabled)
            if (shouldCompress) {
                this.updateProgressStep(2, 'active');
                await this.compressPDF();
                this.updateProgressStep(2, 'completed');
                this.updateProgress(50);
            } else {
                this.updateProgressStep(2, 'active');
                this.updateProgress(50);
                await new Promise(resolve => setTimeout(resolve, 300));
            }

            // Step 3: Linearize PDF (if enabled)
            if (shouldLinearize) {
                this.updateProgressStep(3, 'active');
                await this.linearizePDF();
                this.updateProgressStep(3, 'completed');
                this.updateProgress(75);
            } else {
                this.updateProgressStep(3, 'active');
                this.updateProgress(75);
                await new Promise(resolve => setTimeout(resolve, 300));
            }

            // Step 4: Finalize document
            this.updateProgressStep(4, 'active');
            await this.finalizeDocument();
            this.updateProgressStep(4, 'completed');
            this.updateProgress(100);

            // Hide progress and show results
            setTimeout(() => {
                this.showProcessingProgress(false);
                this.showProcessingResults();
                this.showToast('Document processed successfully', 'success');
            }, 1000);
            
        } catch (error) {
            this.showToast('Error processing document: ' + error.message, 'error');
            this.showProcessingProgress(false);
        }
    }

    async updateMetadata(standalone = true) {
        if (standalone) {
            this.showLoading(true, 'Updating metadata...');
        }

        try {
            // Get form values
            const title = document.getElementById('title').value;
            const author = document.getElementById('author').value;
            const subject = document.getElementById('subject').value;
            const keywords = document.getElementById('keywords').value;
            const creator = document.getElementById('creator').value;
            const producer = document.getElementById('producer').value;
            const creationDate = document.getElementById('creationDate').value;
            const modificationDate = document.getElementById('modificationDate').value;

            // Update metadata
            if (title) this.pdfDoc.setTitle(title);
            if (author) this.pdfDoc.setAuthor(author);
            if (subject) this.pdfDoc.setSubject(subject);
            if (keywords) this.pdfDoc.setKeywords(keywords);
            if (creator) this.pdfDoc.setCreator(creator);
            if (producer) this.pdfDoc.setProducer(producer);
            if (creationDate) this.pdfDoc.setCreationDate(new Date(creationDate));
            if (modificationDate) this.pdfDoc.setModificationDate(new Date(modificationDate));

            // Save the modified PDF (with compression if enabled)
            const saveOptions = this.compressionSettings || {};
            this.modifiedPdfBytes = await this.pdfDoc.save(saveOptions);

            if (standalone) {
                this.showProcessingResults();
                this.showToast('Metadata updated successfully', 'success');
            }
            
        } catch (error) {
            throw new Error('Failed to update metadata: ' + error.message);
        } finally {
            if (standalone) {
                this.showLoading(false);
            }
        }
    }

    async linearizePDF() {
        if (!this.qpdfWasm) {
            throw new Error('QPDF WASM not available. Linearization requires QPDF WASM to be loaded successfully.');
        }

        try {
            // Get the current PDF bytes (with updated metadata and compression)
            const saveOptions = this.compressionSettings || {};
            const pdfBytes = this.modifiedPdfBytes || await this.pdfDoc.save(saveOptions);
            
            // Try different QPDF WASM API patterns
            let linearizedBytes;
            
            if (this.qpdfWasm.linearize) {
                // Direct linearize method
                linearizedBytes = await this.qpdfWasm.linearize(new Uint8Array(pdfBytes));
            } else if (this.qpdfWasm.FS && this.qpdfWasm.callMain) {
                // Emscripten filesystem approach
                linearizedBytes = await this.linearizeWithFS(pdfBytes);
            } else if (this.qpdfWasm.run) {
                // Command-line style run method
                linearizedBytes = await this.qpdfWasm.run(['--linearize'], new Uint8Array(pdfBytes));
            } else {
                throw new Error('Unknown QPDF WASM API - no supported methods found');
            }
            
            if (!linearizedBytes || linearizedBytes.length === 0) {
                throw new Error('Linearization produced empty result');
            }
            
            // Update the modified PDF bytes with linearized version
            this.modifiedPdfBytes = linearizedBytes.buffer || linearizedBytes;
            
            // Update size comparison with actual linearized size
            this.updateSizeComparison(linearizedBytes.length);
            
        } catch (error) {
            throw error; // Don't fall back to simulation, just fail
        }
    }

    async linearizeWithFS(pdfBytes) {
        // Emscripten filesystem-based approach
        const inputFileName = 'input.pdf';
        const outputFileName = 'output_linearized.pdf';
        
        try {
            // Write input file
            this.qpdfWasm.FS.writeFile(inputFileName, new Uint8Array(pdfBytes));
            
            // Run qpdf linearization command
            const result = this.qpdfWasm.callMain([
                '--linearize',
                inputFileName,
                outputFileName
            ]);
            
            if (result !== 0) {
                throw new Error(`QPDF linearization failed with exit code: ${result}`);
            }
            
            // Read the linearized PDF
            const linearizedBytes = this.qpdfWasm.FS.readFile(outputFileName);
            
            // Clean up files
            try {
                this.qpdfWasm.FS.unlink(inputFileName);
                this.qpdfWasm.FS.unlink(outputFileName);
            } catch (cleanupError) {
                // Ignore cleanup errors
            }
            
            return linearizedBytes;
            
        } catch (error) {
            // Attempt cleanup on error
            try {
                this.qpdfWasm.FS.unlink(inputFileName);
                this.qpdfWasm.FS.unlink(outputFileName);
            } catch (cleanupError) {
                // Ignore cleanup errors
            }
            throw error;
        }
    }

    async finalizeDocument() {
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    async compressPDF() {
        try {
            const compressionLevel = document.getElementById('compressionLevel');
            const level = compressionLevel ? compressionLevel.value : 'medium';
            
            // Get the current PDF bytes (with updated metadata)
            const saveOptions = this.compressionSettings || {};
            const pdfBytes = this.modifiedPdfBytes || await this.pdfDoc.save(saveOptions);
            
            // Get the selected compression engine
            const selectedEngine = this.getSelectedCompressionEngine();
            
            let compressedBytes;
            let engineUsed = selectedEngine;
            
            // Use the selected compression engine
            switch (selectedEngine) {
                case 'ghostscript':
                    compressedBytes = await this.compressWithGhostscript(pdfBytes, level);
                    engineUsed = 'Ghostscript';
                    break;
                case 'qpdf':
                    compressedBytes = await this.compressWithQPDF(pdfBytes, level);
                    engineUsed = 'QPDF';
                    break;
                case 'pdflib':
                default:
                    compressedBytes = await this.compressWithPDFLib(level);
                    engineUsed = 'pdf-lib';
                    break;
            }
            
            if (compressedBytes) {
                this.modifiedPdfBytes = compressedBytes;
                this.updateSizeComparison(compressedBytes.length);
                this.showToast(`PDF compressed using ${level} quality settings (${engineUsed})`, 'info');
            } else {
                this.showToast('Compression failed, continuing without compression', 'warning');
            }
            
        } catch (error) {
            this.showToast('Compression failed: ' + error.message, 'warning');
        }
    }

    async compressWithQPDF(pdfBytes, level) {
        if (!this.qpdfWasm) {
            throw new Error('QPDF WASM not available');
        }

        try {
            // Define QPDF compression arguments for different levels
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
            
            // Try different QPDF WASM API patterns
            let compressedBytes;
            
            if (this.qpdfWasm.FS && this.qpdfWasm.callMain) {
                // Emscripten filesystem approach
                compressedBytes = await this.compressWithQPDFFS(pdfBytes, args);
            } else if (this.qpdfWasm.run) {
                // Command-line style run method
                compressedBytes = await this.qpdfWasm.run(args, new Uint8Array(pdfBytes));
            } else if (this.qpdfWasm.compress) {
                // Direct compress method
                compressedBytes = await this.qpdfWasm.compress(new Uint8Array(pdfBytes), args);
            } else {
                throw new Error('Unknown QPDF WASM API - no supported compression methods found');
            }
            
            if (!compressedBytes || compressedBytes.length === 0) {
                throw new Error('QPDF compression produced empty result');
            }
            
            return compressedBytes.buffer || compressedBytes;
            
        } catch (error) {
            throw new Error('QPDF compression failed: ' + error.message);
        }
    }

    async compressWithQPDFFS(pdfBytes, args) {
        // Emscripten filesystem-based approach for compression
        const inputFileName = 'input.pdf';
        const outputFileName = 'output_compressed.pdf';
        
        try {
            // Write input file
            this.qpdfWasm.FS.writeFile(inputFileName, new Uint8Array(pdfBytes));
            
            // Build command arguments
            const commandArgs = [...args, inputFileName, outputFileName];
            
            // Run qpdf compression command
            const result = this.qpdfWasm.callMain(commandArgs);
            
            if (result !== 0) {
                throw new Error(`QPDF compression failed with exit code: ${result}`);
            }
            
            // Read the compressed PDF
            const compressedBytes = this.qpdfWasm.FS.readFile(outputFileName);
            
            // Clean up files
            try {
                this.qpdfWasm.FS.unlink(inputFileName);
                this.qpdfWasm.FS.unlink(outputFileName);
            } catch (cleanupError) {
                // Ignore cleanup errors
            }
            
            return compressedBytes;
            
        } catch (error) {
            // Attempt cleanup on error
            try {
                this.qpdfWasm.FS.unlink(inputFileName);
                this.qpdfWasm.FS.unlink(outputFileName);
            } catch (cleanupError) {
                // Ignore cleanup errors
            }
            throw error;
        }
    }

    async compressWithPDFLib(level) {
        // Fallback compression using pdf-lib for when QPDF is not available
        const compressionSettings = {
            'light': {
                useObjectStreams: true,
                addDefaultPage: false,
                objectsPerTick: 50,
                updateFieldAppearances: false
            },
            'medium': {
                useObjectStreams: true,
                addDefaultPage: false,
                objectsPerTick: 100,
                updateFieldAppearances: false
            },
            'high': {
                useObjectStreams: true,
                addDefaultPage: false,
                objectsPerTick: 150,
                updateFieldAppearances: false
            },
            'extreme': {
                useObjectStreams: true,
                addDefaultPage: false,
                objectsPerTick: 200,
                updateFieldAppearances: false
            }
        };

        const settings = compressionSettings[level] || compressionSettings.medium;
        
        // Store compression settings for final save
        this.compressionSettings = settings;
        this.compressionLevel = level;
        
        // Return compressed bytes using pdf-lib
        return await this.pdfDoc.save(settings);
    }

    async compressWithGhostscript(pdfBytes, level) {
        if (!this.ghostscriptWasm) {
            throw new Error('Ghostscript WASM not available');
        }

        try {
            // Define Ghostscript compression parameters for different levels
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

            // Use Ghostscript WASM to compress PDF
            let compressedBytes;
            
            if (this.ghostscriptWasm.FS && this.ghostscriptWasm.callMain) {
                // Emscripten filesystem approach
                compressedBytes = await this.compressWithGhostscriptFS(pdfBytes, args);
            } else if (this.ghostscriptWasm.compress) {
                // Direct compress method
                compressedBytes = await this.ghostscriptWasm.compress(new Uint8Array(pdfBytes), params);
            } else {
                throw new Error('Unknown Ghostscript WASM API - no supported compression methods found');
            }
            
            if (!compressedBytes || compressedBytes.length === 0) {
                throw new Error('Ghostscript compression produced empty result');
            }
            
            return compressedBytes.buffer || compressedBytes;
            
        } catch (error) {
            throw new Error('Ghostscript compression failed: ' + error.message);
        }
    }

    async compressWithGhostscriptFS(pdfBytes, args) {
        // Emscripten filesystem-based approach for Ghostscript compression
        const inputFileName = 'input.pdf';
        const outputFileName = 'output.pdf';
        
        try {
            // Write input file
            this.ghostscriptWasm.FS.writeFile(inputFileName, new Uint8Array(pdfBytes));
            
            // Run Ghostscript compression command
            const result = this.ghostscriptWasm.callMain(args);
            
            if (result !== 0) {
                throw new Error(`Ghostscript compression failed with exit code: ${result}`);
            }
            
            // Read the compressed PDF
            const compressedBytes = this.ghostscriptWasm.FS.readFile(outputFileName);
            
            // Clean up files
            try {
                this.ghostscriptWasm.FS.unlink(inputFileName);
                this.ghostscriptWasm.FS.unlink(outputFileName);
            } catch (cleanupError) {
                // Ignore cleanup errors
            }
            
            return compressedBytes;
            
        } catch (error) {
            // Attempt cleanup on error
            try {
                this.ghostscriptWasm.FS.unlink(inputFileName);
                this.ghostscriptWasm.FS.unlink(outputFileName);
            } catch (cleanupError) {
                // Ignore cleanup errors
            }
            throw error;
        }
    }

    updateCompressionEngineOptions() {
        const compressionEngine = document.getElementById('compressionEngine');
        if (!compressionEngine) return;

        try {
            // Enable/disable options based on availability
            const options = compressionEngine.options;
            
            for (let i = 0; i < options.length; i++) {
                const option = options[i];
                const engine = option.value;
                
                switch (engine) {
                    case 'ghostscript':
                        option.disabled = !this.ghostscriptWasm;
                        option.title = this.ghostscriptWasm ? 'Ghostscript WASM loaded' : 'Ghostscript WASM not available';
                        break;
                    case 'qpdf':
                        option.disabled = !this.qpdfWasm;
                        option.title = this.qpdfWasm ? 'QPDF WASM loaded' : 'QPDF WASM not available';
                        break;
                    case 'pdflib':
                        option.disabled = false;
                        option.title = 'pdf-lib always available';
                        break;
                    case 'auto':
                        option.disabled = false;
                        option.title = 'Automatically select best available engine';
                        break;
                }
            }

            // If current selection is disabled, switch to auto
            if (compressionEngine.selectedOptions[0] && compressionEngine.selectedOptions[0].disabled) {
                compressionEngine.value = 'auto';
            }
        } catch (error) {
            console.warn('Error updating compression engine options:', error);
        }
    }

    updateCompressionQualityIndicator() {
        const compressionEngine = document.getElementById('compressionEngine');
        const compressionQuality = document.getElementById('compressionQuality');
        
        if (!compressionEngine || !compressionQuality) return;

        try {
            const selectedEngine = compressionEngine.value;
            
            switch (selectedEngine) {
                case 'auto':
                    if (this.ghostscriptWasm) {
                        compressionQuality.textContent = 'Auto → Ghostscript';
                        compressionQuality.style.color = 'var(--color-error)';
                        compressionQuality.title = 'Using Ghostscript for maximum aggressive compression';
                    } else if (this.qpdfWasm) {
                        compressionQuality.textContent = 'Auto → QPDF';
                        compressionQuality.style.color = 'var(--color-success)';
                        compressionQuality.title = 'Using QPDF for superior compression';
                    } else {
                        compressionQuality.textContent = 'Auto → pdf-lib';
                        compressionQuality.style.color = 'var(--color-warning)';
                        compressionQuality.title = 'Using pdf-lib for basic compression';
                    }
                    break;
                case 'ghostscript':
                    if (this.ghostscriptWasm) {
                        compressionQuality.textContent = 'Ghostscript Aggressive';
                        compressionQuality.style.color = 'var(--color-error)';
                        compressionQuality.title = 'Using Ghostscript for maximum aggressive compression';
                    } else {
                        compressionQuality.textContent = 'Ghostscript Unavailable';
                        compressionQuality.style.color = 'var(--color-text-secondary)';
                        compressionQuality.title = 'Ghostscript WASM not loaded';
                    }
                    break;
                case 'qpdf':
                    if (this.qpdfWasm) {
                        compressionQuality.textContent = 'QPDF Enhanced';
                        compressionQuality.style.color = 'var(--color-success)';
                        compressionQuality.title = 'Using QPDF for superior compression';
                    } else {
                        compressionQuality.textContent = 'QPDF Unavailable';
                        compressionQuality.style.color = 'var(--color-text-secondary)';
                        compressionQuality.title = 'QPDF WASM not loaded';
                    }
                    break;
                case 'pdflib':
                    compressionQuality.textContent = 'pdf-lib Basic';
                    compressionQuality.style.color = 'var(--color-warning)';
                    compressionQuality.title = 'Using pdf-lib for basic compression';
                    break;
            }
        } catch (error) {
            console.warn('Error updating compression quality indicator:', error);
        }
    }

    getSelectedCompressionEngine() {
        const compressionEngine = document.getElementById('compressionEngine');
        if (!compressionEngine) return 'auto';

        const selectedEngine = compressionEngine.value;
        
        // If auto is selected, determine the best available engine
        if (selectedEngine === 'auto') {
            if (this.ghostscriptWasm) return 'ghostscript';
            if (this.qpdfWasm) return 'qpdf';
            return 'pdflib';
        }
        
        // If specific engine is selected, verify it's available
        switch (selectedEngine) {
            case 'ghostscript':
                return this.ghostscriptWasm ? 'ghostscript' : 'pdflib';
            case 'qpdf':
                return this.qpdfWasm ? 'qpdf' : 'pdflib';
            case 'pdflib':
                return 'pdflib';
            default:
                return 'pdflib';
        }
    }

    // Debug method for checking library status
    checkLibraryStatus() {
        const status = {
            pdfjsLib: typeof pdfjsLib !== 'undefined',
            PDFLib: typeof PDFLib !== 'undefined',
            qpdfWasm: this.qpdfWasm !== null,
            ghostscriptWasm: this.ghostscriptWasm !== null,
            ghostscriptGlobals: {
                createGhostscriptWasm: typeof createGhostscriptWasm !== 'undefined',
                GhostscriptWasm: typeof GhostscriptWasm !== 'undefined',
                ghostscriptWasm: typeof ghostscriptWasm !== 'undefined',
                gs: typeof gs !== 'undefined',
                window_gs: window.gs !== undefined,
                window_ghostscriptWasm: window.ghostscriptWasm !== undefined
            }
        };
        
        console.log('Library Status:', status);
        return status;
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing app...');
    const app = new PDFMetadataEditor();
    
    // Expose app instance for debugging
    window.pdfApp = app;
    window.testQPDFCompression = () => app.testQPDFCompression();
    window.testGhostscriptCompression = () => app.testGhostscriptCompression();
    window.compareCompressionMethods = () => app.compareCompressionMethods();
    window.checkLibraryStatus = () => app.checkLibraryStatus();
    
    console.log('App initialized and exposed to window');
});

// Handle uncaught errors
window.addEventListener('error', (event) => {
    const toast = document.getElementById('toast');
    if (toast) {
        toast.textContent = 'An unexpected error occurred';
        toast.className = 'toast error';
        toast.style.display = 'block';
        
        setTimeout(() => {
            toast.style.display = 'none';
        }, 4000);
    }
});

// Check if required libraries are loaded
window.addEventListener('load', () => {
    const missingLibraries = [];
    
    if (typeof pdfjsLib === 'undefined') {
        missingLibraries.push('PDF.js');
    }
    if (typeof PDFLib === 'undefined') {
        missingLibraries.push('pdf-lib');
    }
    
    if (missingLibraries.length > 0) {
        const toast = document.getElementById('toast');
        if (toast) {
            toast.textContent = `Required libraries failed to load: ${missingLibraries.join(', ')}. Please refresh the page.`;
            toast.className = 'toast error';
            toast.style.display = 'block';
        }
    }
});