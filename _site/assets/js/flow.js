/* eslint-env browser */

const FLOW_TEST_PARAM = 'test=true';
const MAX_UNDO = 20;
const REGION_SPEED_DEFAULT = 1;
const DEFAULT_BASE_SPEED = 6;
const DEFAULT_LOOP_MODE = 'loop';
const DEFAULT_CROSSFADE = {
    enabled: false,
    speed: 0.3,
    min: 0.2,
    max: 0.9,
    phase: 0,
};
const OVERLAY_BASE_COUNTS = {
    rain: 140,
    snow: 100,
};
const RAIN_SPEED_RANGE = { min: 320, max: 520 };
const SNOW_SPEED_RANGE = { min: 40, max: 80 };
const DEFAULT_DEMO_IMAGE =
    'https://netwrckstatic.netwrck.com/static/uploads/epic-fort-under-siege-smoke-and-waterfall-fortress-1760226541-8fc20524.webp';
const DEFAULT_ACCENT_COLOR = '#3b82f6';
const REGION_COLORS = [
    '#7CD992',
    '#F6A96C',
    '#8AC5FF',
    '#E3A7F9',
    '#F6D86B',
    '#A4E4D7',
    '#F49FB6',
    '#B5B7F9',
];

const state = {
    host: null,
    canvas: null,
    ctx: null,
    image: null,
    imageLoaded: false,
    overlayVisible: true,
    regions: [],
    activeRegionId: null,
    animating: false,
    paused: false,
    loopMode: DEFAULT_LOOP_MODE,
    baseSpeed: DEFAULT_BASE_SPEED,
    jiggle: 0,
    lastTimestamp: null,
    frameHandle: null,
    exporting: false,
    exportRecorder: null,
    exportTimer: null,
    overlayType: 'none',
    overlayIntensity: 1,
    overlayWind: 0,
    overlaySize: 1,
    overlayParticles: [],
    overlayBufferCanvas: null,
    overlayBufferCtx: null,
    defaultImageUrl: DEFAULT_DEMO_IMAGE,
    timelineDuration: 10,
    timelineElapsed: 0,
    pendingImage: null,
    lastSuccessfulImageSrc: null,
    statusNode: null,
    harness: null,
};

const imageWaiters = [];

const ui = {
    imageLoader: null,
    brushSize: null,
    feather: null,
    jiggle: null,
    speed: null,
    loopMode: null,
    startBtn: null,
    pauseBtn: null,
    eraserBtn: null,
    clearBtn: null,
    toggleOverlayBtn: null,
    addRegionBtn: null,
    regionList: null,
    regionTemplate: null,
    overlayType: null,
    overlayIntensity: null,
    overlayWind: null,
    overlaySize: null,
    overlayRegenerateBtn: null,
    duration: null,
    fps: null,
    filename: null,
    exportBtn: null,
    cancelExportBtn: null,
    exportMaskBtn: null,
    progressText: null,
    canvasOverlay: null,
};

let readyDispatched = false;
let painting = false;
let brushPos = null;
let erasing = false;
let modifierEraserActive = false;
let eraserBeforeModifier = false;
let draggingDirection = false;
let dragStart = null;
let pendingMaskUpdate = false;
let pendingMaskRegion = null;
let regionColorIndex = 0;

function ensureStatusNode() {
    if (state.statusNode || !state.host) return;
    const node = document.createElement('p');
    node.className = 'flow-status-message';
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
    node.hidden = true;
    state.host.insertBefore(node, state.host.firstChild || null);
    state.statusNode = node;
}

function showStatus(message, tone = 'info') {
    ensureStatusNode();
    if (!state.statusNode) return;
    if (!message) {
        clearStatus();
        return;
    }
    state.statusNode.textContent = message;
    state.statusNode.dataset.tone = tone;
    state.statusNode.hidden = false;
}

function clearStatus() {
    if (!state.statusNode) return;
    state.statusNode.textContent = '';
    state.statusNode.hidden = true;
    state.statusNode.removeAttribute('data-tone');
}

function sanitizeDuration(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return 10;
    return Math.max(0.1, numeric);
}

function updateTimelineDurationFromUI() {
    const value = ui.duration
        ? sanitizeDuration(ui.duration.value)
        : state.timelineDuration;
    state.timelineDuration = sanitizeDuration(value);
    if (!state.animating) {
        state.timelineElapsed = 0;
        renderScene();
    } else {
        state.timelineElapsed %= state.timelineDuration;
    }
}

function initializeFlowTool() {
    if (typeof document === 'undefined') return;
    state.host = document.querySelector('[data-testid="flow-tool"]') || null;
    if (state.host) {
        const configuredDefault = state.host.dataset.flowDefaultImage;
        if (configuredDefault && configuredDefault.trim()) {
            state.defaultImageUrl = configuredDefault.trim();
        }
    }
    ensureStatusNode();
    state.canvas = document.getElementById('canvas');
    if (!state.canvas) return;
    state.ctx = state.canvas.getContext('2d', { willReadFrequently: true });
    ui.imageLoader = document.getElementById('imageLoader');
    ui.brushSize = document.getElementById('brushSize');
    ui.feather = document.getElementById('feather');
    ui.jiggle = document.getElementById('jiggle');
    ui.speed = document.getElementById('speed');
    ui.loopMode = document.getElementById('loopMode');
    ui.startBtn = document.getElementById('startBtn');
    ui.pauseBtn = document.getElementById('pauseBtn');
    ui.eraserBtn = document.getElementById('eraserToggleBtn');
    ui.clearBtn = document.getElementById('clearBtn');
    ui.toggleOverlayBtn = document.getElementById('toggleOverlayBtn');
    ui.addRegionBtn = document.getElementById('addRegionBtn');
    ui.regionList = document.getElementById('regionList');
    ui.regionTemplate = document.getElementById('flowRegionTemplate');
    ui.overlayType = document.getElementById('overlayType');
    ui.overlayIntensity = document.getElementById('overlayIntensity');
    ui.overlayWind = document.getElementById('overlayWind');
    ui.overlaySize = document.getElementById('overlaySize');
    ui.overlayRegenerateBtn = document.getElementById('overlayRegenerate');
    ui.duration = document.getElementById('duration');
    ui.fps = document.getElementById('fps');
    ui.filename = document.getElementById('filename');
    ui.exportBtn = document.getElementById('exportBtn');
    ui.cancelExportBtn = document.getElementById('cancelExportBtn');
    ui.exportMaskBtn = document.getElementById('exportMaskBtn');
    ui.progressText = document.getElementById('progressText');
    ui.canvasOverlay = document.getElementById('canvasDirectionOverlay');
    attachGlobalEvents();
    prepareCanvas();
    ensureRegion();
    renderScene();
    initializeTestHarness();
    markReady();
}

function attachGlobalEvents() {
    if (ui.imageLoader) {
        ui.imageLoader.addEventListener('change', (e) => {
            const file = e.target && e.target.files ? e.target.files[0] : null;
            if (!file) return;
            loadImageFromFile(file);
        });
    }
    if (ui.startBtn) {
        ui.startBtn.addEventListener('click', startAnimation);
    }
    if (ui.pauseBtn) {
        ui.pauseBtn.addEventListener('click', togglePause);
    }
    if (ui.eraserBtn) {
        ui.eraserBtn.addEventListener('click', () => {
            erasing = toggleEraserMode(erasing);
            syncEraserButton();
        });
        syncEraserButton();
    }
    if (ui.clearBtn) {
        ui.clearBtn.addEventListener('click', clearAllRegions);
    }
    if (ui.addRegionBtn) {
        ui.addRegionBtn.addEventListener('click', () => {
            const region = createRegion();
            state.regions.push(region);
            mountRegion(region);
            setActiveRegion(region.id);
            renderScene();
        });
    }
    if (ui.toggleOverlayBtn) {
        ui.toggleOverlayBtn.addEventListener('click', () => {
            state.overlayVisible = toggleOverlay(state.overlayVisible);
            ui.toggleOverlayBtn.textContent = state.overlayVisible
                ? 'Hide Guides'
                : 'Show Guides';
            renderScene();
        });
    }
    if (ui.loopMode) {
        ui.loopMode.addEventListener('change', (e) => {
            state.loopMode = e.target.value || DEFAULT_LOOP_MODE;
        });
        state.loopMode = ui.loopMode.value || DEFAULT_LOOP_MODE;
    }
    if (ui.duration) {
        const handleDurationChange = () => updateTimelineDurationFromUI();
        ui.duration.addEventListener('input', handleDurationChange);
        ui.duration.addEventListener('change', handleDurationChange);
        updateTimelineDurationFromUI();
    } else {
        state.timelineDuration = sanitizeDuration(state.timelineDuration);
    }
    if (ui.speed) {
        ui.speed.addEventListener('input', (e) => {
            state.baseSpeed = Number(e.target.value) || DEFAULT_BASE_SPEED;
        });
        state.baseSpeed = Number(ui.speed.value) || DEFAULT_BASE_SPEED;
    }
    if (ui.jiggle) {
        ui.jiggle.addEventListener('input', (e) => {
            state.jiggle = Number(e.target.value) || 0;
        });
        state.jiggle = Number(ui.jiggle.value) || 0;
    }
    if (ui.overlayType) {
        ui.overlayType.addEventListener('change', (e) => {
            state.overlayType = e.target.value || 'none';
            regenerateAllOverlayParticles(true);
            renderScene();
            maybeStartLivePreview();
        });
        state.overlayType = ui.overlayType.value || 'none';
    }
    if (ui.overlayIntensity) {
        ui.overlayIntensity.addEventListener('input', (e) => {
            state.overlayIntensity = Math.max(0, Number(e.target.value) || 0);
            regenerateAllOverlayParticles(true);
            renderScene();
            maybeStartLivePreview();
        });
        state.overlayIntensity = Math.max(
            0,
            Number(ui.overlayIntensity.value) || 0
        );
    }
    if (ui.overlayWind) {
        ui.overlayWind.addEventListener('input', (e) => {
            state.overlayWind = Number(e.target.value) || 0;
            if (!state.animating) {
                renderScene();
            }
            maybeStartLivePreview();
        });
        state.overlayWind = Number(ui.overlayWind.value) || 0;
    }
    if (ui.overlaySize) {
        ui.overlaySize.addEventListener('input', (e) => {
            state.overlaySize = clampOverlaySize(Number(e.target.value) || 1);
            ui.overlaySize.value = String(state.overlaySize);
            regenerateAllOverlayParticles(true);
            renderScene();
            maybeStartLivePreview();
        });
        state.overlaySize = clampOverlaySize(Number(ui.overlaySize.value) || 1);
        ui.overlaySize.value = String(state.overlaySize);
    }
    if (ui.overlayRegenerateBtn) {
        ui.overlayRegenerateBtn.addEventListener('click', () => {
            regenerateAllOverlayParticles(true);
            renderScene();
            maybeStartLivePreview();
        });
    }
    if (ui.exportBtn) {
        ui.exportBtn.addEventListener('click', exportAnimation);
    }
    if (ui.cancelExportBtn) {
        ui.cancelExportBtn.addEventListener('click', cancelExport);
    }
    if (ui.exportMaskBtn) {
        ui.exportMaskBtn.addEventListener('click', downloadMask);
    }
    document.addEventListener('keydown', handleKey);
    document.addEventListener('paste', handlePasteImage);
    state.canvas.addEventListener('mousedown', onCanvasPointerDown);
    state.canvas.addEventListener('mousemove', onCanvasPointerMove);
    state.canvas.addEventListener('mouseup', onCanvasPointerUp);
    state.canvas.addEventListener('mouseleave', onCanvasPointerUp);
    state.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    state.canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
    });
}

function prepareCanvas() {
    if (state.defaultImageUrl) {
        setImageSource(state.defaultImageUrl);
    } else {
        loadBlankImage(960, 540);
    }
}

function resolveImageWaiters() {
    while (imageWaiters.length) {
        const resolve = imageWaiters.shift();
        try {
            resolve(true);
        } catch (err) {
            console.warn('[flow] failed to resolve image waiter', err);
        }
    }
}

function waitForImageLoad() {
    if (state.imageLoaded && state.image) return Promise.resolve(true);
    return new Promise((resolve) => {
        imageWaiters.push(resolve);
    });
}

function applyLoadedImage(img, options = {}) {
    state.image = img;
    state.imageLoaded = true;
    state.lastSuccessfulImageSrc = img.src;
    resizeCanvas(img.width, img.height);
    resetRegionsForNewImage();
    regenerateAllOverlayParticles(true);
    regenerateGlobalOverlayParticles(true);
    renderScene();
    updateDirectionOverlay();
    resolveImageWaiters();
    if (!options.silent) {
        clearStatus();
    }
}

function setImageSource(src, options = {}) {
    if (!src) return Promise.resolve(false);
    const previousImage = state.imageLoaded && state.image ? state.image : null;
    state.imageLoaded = false;
    const candidate = new Image();
    candidate.crossOrigin = 'anonymous';
    state.pendingImage = candidate;
    const waitPromise = waitForImageLoad();
    candidate.onload = () => {
        if (state.pendingImage !== candidate) return;
        state.pendingImage = null;
        applyLoadedImage(candidate, options);
    };
    candidate.onerror = (event) => {
        if (state.pendingImage !== candidate) return;
        state.pendingImage = null;
        console.warn('[flow] failed to load image', src, event);
        showStatus(
            'Unable to load image. Try a PNG, JPG, GIF, or WebP under 10MB.',
            'error'
        );
        if (previousImage) {
            state.image = previousImage;
            state.imageLoaded = true;
            renderScene();
            updateDirectionOverlay();
            resolveImageWaiters();
            return;
        }
        loadBlankImage(960, 540, { silent: true });
    };
    candidate.src = src;
    return waitPromise;
}

function loadBlankImage(width = 960, height = 540, options = {}) {
    const temp = document.createElement('canvas');
    temp.width = width;
    temp.height = height;
    const tmpCtx = temp.getContext('2d');
    tmpCtx.fillStyle = '#1f2937';
    tmpCtx.fillRect(0, 0, width, height);
    return setImageSource(temp.toDataURL('image/png'), options);
}

function loadImageFromFile(file) {
    const reader = new FileReader();
    reader.onload = (event) => {
        if (ui.imageLoader) {
            ui.imageLoader.value = '';
        }
        const result = event && event.target ? event.target.result : '';
        if (result) {
            clearStatus();
            setImageSource(result);
        } else {
            showStatus(
                'Failed to read that file. Please try another image.',
                'error'
            );
        }
    };
    reader.onerror = () => {
        showStatus('Failed to read that file. Please try another image.', 'error');
    };
    reader.readAsDataURL(file);
}

function syncEraserButton() {
    if (!ui.eraserBtn) return;
    ui.eraserBtn.textContent = erasing ? 'Disable Eraser' : 'Enable Eraser';
}

function handlePasteImage(e) {
    if (!e || !e.clipboardData) return;
    if (isEditableTarget(e.target)) return;
    const items = e.clipboardData.items || [];
    for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (
            item &&
            item.kind === 'file' &&
            item.type &&
            item.type.startsWith('image/')
        ) {
            const file = item.getAsFile();
            if (file) {
                e.preventDefault();
                loadImageFromFile(file);
                return;
            }
        }
    }
    const text = e.clipboardData.getData('text');
    const trimmed = text ? text.trim() : '';
    if (!trimmed) return;
    if (trimmed.startsWith('data:image/') || /^https?:\/\//i.test(trimmed)) {
        e.preventDefault();
        clearStatus();
        setImageSource(trimmed);
    }
}

function resizeCanvas(width, height) {
    state.canvas.width = width;
    state.canvas.height = height;
    ensureOverlayBuffer(width, height);
}

function resetRegionsForNewImage() {
    regionColorIndex = 0;
    state.regions = [];
    state.activeRegionId = null;
    if (ui.regionList) {
        ui.regionList.innerHTML = '';
    }
    ensureRegion();
}

function ensureRegion() {
    if (!state.regions.length) {
        const region = createRegion();
        state.regions.push(region);
        mountRegion(region);
        setActiveRegion(region.id);
    } else if (!getActiveRegion()) {
        setActiveRegion(state.regions[0].id);
    } else {
        const current = getActiveRegion();
        if (!current.element) {
            mountRegion(current);
        }
    }
}

function ensureOverlayBuffer(width, height) {
    if (!state.overlayBufferCanvas) {
        state.overlayBufferCanvas = document.createElement('canvas');
        state.overlayBufferCtx = state.overlayBufferCanvas.getContext('2d');
    }
    if (
        state.overlayBufferCanvas.width !== width ||
        state.overlayBufferCanvas.height !== height
    ) {
        state.overlayBufferCanvas.width = width;
        state.overlayBufferCanvas.height = height;
        state.overlayBufferCtx = state.overlayBufferCanvas.getContext('2d');
    }
}

function regenerateGlobalOverlayParticles(force = false) {
    if (!state.canvas) return;
    ensureOverlayBuffer(state.canvas.width, state.canvas.height);
    if (state.overlayType === 'none') {
        if (force || state.overlayParticles.length) {
            state.overlayParticles = [];
        }
        return;
    }
    const count = overlayParticleCount(state.overlayType, state.overlayIntensity);
    state.overlayParticles = createOverlayParticles(
        state.overlayType,
        count,
        state.canvas.width,
        state.canvas.height,
        state.overlaySize
    );
}

function renderGlobalOverlay(deltaSeconds) {
    if (
        state.overlayType === 'none' ||
        !state.overlayParticles ||
        !state.overlayParticles.length
    ) {
        return;
    }
    ensureOverlayBuffer(state.canvas.width, state.canvas.height);
    const width = state.overlayBufferCanvas.width;
    const height = state.overlayBufferCanvas.height;
    const overlayCtx = state.overlayBufferCtx;
    overlayCtx.clearRect(0, 0, width, height);
    stepOverlayParticles(
        state.overlayParticles,
        deltaSeconds,
        state.overlayType,
        width,
        height,
        {
            wind: state.overlayWind,
            size: state.overlaySize,
        }
    );
    drawOverlayParticles(
        overlayCtx,
        state.overlayParticles,
        state.overlayType,
        state.overlaySize
    );
    state.ctx.save();
    state.ctx.globalAlpha = 1;
    state.ctx.drawImage(state.overlayBufferCanvas, 0, 0);
    state.ctx.restore();
}

function createRegion(options = {}) {
    const width = state.canvas.width;
    const height = state.canvas.height;
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
    const featherCanvas = document.createElement('canvas');
    featherCanvas.width = width;
    featherCanvas.height = height;
    const featherCtx = featherCanvas.getContext('2d', {
        willReadFrequently: true,
    });
    const layerCanvas = document.createElement('canvas');
    layerCanvas.width = width;
    layerCanvas.height = height;
    const layerCtx = layerCanvas.getContext('2d', { willReadFrequently: true });
    const overlayMaskCanvas = document.createElement('canvas');
    overlayMaskCanvas.width = width;
    overlayMaskCanvas.height = height;
    const overlayMaskCtx = overlayMaskCanvas.getContext('2d', {
        willReadFrequently: true,
    });
    const overlayBufferCanvas = document.createElement('canvas');
    overlayBufferCanvas.width = width;
    overlayBufferCanvas.height = height;
    const overlayBufferCtx = overlayBufferCanvas.getContext('2d', {
        willReadFrequently: true,
    });
    const crossfade = {
        enabled: options.crossfade?.enabled ?? DEFAULT_CROSSFADE.enabled,
        speed: options.crossfade?.speed ?? DEFAULT_CROSSFADE.speed,
        min: clamp01(options.crossfade?.min ?? DEFAULT_CROSSFADE.min),
        max: clamp01(options.crossfade?.max ?? DEFAULT_CROSSFADE.max),
        phase: options.crossfade?.phase ?? 0,
        oscillate: Boolean(options.crossfade?.oscillate ?? false),
    };
    if (crossfade.min > crossfade.max) {
        const temp = crossfade.min;
        crossfade.min = crossfade.max;
        crossfade.max = temp;
    }
    const color = assignRegionColor(options.color);
    return {
        id: `region-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: options.name || `Region ${state.regions.length + 1}`,
        color,
        maskCanvas,
        maskCtx,
        featherCanvas,
        featherCtx,
        layerCanvas,
        layerCtx,
        overlayMaskCanvas,
        overlayMaskCtx,
        overlayBufferCanvas,
        overlayBufferCtx,
        selection: null,
        direction: options.direction
            ? { x: options.direction.x, y: options.direction.y }
            : { x: 0, y: 0 },
        offset: { x: 0, y: 0 },
        crossfade,
        speed: options.speed ?? REGION_SPEED_DEFAULT,
        travelDirection: 1,
        particles: [],
        undo: [],
        centroid: null,
        metricsDirty: true,
        element: null,
        colorChip: null,
        directionSurface: null,
        directionLabel: null,
        controls: {},
    };
}

function mountRegion(region) {
    if (!ui.regionTemplate || !ui.regionList) return;
    const fragment = ui.regionTemplate.content.cloneNode(true);
    const card = fragment.querySelector('[data-flow-region]');
    card.dataset.regionId = region.id;
    const selectBtn = card.querySelector('[data-region-action="select"]');
    selectBtn.textContent = region.name;
    const colorChip = card.querySelector('[data-region-chip]');
    const duplicateBtn = card.querySelector('[data-region-action="duplicate"]');
    const deleteBtn = card.querySelector('[data-region-action="delete"]');
    const directionSurface = card.querySelector(
        '[data-region-direction-surface]'
    );
    const directionLabel = card.querySelector('[data-region-direction-label]');
    region.controls.crossfadeEnabled = card.querySelector(
        '[data-region-control="crossfadeEnabled"]'
    );
    region.controls.speed = card.querySelector('[data-region-control="speed"]');
    region.controls.crossfadeSpeed = card.querySelector(
        '[data-region-control="crossfadeSpeed"]'
    );
    region.controls.crossfadeMin = card.querySelector(
        '[data-region-control="crossfadeMin"]'
    );
    region.controls.crossfadeMax = card.querySelector(
        '[data-region-control="crossfadeMax"]'
    );
    region.controls.crossfadeOscillate = card.querySelector(
        '[data-region-control="crossfadeOscillate"]'
    );
    region.controls.crossfadeEnabled.checked = Boolean(region.crossfade.enabled);
    region.controls.speed.value = String(region.speed);
    region.controls.crossfadeSpeed.value = String(region.crossfade.speed);
    region.controls.crossfadeMin.value = String(region.crossfade.min);
    region.controls.crossfadeMax.value = String(region.crossfade.max);
    if (region.controls.crossfadeOscillate) {
        region.controls.crossfadeOscillate.checked = Boolean(
            region.crossfade.oscillate
        );
        region.controls.crossfadeOscillate.disabled = !region.crossfade.enabled;
    }
    selectBtn.addEventListener('click', () => {
        setActiveRegion(region.id);
        renderScene();
    });
    duplicateBtn.addEventListener('click', () => {
        duplicateRegion(region.id);
    });
    deleteBtn.addEventListener('click', () => {
        deleteRegion(region.id);
    });
    region.controls.crossfadeEnabled.addEventListener('change', (e) => {
        region.crossfade.enabled = Boolean(e.target.checked);
        region.crossfade.phase = 0;
        if (!region.crossfade.enabled) {
            region.offset = { x: 0, y: 0 };
        }
        if (region.controls.crossfadeOscillate) {
            region.controls.crossfadeOscillate.disabled = !region.crossfade.enabled;
        }
        stopAnimation({ resetOffsets: true });
        renderScene();
        maybeStartLivePreview();
    });
    region.controls.speed.addEventListener('input', (e) => {
        region.speed = Math.max(0, Number(e.target.value) || REGION_SPEED_DEFAULT);
    });
    region.controls.crossfadeSpeed.addEventListener('input', (e) => {
        region.crossfade.speed = Math.max(0.01, Number(e.target.value) || 0.01);
        renderScene();
        maybeStartLivePreview();
    });
    region.controls.crossfadeMin.addEventListener('input', (e) => {
        region.crossfade.min = clamp01(Number(e.target.value) || 0);
        if (region.crossfade.min > region.crossfade.max) {
            region.crossfade.max = region.crossfade.min;
            region.controls.crossfadeMax.value = String(region.crossfade.max);
        }
        renderScene();
        maybeStartLivePreview();
    });
    region.controls.crossfadeMax.addEventListener('input', (e) => {
        region.crossfade.max = clamp01(Number(e.target.value) || 0);
        if (region.crossfade.max < region.crossfade.min) {
            region.crossfade.min = region.crossfade.max;
            region.controls.crossfadeMin.value = String(region.crossfade.min);
        }
        renderScene();
        maybeStartLivePreview();
    });
    if (region.controls.crossfadeOscillate) {
        region.controls.crossfadeOscillate.addEventListener('change', (e) => {
            region.crossfade.oscillate = Boolean(e.target.checked);
            region.crossfade.phase = 0;
            region.offset = { x: 0, y: 0 };
            stopAnimation({ resetOffsets: true });
            renderScene();
            maybeStartLivePreview();
        });
    }
    installDirectionWheel(region, directionSurface, directionLabel);
    region.element = card;
    region.colorChip = colorChip;
    applyRegionAccent(region);
    ui.regionList.appendChild(fragment);
    refreshRegionSelectionState();
}

function installDirectionWheel(region, surface, label) {
    region.directionSurface = surface;
    region.directionLabel = label;
    drawDirectionWheel(region);
    surface.addEventListener('mousedown', (event) => {
        setRegionDirectionFromSurface(region, surface, event);
        window.addEventListener('mousemove', onSurfaceMove);
        window.addEventListener('mouseup', onSurfaceUp, { once: true });
    });
    function onSurfaceMove(event) {
        setRegionDirectionFromSurface(region, surface, event);
    }
    function onSurfaceUp(event) {
        setRegionDirectionFromSurface(region, surface, event);
        window.removeEventListener('mousemove', onSurfaceMove);
    }
}

function setRegionDirectionFromSurface(region, surface, event) {
    const rect = surface.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const x = event.clientX - cx;
    const y = event.clientY - cy;
    region.direction = { x, y };
    drawDirectionWheel(region);
    renderScene();
    maybeStartLivePreview();
}

function refreshRegionSelectionState() {
    const active = getActiveRegion();
    state.regions.forEach((region) => {
        if (!region.element) return;
        if (active && active.id === region.id) {
            region.element.classList.add('flow-region-active');
        } else {
            region.element.classList.remove('flow-region-active');
        }
        applyRegionAccent(region);
    });
}

function applyRegionAccent(region) {
    if (!region) return;
    if (!region.color) {
        region.color = assignRegionColor();
    }
    const accent = region.color || DEFAULT_ACCENT_COLOR;
    const softAccent = withAlpha(accent, 0.14);
    const shadowAccent = withAlpha(accent, 0.28);
    if (region.element) {
        region.element.style.setProperty('--region-accent', accent);
        region.element.style.setProperty('--region-accent-soft', softAccent);
        region.element.style.setProperty('--region-accent-shadow', shadowAccent);
    }
    if (region.colorChip) {
        region.colorChip.style.backgroundColor = accent;
        region.colorChip.style.boxShadow = `0 0 0 3px ${withAlpha(accent, 0.22)}`;
        region.colorChip.style.borderColor = withAlpha(accent, 0.45);
    }
    if (region.directionLabel) {
        region.directionLabel.style.color = accent;
    }
    if (region.directionSurface) {
        drawDirectionWheel(region);
    }
}

function setActiveRegion(id) {
    state.activeRegionId = id;
    refreshRegionSelectionState();
    updateDirectionOverlay();
}

function getActiveRegion() {
    if (!state.activeRegionId) return null;
    return (
        state.regions.find((region) => region.id === state.activeRegionId) || null
    );
}

function duplicateRegion(id) {
    const source = state.regions.find((region) => region.id === id);
    if (!source) return;
    const clone = createRegion({
        name: `${source.name} Copy`,
        direction: source.direction,
        crossfade: {
            enabled: source.crossfade.enabled,
            speed: source.crossfade.speed,
            min: source.crossfade.min,
            max: source.crossfade.max,
            phase: source.crossfade.phase,
            oscillate: source.crossfade.oscillate,
        },
        speed: source.speed,
    });
    clone.maskCtx.drawImage(source.maskCanvas, 0, 0);
    clone.featherCtx.drawImage(source.featherCanvas, 0, 0);
    if (source.layerCanvas.width && source.layerCanvas.height) {
        clone.layerCanvas.width = source.layerCanvas.width;
        clone.layerCanvas.height = source.layerCanvas.height;
        clone.layerCtx = clone.layerCanvas.getContext('2d');
        clone.layerCtx.drawImage(source.layerCanvas, 0, 0);
    }
    if (source.overlayMaskCanvas.width && source.overlayMaskCanvas.height) {
        clone.overlayMaskCanvas.width = source.overlayMaskCanvas.width;
        clone.overlayMaskCanvas.height = source.overlayMaskCanvas.height;
        clone.overlayMaskCtx = clone.overlayMaskCanvas.getContext('2d');
        clone.overlayMaskCtx.drawImage(source.overlayMaskCanvas, 0, 0);
    }
    if (source.overlayBufferCanvas.width && source.overlayBufferCanvas.height) {
        clone.overlayBufferCanvas.width = source.overlayBufferCanvas.width;
        clone.overlayBufferCanvas.height = source.overlayBufferCanvas.height;
        clone.overlayBufferCtx = clone.overlayBufferCanvas.getContext('2d');
        clone.overlayBufferCtx.drawImage(source.overlayBufferCanvas, 0, 0);
    }
    clone.selection = source.selection ? { ...source.selection } : null;
    clone.centroid = source.centroid ? { ...source.centroid } : null;
    clone.metricsDirty = false;
    clone.particles = source.particles.map((p) => ({ ...p }));
    clone.offset = { ...source.offset };
    clone.travelDirection = source.travelDirection;
    clone.crossfade.phase = source.crossfade.phase;
    clone.crossfade.oscillate = Boolean(source.crossfade.oscillate);
    state.regions.push(clone);
    mountRegion(clone);
    setActiveRegion(clone.id);
    renderScene();
}

function deleteRegion(id) {
    if (state.regions.length <= 1) return;
    const target = state.regions.find((region) => region.id === id);
    if (!target) return;
    if (target.element && target.element.parentNode) {
        target.element.parentNode.removeChild(target.element);
    }
    state.regions = state.regions.filter((region) => region.id !== id);
    if (state.activeRegionId === id) {
        const next = state.regions[0];
        setActiveRegion(next.id);
    } else {
        refreshRegionSelectionState();
    }
    renderScene();
}

function onCanvasPointerDown(e) {
    const region = ensureActiveRegionAndReturn();
    if (!region) return;
    stopAnimation();
    const pos = getMousePos(e);
    if (e.button === 0) {
        if (e.ctrlKey || e.metaKey) {
            eraserBeforeModifier = erasing;
            erasing = true;
            modifierEraserActive = true;
            syncEraserButton();
        } else {
            modifierEraserActive = false;
        }
        painting = true;
        pushUndo(region);
        drawBrush(region, pos);
    } else if (e.button === 2) {
        draggingDirection = true;
        dragStart = pos;
    }
    renderScene();
}

function onCanvasPointerMove(e) {
    const region = getActiveRegion();
    if (!region) return;
    const pos = getMousePos(e);
    brushPos = pos;
    if (painting) {
        const wantsModifier = e.ctrlKey || e.metaKey;
        if (wantsModifier && !modifierEraserActive) {
            eraserBeforeModifier = erasing;
            erasing = true;
            modifierEraserActive = true;
            syncEraserButton();
        } else if (!wantsModifier && modifierEraserActive) {
            erasing = eraserBeforeModifier;
            modifierEraserActive = false;
            syncEraserButton();
        }
        drawBrush(region, pos);
    } else if (draggingDirection) {
        region.direction = { x: pos.x - dragStart.x, y: pos.y - dragStart.y };
        drawDirectionWheel(region);
        maybeStartLivePreview();
    }
    renderScene();
}

function onCanvasPointerUp() {
    const region = getActiveRegion();
    if (!region) return;
    if (painting) {
        painting = false;
        scheduleRegionMaskUpdate(region);
    }
    if (draggingDirection) {
        draggingDirection = false;
        drawDirectionWheel(region);
        updateDirectionOverlay();
    }
    if (modifierEraserActive) {
        erasing = eraserBeforeModifier;
        modifierEraserActive = false;
        syncEraserButton();
    }
    renderScene();
    maybeStartLivePreview();
}

function ensureActiveRegionAndReturn() {
    let region = getActiveRegion();
    if (!region && state.regions.length) {
        setActiveRegion(state.regions[0].id);
        region = getActiveRegion();
    }
    return region;
}

function drawBrush(region, pos) {
    const size = Number(ui.brushSize && ui.brushSize.value) || 20;
    region.maskCtx.save();
    if (erasing) {
        region.maskCtx.globalCompositeOperation = 'destination-out';
        region.maskCtx.fillStyle = 'rgba(0,0,0,1)';
    } else {
        region.maskCtx.globalCompositeOperation = 'source-over';
        region.maskCtx.fillStyle = '#000';
    }
    region.maskCtx.beginPath();
    region.maskCtx.arc(pos.x, pos.y, size, 0, Math.PI * 2);
    region.maskCtx.fill();
    region.maskCtx.restore();
    region.metricsDirty = true;
    scheduleRegionMaskUpdate(region);
}

function pushUndo(region) {
    if (!region) return;
    if (region.undo.length >= MAX_UNDO) region.undo.shift();
    region.undo.push(
        region.maskCtx.getImageData(0, 0, state.canvas.width, state.canvas.height)
    );
}

function scheduleRegionMaskUpdate(region) {
    if (!region) return;
    pendingMaskRegion = region;
    if (typeof window === 'undefined') {
        const target = pendingMaskRegion;
        pendingMaskRegion = null;
        updateRegionMask(target);
        regenerateOverlayForRegion(target);
        if (!state.animating) {
            renderScene();
        }
        if (!painting) {
            maybeStartLivePreview();
        }
        return;
    }
    if (pendingMaskUpdate) return;
    pendingMaskUpdate = true;
    window.requestAnimationFrame(() => {
        pendingMaskUpdate = false;
        const target = pendingMaskRegion;
        pendingMaskRegion = null;
        if (!target) return;
        updateRegionMask(target);
        regenerateOverlayForRegion(target);
        if (!state.animating) {
            renderScene();
        }
        if (!painting) {
            maybeStartLivePreview();
        }
    });
}

function undoMask() {
    const region = getActiveRegion();
    if (!region || !region.undo.length) return;
    const data = region.undo.pop();
    region.maskCtx.putImageData(data, 0, 0);
    updateRegionMask(region);
    regenerateOverlayForRegion(region);
    renderScene();
    if (!painting) {
        maybeStartLivePreview();
    }
}

function clearAllRegions() {
    stopAnimation({ resetOffsets: true });
    state.regions.forEach((region) => {
        region.maskCtx.clearRect(0, 0, state.canvas.width, state.canvas.height);
        region.featherCtx.clearRect(0, 0, state.canvas.width, state.canvas.height);
        region.layerCanvas.width = 1;
        region.layerCanvas.height = 1;
        region.layerCtx = region.layerCanvas.getContext('2d');
        region.overlayMaskCanvas.width = 1;
        region.overlayMaskCanvas.height = 1;
        region.overlayMaskCtx = region.overlayMaskCanvas.getContext('2d');
        region.overlayBufferCanvas.width = 1;
        region.overlayBufferCanvas.height = 1;
        region.overlayBufferCtx = region.overlayBufferCanvas.getContext('2d');
        region.selection = null;
        region.offset = { x: 0, y: 0 };
        region.crossfade.phase = 0;
        region.particles = [];
        region.centroid = null;
        region.metricsDirty = true;
    });
    renderScene();
    updateDirectionOverlay();
}

function updateRegionMask(region) {
    if (!region) return;
    const featherValue = Number(ui.feather && ui.feather.value) || 0;
    const canvasWidth = state.canvas.width;
    const canvasHeight = state.canvas.height;
    region.featherCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    if (featherValue > 0) {
        region.featherCtx.filter = `blur(${featherValue}px)`;
    } else {
        region.featherCtx.filter = 'none';
    }
    region.featherCtx.drawImage(region.maskCanvas, 0, 0);
    const imgData = region.featherCtx.getImageData(
        0,
        0,
        canvasWidth,
        canvasHeight
    );
    region.selection = computeMaskBounds(imgData.data, canvasWidth, canvasHeight);
    region.centroid = computeMaskCentroid(
        imgData.data,
        canvasWidth,
        canvasHeight
    );
    const hasSelection =
        region.selection &&
        Number.isFinite(region.selection.w) &&
        Number.isFinite(region.selection.h) &&
        region.selection.w > 0 &&
        region.selection.h > 0;
    if (!hasSelection) {
        region.layerCanvas.width = 1;
        region.layerCanvas.height = 1;
        region.layerCtx = region.layerCanvas.getContext('2d');
        region.overlayMaskCanvas.width = 1;
        region.overlayMaskCanvas.height = 1;
        region.overlayMaskCtx = region.overlayMaskCanvas.getContext('2d');
        region.overlayBufferCanvas.width = 1;
        region.overlayBufferCanvas.height = 1;
        region.overlayBufferCtx = region.overlayBufferCanvas.getContext('2d');
        region.offset = { x: 0, y: 0 };
        region.crossfade.phase = 0;
        region.centroid = null;
        region.metricsDirty = true;
        return;
    }
    const sx = Math.max(0, Math.floor(region.selection.x));
    const sy = Math.max(0, Math.floor(region.selection.y));
    const sw = Math.max(1, Math.ceil(region.selection.w));
    const sh = Math.max(1, Math.ceil(region.selection.h));

    if (region.layerCanvas.width !== sw || region.layerCanvas.height !== sh) {
        region.layerCanvas.width = sw;
        region.layerCanvas.height = sh;
        region.layerCtx = region.layerCanvas.getContext('2d');
    } else {
        region.layerCtx.clearRect(0, 0, sw, sh);
    }
    if (
        region.overlayMaskCanvas.width !== sw ||
        region.overlayMaskCanvas.height !== sh
    ) {
        region.overlayMaskCanvas.width = sw;
        region.overlayMaskCanvas.height = sh;
        region.overlayMaskCtx = region.overlayMaskCanvas.getContext('2d');
    } else {
        region.overlayMaskCtx.clearRect(0, 0, sw, sh);
    }
    if (
        region.overlayBufferCanvas.width !== sw ||
        region.overlayBufferCanvas.height !== sh
    ) {
        region.overlayBufferCanvas.width = sw;
        region.overlayBufferCanvas.height = sh;
        region.overlayBufferCtx = region.overlayBufferCanvas.getContext('2d');
    } else {
        region.overlayBufferCtx.clearRect(0, 0, sw, sh);
    }

    region.layerCtx.clearRect(0, 0, sw, sh);
    if (state.imageLoaded && state.image) {
        region.layerCtx.drawImage(state.image, sx, sy, sw, sh, 0, 0, sw, sh);
        region.layerCtx.globalCompositeOperation = 'destination-in';
        region.layerCtx.drawImage(
            region.featherCanvas,
            sx,
            sy,
            sw,
            sh,
            0,
            0,
            sw,
            sh
        );
        region.layerCtx.globalCompositeOperation = 'source-over';
    }

    region.overlayMaskCtx.clearRect(0, 0, sw, sh);
    region.overlayMaskCtx.drawImage(
        region.featherCanvas,
        sx,
        sy,
        sw,
        sh,
        0,
        0,
        sw,
        sh
    );

    region.featherCtx.filter = 'none';
    region.offset = { x: 0, y: 0 };
    region.crossfade.phase = 0;
    region.travelDirection = 1;
    region.metricsDirty = false;
}

function ensureRegionMetrics(region) {
    if (
        !region ||
        !region.maskCtx ||
        !state.canvas ||
        (!region.metricsDirty && region.selection)
    ) {
        return;
    }
    try {
        const imgData = region.maskCtx.getImageData(
            0,
            0,
            state.canvas.width,
            state.canvas.height
        );
        region.selection = computeMaskBounds(
            imgData.data,
            state.canvas.width,
            state.canvas.height
        );
        region.centroid = computeMaskCentroid(
            imgData.data,
            state.canvas.width,
            state.canvas.height
        );
        region.metricsDirty = false;
        if (!region.selection) {
            region.centroid = null;
        }
    } catch (err) {
        console.warn('[flow] failed to evaluate mask metrics', err);
    }
}

function normalizeMaskRect(rect, width, height) {
    const defaultW = Math.max(1, Math.floor(width * 0.35));
    const defaultH = Math.max(1, Math.floor(height * 0.3));
    const rawX = Number.isFinite(rect?.x) ? rect.x : Math.floor(width * 0.3);
    const rawY = Number.isFinite(rect?.y) ? rect.y : Math.floor(height * 0.3);
    const rawW = Number.isFinite(rect?.width) ? rect.width : defaultW;
    const rawH = Number.isFinite(rect?.height) ? rect.height : defaultH;
    const x = clamp(Math.floor(rawX), 0, width - 1);
    const y = clamp(Math.floor(rawY), 0, height - 1);
    const w = clamp(Math.floor(rawW), 1, width - x);
    const h = clamp(Math.floor(rawH), 1, height - y);
    return { x, y, width: w, height: h };
}

function seedMaskRegion(region, rect) {
    if (!region || !region.maskCtx) return false;
    const width = state.canvas.width;
    const height = state.canvas.height;
    const target = normalizeMaskRect(rect || {}, width, height);
    region.maskCtx.save();
    region.maskCtx.globalCompositeOperation = 'source-over';
    region.maskCtx.clearRect(0, 0, width, height);
    region.maskCtx.fillStyle = '#000';
    region.maskCtx.fillRect(target.x, target.y, target.width, target.height);
    region.maskCtx.restore();
    region.undo = [];
    updateRegionMask(region);
    regenerateOverlayForRegion(region, true);
    renderScene();
    updateDirectionOverlay();
    maybeStartLivePreview();
    return true;
}

function setRegionDirection(region, vector) {
    if (!region) return false;
    const fallbackWidth = region.selection
        ? region.selection.w * 0.35
        : state.canvas.width * 0.25;
    const defaultX = Math.max(40, fallbackWidth);
    const defaultY = 0;
    let dirX = Number.isFinite(vector?.x) ? vector.x : defaultX;
    let dirY = Number.isFinite(vector?.y) ? vector.y : defaultY;
    const magnitude = Math.hypot(dirX, dirY);
    if (!magnitude) {
        dirX = defaultX;
        dirY = defaultY;
    }
    region.direction = { x: dirX, y: dirY };
    drawDirectionWheel(region);
    updateDirectionOverlay();
    return true;
}

function captureCanvasImageData() {
    if (!state.ctx || !state.canvas) return null;
    try {
        return state.ctx.getImageData(
            0,
            0,
            state.canvas.width,
            state.canvas.height
        );
    } catch (err) {
        console.warn('[flow] unable to capture canvas image data', err);
        return null;
    }
}

function runAnimationStep(delta = 1 / 60) {
    const step = Number.isFinite(delta) && delta > 0 ? delta : 1 / 60;
    const previousAnimating = state.animating;
    const previousPaused = state.paused;
    const previousHandle = state.frameHandle;
    const previousTimestamp = state.lastTimestamp;
    state.animating = true;
    state.paused = false;
    renderAnimatedFrame(step);
    state.animating = previousAnimating;
    state.paused = previousPaused;
    state.frameHandle = previousHandle;
    state.lastTimestamp = previousTimestamp;
    return captureCanvasImageData();
}

function regenerateOverlayForRegion(region, force = false) {
    if (!region) return;
    if (state.overlayType === 'none') {
        region.particles = [];
        return;
    }
    if (!region.selection) {
        if (!force) return;
        region.particles = [];
        return;
    }
    const count = overlayParticleCount(state.overlayType, state.overlayIntensity);
    const width = Math.max(1, Math.ceil(region.selection.w));
    const height = Math.max(1, Math.ceil(region.selection.h));
    region.particles = createOverlayParticles(
        state.overlayType,
        count,
        width,
        height,
        state.overlaySize
    );
}

function regenerateAllOverlayParticles(force = false) {
    state.regions.forEach((region) => regenerateOverlayForRegion(region, force));
    regenerateGlobalOverlayParticles(force);
}

function assignRegionColor(explicitColor) {
    if (explicitColor) return explicitColor;
    const palette = REGION_COLORS.length ? REGION_COLORS : [DEFAULT_ACCENT_COLOR];
    const color =
        palette[regionColorIndex % palette.length] || DEFAULT_ACCENT_COLOR;
    regionColorIndex += 1;
    return color;
}

function renderFrame({
    elapsed = 0,
    duration = state.timelineDuration || 10,
    delta = 0,
} = {}) {
    if (!state.ctx || !state.canvas) return 0;
    const safeDuration = Math.max(0.1, sanitizeDuration(duration));
    const normalizedTime =
        safeDuration > 0
            ? (((elapsed % safeDuration) + safeDuration) % safeDuration) /
            safeDuration
            : 0;

    state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
    if (state.imageLoaded && state.image) {
        state.ctx.drawImage(state.image, 0, 0);
    }

    const jitterActive = state.animating || delta > 0;
    const jiggleAmount = jitterActive ? state.jiggle : 0;
    let activeRegions = 0;

    state.regions.forEach((region) => {
        ensureRegionMetrics(region);
        if (!region.selection) return;
        const selection = region.selection;
        const directionLength = Math.hypot(region.direction.x, region.direction.y);
        let offset = { x: 0, y: 0 };

        if (directionLength > 0) {
            const effectiveSpeed = Math.max(0, state.baseSpeed * region.speed);
            const amplitudeScale = Math.min(1, effectiveSpeed || 1);
            const cycles =
                state.loopMode === 'once'
                    ? 1
                    : Math.max(1, Math.round(Math.max(1, effectiveSpeed || 1)));
            const cycleProgress =
                state.loopMode === 'once'
                    ? clamp01(normalizedTime)
                    : (normalizedTime * cycles) % 1;
            let travelWave = resolveTravelWave(cycleProgress, state.loopMode);
            if (region.crossfade.enabled && !region.crossfade.oscillate) {
                travelWave = cycleProgress;
            }
            const maxOffset = clampOffsetToBounds(
                {
                    x: region.direction.x,
                    y: region.direction.y,
                },
                selection
            );
            offset = {
                x: maxOffset.x * amplitudeScale * travelWave,
                y: maxOffset.y * amplitudeScale * travelWave,
            };
            region.offset = offset;
            if (amplitudeScale > 0) {
                activeRegions += 1;
            }
        } else {
            region.offset = { x: 0, y: 0 };
        }

        if (region.crossfade.enabled) {
            const speed = Math.max(0, region.crossfade.speed || 1);
            if (region.crossfade.oscillate) {
                const phase = normalizedTime * Math.PI * 2 * Math.max(1, speed);
                region.crossfade.phase = phase;
            } else {
                const cycles = Math.max(1, Math.round(Math.max(1, speed)));
                const cycleProgress =
                    state.loopMode === 'once'
                        ? clamp01(normalizedTime)
                        : (normalizedTime * cycles) % 1;
                const progress = clamp01(cycleProgress);
                region.crossfade.phase = progress;
            }
        }

        const alpha = region.crossfade.enabled
            ? computeCrossfadeAlpha(
                region.crossfade.phase,
                region.crossfade.min,
                region.crossfade.max,
                region.crossfade.oscillate
            )
            : 1;

        let normalizedTravel = 1;
        if (region.crossfade.enabled) {
            const minAlpha = Math.min(region.crossfade.min, region.crossfade.max);
            const maxAlpha = Math.max(region.crossfade.min, region.crossfade.max);
            const span = maxAlpha - minAlpha;
            normalizedTravel = span > 0 ? clamp01((alpha - minAlpha) / span) : 1;
        }

        const jx = jitterActive ? applyJiggle(0, jiggleAmount) : 0;
        const jy = jitterActive ? applyJiggle(0, jiggleAmount) : 0;

        const dx =
            selection.x + offset.x * normalizedTravel + jx * normalizedTravel;
        const dy =
            selection.y + offset.y * normalizedTravel + jy * normalizedTravel;

        state.ctx.save();
        state.ctx.globalAlpha = alpha;
        state.ctx.drawImage(region.layerCanvas, dx, dy);
        state.ctx.restore();
    });

    renderGlobalOverlay(delta);
    if (state.overlayVisible && !state.exporting) {
        drawGuides();
    } else if (painting) {
        drawBrushPreview();
    }
    return activeRegions;
}

function renderScene() {
    renderFrame({
        elapsed: state.timelineElapsed,
        duration: state.timelineDuration,
        delta: 0,
    });
}

function drawGuides() {
    const region = getActiveRegion();
    if (!region) return;
    ensureRegionMetrics(region);
    drawDirectionArrow(region);
    drawBrushPreview();
}

function drawDirectionArrow(region) {
    if (!region.direction) return;
    const magnitude = Math.hypot(region.direction.x, region.direction.y);
    if (magnitude === 0) return;
    if (!region.centroid) return;
    const accent = region.color || DEFAULT_ACCENT_COLOR;
    const origin = region.centroid;
    const normalized = {
        x: region.direction.x / magnitude,
        y: region.direction.y / magnitude,
    };
    const baseSpan = region.selection
        ? Math.max(region.selection.w || 0, region.selection.h || 0)
        : 160;
    const length = Math.min(Math.max(baseSpan * 0.5, 60), 200);
    const dest = {
        x: origin.x + normalized.x * length,
        y: origin.y + normalized.y * length,
    };
    state.ctx.save();
    state.ctx.lineWidth = 3;
    state.ctx.strokeStyle = withAlpha(accent, 0.9);
    state.ctx.fillStyle = withAlpha(accent, 0.9);
    state.ctx.beginPath();
    state.ctx.moveTo(origin.x, origin.y);
    state.ctx.lineTo(dest.x, dest.y);
    state.ctx.stroke();
    const angle = Math.atan2(normalized.y, normalized.x);
    const arrowSize = 10;
    state.ctx.beginPath();
    state.ctx.moveTo(dest.x, dest.y);
    state.ctx.lineTo(
        dest.x - Math.cos(angle - Math.PI / 6) * arrowSize,
        dest.y - Math.sin(angle - Math.PI / 6) * arrowSize
    );
    state.ctx.lineTo(
        dest.x - Math.cos(angle + Math.PI / 6) * arrowSize,
        dest.y - Math.sin(angle + Math.PI / 6) * arrowSize
    );
    state.ctx.closePath();
    state.ctx.fill();
    state.ctx.restore();
}

function drawBrushPreview() {
    if (!brushPos || !ui.brushSize) return;
    const size = Number(ui.brushSize.value) || 20;
    const region = getActiveRegion();
    const accent = region
        ? withAlpha(region.color || DEFAULT_ACCENT_COLOR, 0.45)
        : 'rgba(255,255,255,0.9)';
    state.ctx.save();
    state.ctx.strokeStyle = accent;
    state.ctx.lineWidth = 1;
    state.ctx.beginPath();
    state.ctx.arc(brushPos.x, brushPos.y, size, 0, Math.PI * 2);
    state.ctx.stroke();
    state.ctx.restore();
}

function updateDirectionOverlay() {
    const region = getActiveRegion();
    if (!ui.canvasOverlay) return;
    if (!region) {
        ui.canvasOverlay.textContent = '';
        ui.canvasOverlay.style.color = DEFAULT_ACCENT_COLOR;
        return;
    }
    ensureRegionMetrics(region);
    if (!region.centroid) {
        ui.canvasOverlay.textContent = '';
        ui.canvasOverlay.style.color = DEFAULT_ACCENT_COLOR;
        return;
    }
    const angle = Math.atan2(region.direction.y, region.direction.x);
    if (!Number.isFinite(angle)) {
        ui.canvasOverlay.textContent = 'Direction: 0Â°';
    } else {
        const degrees = Math.round((angle * 180) / Math.PI);
        const magnitude = Math.round(
            Math.hypot(region.direction.x, region.direction.y)
        );
        ui.canvasOverlay.textContent = `Direction: ${degrees}Â° â€¢ ${magnitude}px`;
    }
    ui.canvasOverlay.style.color = region.color || DEFAULT_ACCENT_COLOR;
}

function hasPlayableRegion() {
    return state.regions.some((region) => {
        ensureRegionMetrics(region);
        const magnitude = Math.hypot(region.direction.x, region.direction.y);
        return region.selection && magnitude > 0;
    });
}

function maybeStartLivePreview() {
    if (painting) return;
    if (state.exporting) return;
    if (state.animating) return;
    if (state.paused) return;
    if (hasPlayableRegion()) {
        startAnimation();
    }
}

function stopAnimation({ resetOffsets = false } = {}) {
    if (state.frameHandle) {
        cancelAnimationFrame(state.frameHandle);
        state.frameHandle = null;
    }
    state.animating = false;
    state.lastTimestamp = null;
    state.paused = false;
    if (resetOffsets) {
        state.regions.forEach((region) => {
            region.offset = { x: 0, y: 0 };
            region.crossfade.phase = 0;
            region.travelDirection = 1;
        });
    }
    if (ui.pauseBtn) {
        ui.pauseBtn.textContent = 'Pause';
    }
    state.timelineElapsed = 0;
}

function startAnimation() {
    if (state.animating && state.frameHandle) {
        cancelAnimationFrame(state.frameHandle);
        state.frameHandle = null;
    }
    const canAnimate = state.regions.some((region) => {
        const length = Math.hypot(region.direction.x, region.direction.y);
        return region.selection && length > 0;
    });
    if (!canAnimate) {
        state.animating = false;
        return;
    }
    state.animating = true;
    state.paused = false;
    state.lastTimestamp = null;
    state.timelineDuration = sanitizeDuration(
        ui.duration ? ui.duration.value : state.timelineDuration
    );
    state.timelineElapsed = 0;
    state.regions.forEach((region) => {
        region.offset = { x: 0, y: 0 };
        region.crossfade.phase = 0;
        region.travelDirection = 1;
    });
    if (ui.pauseBtn) {
        ui.pauseBtn.textContent = 'Pause';
    }
    state.frameHandle = window.requestAnimationFrame(tick);
}

function tick(timestamp) {
    if (!state.animating || state.paused) {
        state.frameHandle = null;
        return;
    }
    if (state.lastTimestamp === null) {
        state.lastTimestamp = timestamp;
    }
    const delta = (timestamp - state.lastTimestamp) / 1000;
    state.lastTimestamp = timestamp;
    const duration = Math.max(0.1, state.timelineDuration);
    if (Number.isFinite(delta) && delta > 0) {
        state.timelineElapsed += delta;
        if (
            state.loopMode === 'once' &&
            !state.exporting &&
            state.timelineElapsed >= duration
        ) {
            state.timelineElapsed = duration;
            renderAnimatedFrame(delta);
            stopAnimation();
            return;
        }
        if (state.timelineElapsed >= duration) {
            state.timelineElapsed %= duration;
        }
    }
    renderAnimatedFrame(delta);
    state.frameHandle = window.requestAnimationFrame(tick);
}

function renderAnimatedFrame(delta) {
    const activeRegions = renderFrame({
        elapsed: state.timelineElapsed,
        duration: state.timelineDuration,
        delta,
    });
    if (!activeRegions && !state.exporting) {
        stopAnimation();
    }
}

function togglePause() {
    state.paused = togglePauseState(state.paused);
    if (state.paused) {
        if (state.frameHandle) cancelAnimationFrame(state.frameHandle);
        state.frameHandle = null;
        if (ui.pauseBtn) ui.pauseBtn.textContent = 'Resume';
    } else {
        state.lastTimestamp = null;
        if (ui.pauseBtn) ui.pauseBtn.textContent = 'Pause';
        if (state.animating) {
            state.frameHandle = window.requestAnimationFrame(tick);
        }
    }
}

function exportAnimation() {
    if (state.exporting) return;
    const hasDirection = state.regions.some((region) => {
        const magnitude = Math.hypot(region.direction.x, region.direction.y);
        return region.selection && magnitude > 0;
    });
    if (!hasDirection) return;
    const fps = Math.max(1, Number(ui.fps && ui.fps.value) || 24);
    const duration = sanitizeDuration(ui.duration && ui.duration.value);
    const filename = defaultFilename(ui.filename && ui.filename.value);
    const stream = state.canvas.captureStream(fps);
    const recorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9',
    });
    const chunks = [];
    recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
            chunks.push(event.data);
        }
    };
    recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        state.exporting = false;
        if (ui.progressText) ui.progressText.textContent = '';
        renderScene();
    };
    state.exporting = true;
    state.exportRecorder = recorder;
    recorder.start();
    startAnimation();
    renderAnimatedFrame(0);
    const totalFrames = calculateTotalFrames(duration, fps);
    let currentFrame = 0;
    if (ui.progressText) ui.progressText.textContent = '0%';
    state.exportTimer = setInterval(() => {
        currentFrame += 1;
        if (ui.progressText) {
            ui.progressText.textContent = `${Math.min(
                100,
                Math.floor(progressPercent(currentFrame, totalFrames))
            )}%`;
        }
        if (currentFrame >= totalFrames) {
            cancelInterval(state.exportTimer);
            if (recorder.state !== 'inactive') recorder.stop();
        }
    }, 1000 / fps);
}

function cancelExport() {
    if (!state.exporting) return;
    state.exporting = false;
    cancelInterval(state.exportTimer);
    state.exportTimer = null;
    if (state.exportRecorder && state.exportRecorder.state !== 'inactive') {
        state.exportRecorder.stop();
    }
    if (ui.progressText) ui.progressText.textContent = '';
    renderScene();
}

function downloadMask() {
    const region = getActiveRegion();
    if (!region) return;
    const link = document.createElement('a');
    const base = ui.filename ? ui.filename.value : '';
    link.href = region.maskCanvas.toDataURL('image/png');
    link.download = maskFilename(base);
    link.click();
}

function cancelInterval(timer) {
    if (timer) clearInterval(timer);
}

function handleKey(e) {
    if (isEditableTarget(e.target)) return;
    const key = typeof e.key === 'string' ? e.key.toLowerCase() : '';
    if (key === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        undoMask();
        return;
    }
    if (key === 'h') {
        state.overlayVisible = toggleOverlay(state.overlayVisible);
        if (ui.toggleOverlayBtn) {
            ui.toggleOverlayBtn.textContent = state.overlayVisible
                ? 'Hide Guides'
                : 'Show Guides';
        }
        renderScene();
    } else if (key === 'u') {
        undoMask();
    } else if (key === 'e') {
        erasing = toggleEraserMode(erasing);
        syncEraserButton();
    }
}

function isEditableTarget(target) {
    if (!target) return false;
    const tag = target.tagName ? target.tagName.toLowerCase() : '';
    return tag === 'input' || tag === 'textarea' || target.isContentEditable;
}

function getMousePos(event) {
    const rect = state.canvas.getBoundingClientRect();
    const scaleX = rect.width ? state.canvas.width / rect.width : 1;
    const scaleY = rect.height ? state.canvas.height / rect.height : 1;
    return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY,
    };
}

function drawDirectionWheel(region) {
    if (!region.directionSurface) return;
    const surface = region.directionSurface;
    const ctx = surface.getContext('2d');
    const size = surface.width;
    const center = size / 2;
    const accent = region.color || DEFAULT_ACCENT_COLOR;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(center, center);
    ctx.strokeStyle = withAlpha(accent, 0.28);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, center - 4, 0, Math.PI * 2);
    ctx.stroke();
    const magnitude = Math.hypot(region.direction.x, region.direction.y);
    if (magnitude > 0) {
        const angle = Math.atan2(region.direction.y, region.direction.x);
        const arrowRadius = center - 10;
        const x = Math.cos(angle) * arrowRadius;
        const y = Math.sin(angle) * arrowRadius;
        ctx.strokeStyle = withAlpha(accent, 0.9);
        ctx.fillStyle = withAlpha(accent, 0.9);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
        if (region.directionLabel) {
            const degrees = Math.round((angle * 180) / Math.PI);
            const length = Math.round(magnitude);
            region.directionLabel.textContent = `${degrees}Â° â€¢ ${length}px`;
        }
    } else if (region.directionLabel) {
        region.directionLabel.textContent = 'Idle';
    }
    ctx.restore();
    updateDirectionOverlay();
}

function initializeTestHarness() {
    if (typeof document === 'undefined') return;
    const isTestMode =
        window.location &&
        typeof window.location.search === 'string' &&
        window.location.search.includes(FLOW_TEST_PARAM);
    if (!isTestMode || state.harness) return;
    const harness = {
        isActive: true,
        async waitForImage() {
            await waitForImageLoad();
            return true;
        },
        setValue(name, value) {
            const el = resolveFlowControl(name);
            if (!el) return false;
            if (el.type === 'checkbox' || el.type === 'radio') {
                el.checked = Boolean(value);
                el.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            }
            el.value = value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
        },
        click(name) {
            const el = resolveFlowAction(name);
            if (!el) return false;
            el.click();
            return true;
        },
        async prepareTestScene(options = {}) {
            await waitForImageLoad();
            clearAllRegions();
            const region = ensureActiveRegionAndReturn();
            if (!region) return false;
            const maskRect = options.mask || {};
            seedMaskRegion(region, maskRect);
            setRegionDirection(region, options.direction || null);
            if (typeof options.baseSpeed === 'number' && ui.speed) {
                ui.speed.value = String(options.baseSpeed);
                ui.speed.dispatchEvent(new Event('input', { bubbles: true }));
            }
            if (typeof options.jiggle === 'number' && ui.jiggle) {
                ui.jiggle.value = String(options.jiggle);
                ui.jiggle.dispatchEvent(new Event('input', { bubbles: true }));
            }
            if (options.overlayType) {
                this.setValue('overlayType', options.overlayType);
            } else if (ui.overlayType && ui.overlayType.value !== 'none') {
                this.setValue('overlayType', 'none');
            }
            renderScene();
            return true;
        },
        seedMask(rect) {
            const region = ensureActiveRegionAndReturn();
            if (!region) return false;
            return seedMaskRegion(region, rect || {});
        },
        setDirection(vector) {
            const region = ensureActiveRegionAndReturn();
            if (!region) return false;
            return setRegionDirection(region, vector || null);
        },
        startAnimation() {
            startAnimation();
            return true;
        },
        stopAnimation() {
            stopAnimation();
            return true;
        },
        stepAnimation(delta) {
            runAnimationStep(typeof delta === 'number' ? delta : 1 / 30);
            return true;
        },
        captureImageData() {
            return captureCanvasImageData();
        },
        captureDataURL(type, quality) {
            const format = type || 'image/webp';
            const q = typeof quality === 'number' ? quality : 0.92;
            return state.canvas.toDataURL(format, q);
        },
        getCanvasSize() {
            return { width: state.canvas.width, height: state.canvas.height };
        },
        reset() {
            clearAllRegions();
            return true;
        },
        wait(ms) {
            return new Promise((resolve) => setTimeout(resolve, ms || 0));
        },
        getOverlayState() {
            const region = getActiveRegion();
            return {
                type: state.overlayType,
                intensity: state.overlayIntensity,
                regionParticles:
                    region && region.particles ? region.particles.length : 0,
                globalParticles: state.overlayParticles.length,
            };
        },
        status() {
            const region = getActiveRegion();
            return {
                regions: state.regions.length,
                animating: state.animating,
                overlayType: state.overlayType,
                hasSelection: Boolean(region && region.selection),
            };
        },
    };
    state.harness = harness;
    window.flowToolHarness = harness;
}

function resolveFlowControl(name) {
    if (typeof document === 'undefined' || !name) return null;
    return (
        document.querySelector(`[data-flow-control="${name}"]`) ||
        document.getElementById(name)
    );
}

function resolveFlowAction(name) {
    if (typeof document === 'undefined' || !name) return null;
    return (
        document.querySelector(`[data-flow-action="${name}"]`) ||
        document.getElementById(name)
    );
}

function markReady() {
    if (readyDispatched) return;
    readyDispatched = true;
    if (typeof document !== 'undefined') {
        const event = new CustomEvent('flow-tool-ready', {
            detail: {
                canvasReady: Boolean(state.canvas),
                hasContext: Boolean(state.ctx),
            },
        });
        document.dispatchEvent(event);
    }
    if (typeof window !== 'undefined') {
        window.__flowToolReady = true;
    }
}

function toggleOverlay(current) {
    return !current;
}

function togglePauseState(current) {
    return !current;
}

function toggleEraserMode(current) {
    return !current;
}

function withAlpha(color, alpha) {
    const value = clamp01(Number.isFinite(alpha) ? alpha : Number(alpha));
    if (!color) return `rgba(59,130,246,${value})`;
    if (color.startsWith('#')) {
        const rgb = hexToRgb(color);
        if (!rgb) return `rgba(59,130,246,${value})`;
        return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${value})`;
    }
    if (color.startsWith('rgb')) {
        const rgb = parseRgbString(color);
        if (!rgb) return `rgba(59,130,246,${value})`;
        return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${value})`;
    }
    return color;
}

function parseRgbString(input) {
    if (!input) return null;
    const matches = input.match(/\d+(?:\.\d+)?/g);
    if (!matches || matches.length < 3) return null;
    return {
        r: Number(matches[0]),
        g: Number(matches[1]),
        b: Number(matches[2]),
    };
}

function hexToRgb(hex) {
    if (!hex) return null;
    let normalized = hex.replace('#', '');
    if (normalized.length === 3) {
        normalized = normalized
            .split('')
            .map((ch) => ch + ch)
            .join('');
    }
    if (normalized.length !== 6) return null;
    const intVal = Number.parseInt(normalized, 16);
    if (Number.isNaN(intVal)) return null;
    return {
        r: (intVal >> 16) & 255,
        g: (intVal >> 8) & 255,
        b: intVal & 255,
    };
}

function calculateNextOffset(prev, dir, speed) {
    return {
        x: prev.x + dir.x * speed,
        y: prev.y + dir.y * speed,
    };
}

function applyJiggle(value, amplitude) {
    return value + (Math.random() - 0.5) * amplitude;
}

function calculateTotalFrames(duration, fps) {
    return Math.floor(duration * fps);
}

function progressPercent(current, total) {
    if (!total) return 0;
    return (current / total) * 100;
}

function defaultFilename(name) {
    return name && name.trim() ? name.trim() : 'flow.webm';
}

function computeMaskBounds(data, width, height) {
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const alpha = data[(y * width + x) * 4 + 3];
            if (alpha > 0) {
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
        }
    }
    if (maxX < minX || maxY < minY) return null;
    return {
        x: minX,
        y: minY,
        w: maxX - minX + 1,
        h: maxY - minY + 1,
    };
}

function computeMaskCentroid(data, width, height) {
    let sumX = 0;
    let sumY = 0;
    let total = 0;
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const alpha = data[(y * width + x) * 4 + 3];
            if (alpha > 0) {
                sumX += x * alpha;
                sumY += y * alpha;
                total += alpha;
            }
        }
    }
    if (!total) return null;
    return {
        x: sumX / total,
        y: sumY / total,
    };
}

function computeCrossfadeAlpha(phase, minAlpha, maxAlpha, oscillate = true) {
    const safeMin = clamp01(Math.min(minAlpha, maxAlpha));
    const safeMax = clamp01(Math.max(minAlpha, maxAlpha));
    const amplitude = safeMax - safeMin;
    let normalized;
    if (oscillate) {
        const radians = Number.isFinite(phase) ? phase : 0;
        normalized = (Math.sin(radians) + 1) / 2;
    } else {
        normalized = clamp01(Number.isFinite(phase) ? phase : 0);
        normalized = 1 - normalized;
    }
    return safeMin + amplitude * normalized;
}

function advancePhase(phase, deltaSeconds, speed, oscillate = true) {
    const hasSpeed = speed && speed > 0 && deltaSeconds;
    const tau = Math.PI * 2;
    if (oscillate) {
        const current = Number.isFinite(phase) ? phase : 0;
        if (!hasSpeed) {
            return ((current % tau) + tau) % tau;
        }
        const next = current + deltaSeconds * speed * tau;
        return ((next % tau) + tau) % tau;
    }
    let progress = clamp01(Number.isFinite(phase) ? phase : 0);
    if (!hasSpeed) return progress;
    progress += deltaSeconds * speed;
    if (progress >= 1) return 1;
    if (progress <= 0) return 0;
    return progress;
}

function hasExceededBounds(offset, bounds) {
    if (!bounds) return false;
    const limitX = Math.abs(bounds.w) || 0;
    const limitY = Math.abs(bounds.h) || 0;
    return Math.abs(offset.x) > limitX || Math.abs(offset.y) > limitY;
}

function clampOffsetToBounds(offset, bounds) {
    if (!bounds) return { x: 0, y: 0 };
    const limitX = Math.abs(bounds.w) || 0;
    const limitY = Math.abs(bounds.h) || 0;
    return {
        x: clamp(offset.x, -limitX, limitX),
        y: clamp(offset.y, -limitY, limitY),
    };
}

function resolveTravelWave(progress, mode) {
    const t = clamp01(progress);
    if (mode === 'once') {
        return t;
    }
    if (mode === 'pingpong') {
        return t < 0.5 ? t * 2 : 2 - t * 2;
    }
    return 0.5 - 0.5 * Math.cos(t * Math.PI * 2);
}

function maskFilename(name) {
    const trimmed = name ? name.trim() : '';
    if (!trimmed) return 'flow-mask.png';
    if (/\.png$/i.test(trimmed)) return trimmed;
    const withoutExt = trimmed.replace(/\.[^/.]+$/g, '');
    const base = withoutExt || 'flow-mask';
    return `${base}.png`;
}

function clamp01(value) {
    const num = Number(value);
    if (Number.isNaN(num)) return 0;
    if (num < 0) return 0;
    if (num > 1) return 1;
    return num;
}

function clampOverlaySize(value) {
    if (!Number.isFinite(value) || value <= 0) return 0.5;
    if (value > 4) return 4;
    return value;
}

function overlayParticleCount(type, intensity = 1) {
    const base = OVERLAY_BASE_COUNTS[type] || 0;
    const multiplier = Math.max(0, Number(intensity) || 0);
    return Math.max(0, Math.round(base * multiplier));
}

function createOverlayParticles(type, count, width, height, size) {
    const particles = [];
    if (!count) return particles;
    if (type === 'rain') {
        for (let i = 0; i < count; i += 1) {
            particles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                speed: randomRange(RAIN_SPEED_RANGE.min, RAIN_SPEED_RANGE.max),
                length: randomRange(12, 20),
            });
        }
    } else if (type === 'snow') {
        for (let i = 0; i < count; i += 1) {
            particles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                speed: randomRange(SNOW_SPEED_RANGE.min, SNOW_SPEED_RANGE.max),
                radius: randomRange(1, 3),
                drift: randomRange(-30, 30),
            });
        }
    }
    return particles;
}

function stepOverlayParticles(
    particles,
    deltaSeconds,
    type,
    width,
    height,
    options
) {
    if (!particles || !particles.length) return particles;
    const dt = Number(deltaSeconds);
    if (!Number.isFinite(dt) || dt <= 0) {
        return particles;
    }
    const w = Math.max(1, Math.floor(width || 0));
    const h = Math.max(1, Math.floor(height || 0));
    const scale = clampOverlaySize(options.size || 1);
    const horizontalWind = Number(options.wind) || 0;
    if (type === 'rain') {
        const minReset = 20 * scale;
        for (const drop of particles) {
            const length = (drop.length || 12) * scale;
            drop.y += (drop.speed || RAIN_SPEED_RANGE.min) * dt;
            drop.x += horizontalWind * dt;
            if (drop.y > h + length) {
                drop.y = -Math.max(length, minReset);
                drop.x = Math.random() * w;
            }
            drop.x = wrapValue(drop.x, w);
        }
    } else if (type === 'snow') {
        for (const flake of particles) {
            const radius = Math.max(0.5, (flake.radius || 1) * scale);
            const drift = Number(flake.drift) || 0;
            flake.y += (flake.speed || SNOW_SPEED_RANGE.min) * dt;
            flake.x += (drift + horizontalWind) * dt * 0.25;
            if (flake.y > h + radius) {
                flake.y = -radius;
                flake.x = Math.random() * w;
            }
            if (flake.x < -radius) {
                flake.x = w + radius;
            } else if (flake.x > w + radius) {
                flake.x = -radius;
            }
        }
    }
    return particles;
}

function drawOverlayParticles(targetCtx, particles, type, sizeFactor) {
    if (!particles.length) return;
    const scale = clampOverlaySize(sizeFactor);
    if (type === 'rain') {
        targetCtx.save();
        targetCtx.strokeStyle = 'rgba(180, 220, 255, 0.75)';
        targetCtx.lineWidth = Math.max(0.5, scale);
        targetCtx.lineCap = 'round';
        targetCtx.beginPath();
        for (const drop of particles) {
            const length = (drop.length || 12) * scale;
            targetCtx.moveTo(drop.x, drop.y);
            targetCtx.lineTo(drop.x, drop.y + length);
        }
        targetCtx.stroke();
        targetCtx.restore();
        return;
    }
    if (type === 'snow') {
        targetCtx.save();
        targetCtx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        for (const flake of particles) {
            const radius = Math.max(0.5, (flake.radius || 1.2) * scale);
            targetCtx.beginPath();
            targetCtx.arc(flake.x, flake.y, radius, 0, Math.PI * 2);
            targetCtx.fill();
        }
        targetCtx.restore();
    }
}

function randomRange(min, max) {
    return min + Math.random() * (max - min);
}

function wrapValue(value, max) {
    if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) {
        return 0;
    }
    let result = value % max;
    if (result < 0) {
        result += max;
    }
    return result;
}

function clamp(value, min, max) {
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

function clearStateObj() {
    return {
        selection: null,
        direction: null,
        regionCanvas: null,
        offset: { x: 0, y: 0 },
    };
}

function serializeState(selection, direction) {
    return JSON.stringify({ selection, direction });
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeFlowTool);
    } else {
        initializeFlowTool();
    }
}

export {
    advancePhase,
    applyJiggle,
    calculateNextOffset,
    calculateTotalFrames,
    clamp01,
    clampOffsetToBounds,
    clampOverlaySize,
    clearStateObj,
    computeCrossfadeAlpha,
    computeMaskBounds,
    computeMaskCentroid,
    createOverlayParticles,
    defaultFilename,
    maskFilename,
    overlayParticleCount,
    progressPercent,
    serializeState,
    stepOverlayParticles,
    toggleEraserMode,
    toggleOverlay,
    togglePauseState,
    hasExceededBounds,
};