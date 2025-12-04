/* ============================
 * Variables y configuración 
 * ============================ */
let videoData = [], videoIndex = 0, videoId = "", partes = [], current = 0;
let allowSound = false, progressInterval, currentProgress = 0, paused = false, hideTimeout;
let partObserver; 
let isHandlingRoute = false; 
let isInitialRouteLoading = false; // 🔥🔥🔥 CORRECCIÓN 1: Nueva Bandera de estado de carga inicial

/* Configuración de Paginación */
const LIMIT = 10;
let currentPage = 0;
let hasMore = true; 

/* URL de la API */
const BASE_URL = "https://server-viewdiful.onrender.com";

/* Selectores cortos */
const $ = id => document.getElementById(id);
const scrollContainer = $('tiktok-scroll-container');
const playerFrame = $('player-frame'); 

/* URL base para miniaturas */
const THUMBNAIL_BASE_URL = "https://raw.githubusercontent.com/johnclivergastonpascal/server_viewdiful/main/";


// ====================================================================
// ===== FUNCIONES PRINCIPALES DE CARGA Y PAGINACIÓN ==================
// ====================================================================

/* ===== CARGAR JSON (API Paginada) - LÓGICA DE PRIORIDAD DE RUTA ===== */
async function loadJSON(){ 
    // 1. Cargar la primera página (página 0)
    await loadPage(0);

    // 2. Inicializar botones y UI (omito detalles)
    setupLoadMoreButton(); 
    buildThumbnails(); 
    buildThumbnails('search-results', []); 

    // 3. CONTROL DE PRIORIDAD
    if(videoData.length) {
        // PRIO 1: Intentamos manejar la ruta del hash.
        const routeHandled = await handleRoute(); 
        
        if (!routeHandled) {
            // PRIO 2: SÓLO si NO se manejó ninguna ruta (URL base o hash inválido), 
            // cargamos el video aleatorio.
            await loadRandomVideo();
        }
    } else {
        $('title-bar').innerText = "No hay videos o la API no responde";
    }
}

// --- FUNCIÓN PARA CARGAR PÁGINAS ESPECÍFICAS (Se mantiene igual) ---
async function loadPage(pageNumber) {
    const loadMoreButton = $('load-more-btn');
    if (!hasMore && pageNumber > 0) {
        if(loadMoreButton) loadMoreButton.innerText = 'No hay más videos.';
        updateLoadMoreButtonClones(loadMoreButton); 
        return;
    }

    const url = `${BASE_URL}/videos?page=${pageNumber}&limit=${LIMIT}`;
    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Error HTTP: ${res.status}`);
        }
        const newVideos = await res.json();
        
        const startIdx = videoData.length;

        if (newVideos.length === 0 || newVideos.length < LIMIT) {
            hasMore = false;
        } else {
            hasMore = true;
        }
        
        if (loadMoreButton) {
            loadMoreButton.innerText = hasMore ? `Ver más videos` : 'No hay más videos.';
            loadMoreButton.disabled = !hasMore;
        }
        
        videoData = videoData.concat(newVideos);
        currentPage = pageNumber; 

        if (newVideos.length > 0) {
            buildScrollPages(startIdx);
        }

        if ($('explore-panel')?.classList.contains('open')) {
            buildThumbnails('thumbnails-container', videoData);
        }
        if ($('search-panel')?.classList.contains('open')) {
             buildSearchResults($('search-input').value || '');
        }
        
        const originalButton = $('load-more-btn');
        if (originalButton) {
            updateLoadMoreButtonClones(originalButton);
        }

    } catch (err) {
        console.error("❌ Error cargando la API paginada.", err);
        hasMore = false;
        if(loadMoreButton) {
            loadMoreButton.innerText = 'Error al cargar.';
            loadMoreButton.disabled = true;
        }
        if (pageNumber === 0) {
            $('title-bar').innerText = "Error al cargar la API";
        }
        
        const originalButton = $('load-more-btn');
        if (originalButton) {
            updateLoadMoreButtonClones(originalButton);
        }
    }
}

// --- FUNCIÓN PARA CREAR Y CONFIGURAR EL BOTÓN "VER MÁS" (Se mantiene igual) ---
function setupLoadMoreButton() {
    let loadMoreButton = $('load-more-btn');
    
    if (loadMoreButton) {
        updateLoadMoreButtonClones(loadMoreButton);
        return;
    }

    loadMoreButton = document.createElement('button');
    loadMoreButton.id = 'load-more-btn';
    loadMoreButton.className = 'load-more-button'; 
    loadMoreButton.innerText = hasMore ? `Ver más videos` : 'No hay más videos.';
    loadMoreButton.disabled = !hasMore;
    
    const loadNextPage = async (btn) => {
        btn.innerText = 'Cargando...';
        btn.disabled = true;
        await loadPage(currentPage + 1);
    };
    
    loadMoreButton.onclick = () => loadNextPage(loadMoreButton);

    if (scrollContainer) {
        scrollContainer.appendChild(loadMoreButton);
    }
    
    updateLoadMoreButtonClones(loadMoreButton);
}

// --- FUNCIÓN HELPER PARA CLONAR Y SINCRONIZAR EL BOTÓN (Se mantiene igual) ---
/* Asegúrate de que esta función loadPanelAd() esté definida en script.js,
   como te la proporcioné en la respuesta anterior:

function loadPanelAd(containerId) {
    const container = document.getElementById(containerId);
    if (container) { container.innerHTML = ''; } else { return; }
    // ... (resto del código de inyección del script de anuncio) ...
}
*/

function updateLoadMoreButtonClones(originalButton) {
    const explorerContainer = $('explore-load-more');
    const searchContainer = $('search-load-more');
    
    const btnText = originalButton.innerText;
    const btnDisabled = originalButton.disabled;

    // 🔴 Lógica de manejo de clic modificada
    const handleClick = async (clone) => {
        clone.innerText = 'Cargando...';
        clone.disabled = true;
        
        await loadPage(currentPage + 1); // Espera que cargue el nuevo contenido
        
        // 1. Identificar si el clic vino del botón de Explorar o de Buscar
        const isExploreButton = clone.id === 'explore-load-more-btn';
        
        // 2. 🔴 Llamar a loadPanelAd para recargar el anuncio correspondiente
        if (isExploreButton) {
            loadPanelAd('explore-ad-container');
        } else {
            loadPanelAd('search-ad-container');
        }

        updateLoadMoreButtonClones(originalButton); 
    };
    // ----------------------------------------------------

    if (explorerContainer) {
        explorerContainer.innerHTML = '';
        const clone = originalButton.cloneNode(true);
        clone.id = 'explore-load-more-btn'; // Se mantiene este ID para identificarlo
        clone.innerText = btnText;
        clone.disabled = btnDisabled;
        
        clone.onclick = () => handleClick(clone);
        explorerContainer.appendChild(clone);
    }

    if (searchContainer) {
        searchContainer.innerHTML = '';
        const clone = originalButton.cloneNode(true);
        clone.id = 'search-load-more-btn'; // Se mantiene este ID para identificarlo
        clone.innerText = btnText;
        clone.disabled = btnDisabled;

        clone.onclick = () => handleClick(clone);
        searchContainer.appendChild(clone);
    }
}

// ====================================================================
// ===== FUNCIONALIDAD DE RUTAS (CORREGIDO) ===========================
// ====================================================================

/**
 * Maneja la ruta del hash y carga el video específico (incluso si no está en videoData).
 * @returns {boolean} true si la ruta fue manejada con éxito, false en caso contrario.
 */
async function handleRoute() { 
    const hash = window.location.hash.substring(1); 
    if (!hash) return false;

    // Patrón: video-ID_DEL_VIDEO/part-INDEX_DE_PARTE
    const match = hash.match(/^video-([a-fA-F0-9-]+)(?:\/part-(\d+))?$/);

    if (match) {
        const routeVideoId = match[1];
        let routePartIndex = match[2] ? parseInt(match[2], 10) : 0;

        // 🔥🔥🔥 CORRECCIÓN 3a: Activar Flag de Carga Inicial
        isInitialRouteLoading = true; 
        isHandlingRoute = true;
        
        // Carga o encuentra el video por ID, colocándolo en videoData[0] si es nuevo.
        const globalIndex = await loadVideoFromAPI(routeVideoId); 

        if (globalIndex !== -1) {
            
            // Asegura que la parte sea válida
            const video = videoData[globalIndex];
            const videoPartes = video.partes || video.Segments || [];
            if (routePartIndex >= videoPartes.length) {
                routePartIndex = 0;
            }
            
            console.log(`Ruta encontrada. Cargando video ${globalIndex} (${routeVideoId}), parte ${routePartIndex}.`);
            
            // 1. Desplazarse al video
            scrollToVideo(globalIndex, false); 
            
            const partToLoad = routePartIndex;
            // 2. Esperar y desactivar flags
            setTimeout(() => { 
                scrollToPart(globalIndex, partToLoad, true); 
                isHandlingRoute = false;
                isInitialRouteLoading = false; 
            }, 1000); // ⚡️ CAMBIA ESTO DE 250 A 1000

            return true;
        } else {
             console.error(`Error: El video con ID ${routeVideoId} no se pudo encontrar ni cargar.`);
             isInitialRouteLoading = false; // Desactivar si falla
             isHandlingRoute = false;
        }
    }
    
    return false;
}

/**
 * Actualiza la URL del navegador con el ID del video y la parte actual.
 * Bloqueado si la carga inicial de la ruta está activa.
 */
function updateRoute(vidId, pIndex) {
    // 🔥🔥🔥 CORRECCIÓN 2: Bloquear la actualización si estamos en la carga inicial
    if (isHandlingRoute || isInitialRouteLoading) return; 

    const newHash = `video-${vidId}/part-${pIndex}`;
    
    if (window.location.hash.substring(1) !== newHash) {
        window.location.hash = newHash;
    }
}


// ====================================================================
// ===== FUNCIONALIDAD DE VIDEO ALEATORIO Y CARGA POR ID ================
// ====================================================================

/**
 * Carga un video por ID desde el API si no está en memoria.
 */
async function loadVideoFromAPI(videoIdToLoad) { 
    let existingIndex = videoData.findIndex(v => v.id === videoIdToLoad);

    if (existingIndex !== -1) {
        return existingIndex;
    }

    try {
        const url = `${BASE_URL}/video/${videoIdToLoad}`; 
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Error HTTP: ${res.status}`);
        }

        const newVideo = await res.json();

        if (!newVideo || !newVideo.id) {
            console.error("Error: La API no devolvió un video válido.");
            return -1;
        }

        // 1. Insertar el video nuevo al inicio de videoData
        videoData.unshift(newVideo);
        
        // 2. Reconstruir las páginas de scroll (solo el nuevo video)
        buildScrollPages(0, 1);
        
        // 3. Actualizar UI
        if ($('explore-panel')?.classList.contains('open')) {
            buildThumbnails('thumbnails-container', videoData);
        }
        if ($('search-panel')?.classList.contains('open')) {
             buildSearchResults($('search-input').value || '');
        }

        // El índice del video recién agregado es 0
        return 0;

    } catch (err) {
        console.error(`❌ Error cargando video ${videoIdToLoad} desde la API.`, err);
        return -1;
    }
}


/**
 * Carga un video aleatorio llamando al endpoint /random de la API.
 */
async function loadRandomVideo() {
    $('title-bar').innerText = "Cargando video aleatorio...";
    try {
        const url = `${BASE_URL}/random`;
        
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Error HTTP: ${res.status}`);
        }
        
        const randomVideo = await res.json();
        
        if (!randomVideo || !randomVideo.id) {
            $('title-bar').innerText = "Error: La API no devolvió un video válido.";
            return;
        }

        let existingIndex = videoData.findIndex(v => v.id === randomVideo.id);

        if (existingIndex === -1) {
            videoData.unshift(randomVideo);
            existingIndex = 0; 
            
            const scrollContainer = $('tiktok-scroll-container');
            if (scrollContainer) scrollContainer.innerHTML = '';
            buildScrollPages(0);
        }
        
        scrollToVideo(existingIndex);
        
        if ($('explore-panel')?.classList.contains('open')) {
            buildThumbnails('thumbnails-container', videoData);
        }
        if ($('search-panel')?.classList.contains('open')) {
             buildSearchResults($('search-input').value || '');
        }

    } catch (err) {
        console.error("❌ Error cargando video aleatorio.", err);
        $('title-bar').innerText = "Error al cargar video aleatorio.";
    }
}

// --------------------------------------------------------------------

/* ===== Construir páginas tipo TikTok dinámicamente (Se mantiene igual) ===== */
function buildScrollPages(startIdx = 0, endIdx = videoData.length){
    if (!scrollContainer) return;
    
    if (!partObserver) {
        partObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if(entry.isIntersecting && entry.intersectionRatio > 0.6){
                    const newPartIndex = Number(entry.target.dataset.partIndex);
                    const newVideoIndex = Number(entry.target.closest('.video-page').dataset.index);

                    if(!Number.isNaN(newVideoIndex) && newVideoIndex !== videoIndex){
                        loadVideo(newVideoIndex); 
                    } else if(!Number.isNaN(newPartIndex) && newPartIndex !== current && newVideoIndex === videoIndex) {
                        loadPart(newPartIndex);
                    }
                }
            });
        }, { threshold: [0.6], root: null, rootMargin: '0px' });
    }
    
    const loadMoreButton = $('load-more-btn'); 

    for (let idx = startIdx; idx < endIdx; idx++) { 
        const video = videoData[idx];
        const page = document.createElement('section');
        page.className = 'video-page';
        page.dataset.index = idx;
        
        const partsContainer = document.createElement('div');
        partsContainer.className = 'video-page-parts-container';

        const videoPartes = video.partes || video.Segments || [{ parte: 1, inicio_seg: 0, duracion_seg: 300 }]; 
        
        videoPartes.forEach((part, partIdx) => {
            const partSection = document.createElement('div');
            partSection.className = 'part-section';
            partSection.dataset.partIndex = partIdx;

            const inner = document.createElement('div');
            inner.className = 'page-inner';

            const thumb = document.createElement('div');
            thumb.className = 'page-thumb';
            
            let thumbUrl = 'https://via.placeholder.com/720x1280?text=Sin+imagen';
            if (video.thumbnail) {
                if (video.thumbnail.startsWith('http') || video.thumbnail.startsWith('//')) {
                    thumbUrl = video.thumbnail;
                } else {
                    thumbUrl = THUMBNAIL_BASE_URL + video.thumbnail;
                }
            }
            thumb.style.backgroundImage = `url("${ thumbUrl }")`;

            const overlay = document.createElement('div');
            overlay.className = 'page-overlay';

            const left = document.createElement('div');
            left.className = 'page-title';
            left.textContent = (video.titulo ?? video.Title ?? 'Sin título') + ` - Parte ${part.parte ?? (partIdx + 1)}`;

            const right = document.createElement('div');
            right.className = 'page-meta';
            right.textContent = `Video: ${idx + 1}/${videoData.length} | Parte: ${partIdx + 1}/${videoPartes.length}`;

            overlay.appendChild(left);
            overlay.appendChild(right);
            inner.appendChild(thumb);
            inner.appendChild(overlay);
            partSection.appendChild(inner);
            partsContainer.appendChild(partSection);
            
            partObserver.observe(partSection);
        });

        page.appendChild(partsContainer);
        
        if (loadMoreButton && loadMoreButton.parentNode === scrollContainer) {
            scrollContainer.insertBefore(page, loadMoreButton);
        } else {
            scrollContainer.appendChild(page);
        }
    }
}


/* ===== VIDEO + PARTES (Modificado loadVideo) ===== */
function loadVideo(index) {
    if(!videoData.length) return;
    if(index < 0) index = 0;
    if(index >= videoData.length) index = videoData.length - 1;

    document.querySelectorAll('.video-page').forEach(p => {
        p.classList.remove('active');
        p.classList.remove('loading');
        const partsContainer = p.querySelector('.video-page-parts-container');
        if(partsContainer) partsContainer.scrollTop = 0;
    });
    playerFrame.classList.remove('active');
    
    videoIndex = index;
    const video = videoData[videoIndex];
    if(!video) return;

    videoId = video.id;
    partes = video.partes || video.Segments || []; 
    current = 0; 

    // 🔥🔥🔥 CORRECCIÓN 4: ELIMINAR O COMENTAR la llamada directa a updateRoute
    // updateRoute(videoId, current); 

    $('title-bar').innerText = video.titulo ?? video.Title ?? 'Sin título';
    buildPartsList();
    resetAds();
    
    const currentPageElement = document.querySelector(`.video-page[data-index="${videoIndex}"]`);
    if(currentPageElement) {
        currentPageElement.classList.add('active');
        currentPageElement.classList.add('loading');
    }
    
    loadPart(current);
}

/* Load a specific part (Se mantiene igual) */
function loadPart(i){
    if(!partes || i < 0 || i >= partes.length) return;

    resetAds(); 

    current = i; 
    paused = false; 
    currentProgress = 0;
    showUI();
    $('play-btn').innerHTML = `
        <svg class="w-6 h-6 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
            <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 6H8a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1Zm7 0h-1a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1Z"/>
        </svg>
    `;
    highlightCurrentPart();

    updateRoute(videoId, current); // Se mantiene aquí, pero ahora está protegida por la bandera isInitialRouteLoading

    const currentPageElement = document.querySelector(`.video-page[data-index="${videoIndex}"]`);
    if(currentPageElement) {
        const titleEl = currentPageElement.querySelector('.page-title');
        const metaEl = currentPageElement.querySelector('.page-meta');
        const video = videoData[videoIndex];
        
        if (titleEl) titleEl.textContent = (video.titulo ?? video.Title ?? 'Sin título') + ` - Parte ${partes[i].parte ?? (i + 1)}`;
        if (metaEl) metaEl.textContent = `Video: ${videoIndex + 1}/${videoData.length} | Parte: ${i + 1}/${partes.length}`;
        
        currentPageElement.classList.add('active');
        currentPageElement.classList.add('loading');
    }

    const part = partes[i];
    const start = part.inicio_seg ?? part.Start ?? 0;
    const duration = part.duracion_seg ?? part.Duration ?? 0;
    
    setPlayer(start, duration, start);

    setTimeout(() => {
        playerFrame.classList.add('active');
        if(currentPageElement) {
            currentPageElement.classList.remove('loading');
        }
        startProgress(duration);
    }, 800);
}


/* Progress handling (Se mantiene igual) */
function startProgress(duration){
    clearInterval(progressInterval);
    const bar = $('progress-bar');
    currentProgress = 0; bar.style.width='0%';
    const total = Math.max(1, duration);
    progressInterval = setInterval(() => {
        if(paused) return;
        currentProgress++;
        bar.style.width = ((currentProgress / total) * 100) + '%';
        if(currentProgress >= total) {
            clearInterval(progressInterval);
            nextPart(); 
        }
    }, 1000);
}
function adjustTime(offset){
    const part = partes[current];
    if(!part) return;
    const start = part.inicio_seg ?? part.Start ?? 0;
    const duration = part.duracion_seg ?? part.Duration ?? 0;
    let newPos = start + currentProgress + offset;
    if(newPos < start) newPos = start;
    
    if(newPos >= start + duration) {
        return nextPart();
    }
    
    setPlayer(start, duration, newPos);
    restartProgressFrom(newPos - start);
}
function back5(){ adjustTime(-5); }
function skip5(){ adjustTime(5); }
function restartProgressFrom(sec){
    clearInterval(progressInterval);
    const duration = partes[current].duracion_seg ?? partes[current].Duration ?? 0;
    const total = Math.max(1, duration);
    const bar = $('progress-bar');
    currentProgress = Math.max(0, sec);
    bar.style.width = ((currentProgress / total) * 100) + '%';
    progressInterval = setInterval(() => {
        if(paused) return;
        currentProgress++;
        bar.style.width = ((currentProgress / total) * 100) + '%';
        if(currentProgress >= total) {
            clearInterval(progressInterval);
            nextPart();
        }
    }, 1000);
}
function togglePlay(){
    const btn = $('play-btn'); 
    paused = !paused;
    
    if(paused) {
        btn.innerHTML = `
            <svg class="w-6 h-6 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 18V6l8 6-8 6Z"/>
            </svg>
        `;
        playerFrame.classList.remove('active');
        playerFrame.src = 'about:blank'; 
        clearInterval(progressInterval);
    } else {
        btn.innerHTML = `
            <svg class="w-6 h-6 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 6H8a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1Zm7 0h-1a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1Z"/>
            </svg>
        `;
        restartPartFromProgress();
    }
}
function restartPartFromProgress(){
    if(!partes || current < 0 || current >= partes.length) return;
    showUI();
    highlightCurrentPart();

    const part = partes[current];
    const start = part.inicio_seg ?? part.Start ?? 0;
    const duration = part.duracion_seg ?? part.Duration ?? 0;
    
    const newStartTime = start + currentProgress;
    
    setPlayer(start, duration, newStartTime);
    
    const currentPageElement = document.querySelector(`.video-page[data-index="${videoIndex}"]`);
    if(currentPageElement) currentPageElement.classList.add('loading');

    setTimeout(() => {
        playerFrame.classList.add('active');
        if(currentPageElement) currentPageElement.classList.remove('loading');
        
        restartProgressFrom(currentProgress);
    }, 800);
}

/* next/prev part (Se mantiene igual) */
function nextPart(){
    if(current < (partes.length - 1)) {
        const nextPartIndex = current + 1;
        loadPart(nextPartIndex);
        scrollToPart(videoIndex, nextPartIndex);
    } else {
        const nextIndex = (videoIndex + 1);
        
        if(nextIndex >= videoData.length && hasMore) {
            loadRandomVideo();
        } else if (nextIndex < videoData.length) {
            scrollToVideo(nextIndex);
        }
    }
}
function prevPart(){
    if(current > 0) {
        const prevPartIndex = current - 1;
        loadPart(prevPartIndex);
        scrollToPart(videoIndex, prevPartIndex);
    } else {
        const prevIndex = (videoIndex - 1);
        if(prevIndex >= 0) {
            scrollToVideo(prevIndex);
            
            const prevVideo = videoData[prevIndex];
            const prevPartes = prevVideo.partes || prevVideo.Segments || [];
            if(prevPartes.length > 0) {
                const lastPartIndex = prevPartes.length - 1;
                setTimeout(() => {
                    loadPart(lastPartIndex);
                    scrollToPart(prevIndex, lastPartIndex);
                }, 500); 
            }
        }
    }
}

/* Parts list (Se mantiene igual) */
function buildPartsList(){
    const menu = $('parts-menu');
    menu.innerHTML = '';
    (partes || []).forEach((p, i) => {
        const div = document.createElement('div');
        div.className = 'part-item';
        div.innerText = `Parte ${p.parte ?? (i+1)}`;
        div.onclick = () => { 
            loadPart(i); 
            scrollToPart(videoIndex, i, true); 
            toggleMenu(); 
        };
        menu.appendChild(div);
    });
    highlightCurrentPart();
}
function highlightCurrentPart(){
    document.querySelectorAll('.part-item').forEach((el, idx) => el.classList.toggle('active', idx === current));
}

/* SOUND (Se mantiene igual) */
function enableSound(){
    allowSound = true;
    const s = $('sound-btn'); if(s) s.style.display = 'none';
    loadPart(current);
}

/* Set iframe src helper (Se mantiene igual) */
function setPlayer(start, duration, pos){
    const end = start + duration - 0.1;
    const unique = Date.now();
    playerFrame.src = `https://www.youtube.com/embed/${videoId}?start=${pos}&end=${end}&autoplay=1&controls=0&disablekb=1&modestbranding=1&rel=0&iv_load_policy=3&playsinline=1&enablejsapi=1&mute=${allowSound?0:1}&v=${unique}`;
}

/* CONFIG DE ADS (Se mantiene igual) */
const MAX_ADS = 10;
function resetAds() {
    const container = $('ad-container');
    container.innerHTML = '';
    if (window.adInterval) clearInterval(window.adInterval);
    loadAd();
}
function loadAd() {
    createAds(1);
    window.adInterval = setInterval(() => createAds(2), 2500);
}
function createAds(count) {
    const container = $('ad-container');
    if (container.children.length >= MAX_ADS) {
        if (window.adInterval) clearInterval(window.adInterval);
        return;
    }
    for (let i = 0; i < count; i++) {
        if (container.children.length >= MAX_ADS) break;
        const box = document.createElement('div');
        box.className = 'ad-box';
        const scriptConfig = document.createElement("script");
        scriptConfig.innerHTML = `
            atOptions = {
                'key' : '9a8c9978fb1543656fe2727727a4e06f',
                'format' : 'iframe',
                'height' : 60,
                'width' : 468,
                'params' : {}
            };
        `;
        const scriptInvoke = document.createElement("script");
        scriptInvoke.src = "//www.highperformanceformat.com/9a8c9978fb1543656fe2727727a4e06f/invoke.js";
        box.appendChild(scriptConfig);
        box.appendChild(scriptInvoke);
        container.appendChild(box);
    }
}


/* THUMBNAILS / SEARCH GRID (Se mantiene igual) */
function buildThumbnails(containerId = 'thumbnails-container', data = videoData, clickFn = (idx)=> { 
    scrollToVideo(idx);
    
    if (containerId === 'thumbnails-container') {
        toggleExplore(); 
    }
} ){ 
    const container = $(containerId);
    if(!container) return;
    
    if(containerId === 'thumbnails-container') {
        container.innerHTML = '';
    }
    
    if(containerId === 'search-results') {
         container.innerHTML = '';
    }

    (data || []).forEach((video, index) => {
        const wrapper = document.createElement('div'); wrapper.className = 'thumbnail-wrapper';
        const img = document.createElement('img');
        
        let thumbUrl = 'https://via.placeholder.com/320x180?text=Sin+imagen';
        if (video.thumbnail) {
            if (video.thumbnail.startsWith('http') || video.thumbnail.startsWith('//')) {
                    thumbUrl = video.thumbnail;
                } else {
                    thumbUrl = THUMBNAIL_BASE_URL + video.thumbnail;
                }
            }
            
            img.src = thumbUrl;
            img.alt = video.titulo ?? 'Sin título';
            img.loading = 'lazy';
            img.onerror = () => img.src='https://via.placeholder.com/320x180?text=Sin+imagen';
            
            const overlay = document.createElement('div'); overlay.className = 'thumbnail-overlay';
            overlay.innerText = `${video.titulo ?? "Sin título"} · ${video.partes?.length ?? video.Segments?.length ?? 0} partes`;
            
            wrapper.appendChild(img);
            wrapper.appendChild(overlay);
            wrapper.onclick = () => clickFn(index);
            container.appendChild(wrapper);
        });
        
        if (containerId === 'search-results') {
         const originalButton = $('load-more-btn');
         if (originalButton) {
             updateLoadMoreButtonClones(originalButton);
         }
        }
    }
    
    /* SEARCH logic (Se mantiene igual) */
    const searchInput = $('search-input');
    if(searchInput){
        searchInput.addEventListener('input', ()=> {
            const q = (searchInput.value || '').toLowerCase();
            buildSearchResults(q);
        });
    }
    async function buildSearchResults(query){
        const container = $('search-results');
        const searchPanel = $('search-panel');
        if(!container || !searchPanel) return;
        
        const searchLoadMoreContainer = $('search-load-more');
        if (searchLoadMoreContainer) searchLoadMoreContainer.innerHTML = '';
        
        if (!query || query.trim() === '') {
            container.innerHTML = ''; 
            
            if (videoData.length === 0) {
                container.innerHTML = '<h2>Cargando videos...</h2>';
                return;
            }
            
            buildThumbnails('search-results', videoData, (localIndex) => {
                const item = videoData[localIndex];
                if(!item) return;
                
                scrollToVideo(localIndex);
                toggleSearch(); 
            });
            
            const originalButton = $('load-more-btn');
            if (originalButton) {
                updateLoadMoreButtonClones(originalButton);
            }
            return;
        }
        
        container.innerHTML = '<h2>Cargando resultados de búsqueda...</h2>';
        
        try {
            const url = `${BASE_URL}/search?q=${encodeURIComponent(query)}`;
            
            const res = await fetch(url);
            if (!res.ok) {
                throw new Error(`Error HTTP: ${res.status}`);
            }
            
            const results = await res.json();
            
            container.innerHTML = ''; 
            
            if (results.length === 0) {
                container.innerHTML = `<h2>No se encontraron resultados para "${query}".</h2>`;
                return;
            }
            
            buildThumbnails('search-results', results, (localIndex) => {
                const item = results[localIndex];
                if(!item) return;
                
                const global = videoData.findIndex(v => v.id === item.id);
                
                if(global >= 0) {
                    scrollToVideo(global);
                    toggleSearch(); 
                } else {
                    alert("Error: El video encontrado no está en la lista principal cargada.");
                }
            });
            
        } catch (err) {
            console.error("❌ Error en la búsqueda de la API.", err);
            container.innerHTML = '<h2>Error al conectar con la API de búsqueda.</h2>';
        }
    }
    
    /* UI show/hide logic (Se mantiene igual) */
    function showUI(){
        const appbar = $('appbar'), bottom = $('bottom-ui'), explore = $('explore-panel'), search = $('search-panel'), parts = $('parts-menu');
        appbar.style.top = `calc(var(--safe-top) + 8px)`;
        bottom.style.opacity = '1';
        $('prev-video-btn').classList.add('visible'); $('next-video-btn').classList.add('visible');
        
        [explore,search,parts].forEach(p => p && p.classList.remove('hidden'));
        
        clearTimeout(hideTimeout);
        hideTimeout = setTimeout(()=> {
            appbar.style.top = `-120px`;
            bottom.style.opacity = '0';
            $('prev-video-btn').classList.remove('visible'); $('next-video-btn').classList.remove('visible');
            [explore,search,parts].forEach(p => { if(p){ p.classList.remove('open'); p.classList.add('hidden'); }});
        }, 4200);
    }
    
    /* Toggle panels (Se mantiene igual) */
function toggleMenu(){ $('parts-menu').classList.toggle('open'); showUI(); }

function toggleExplore(){ 
    const p = $('explore-panel'); 
    p.classList.toggle('open'); 
    if (p.classList.contains('open')) {
        buildThumbnails('thumbnails-container', videoData);
        loadPanelAd('explore-ad-container'); // 🔴 LLAMADA PARA EL ANUNCIO AL ABRIR
    }
    showUI(); 
}

function toggleSearch(){ 
    const p = $('search-panel'); 
    p.classList.toggle('open'); 
    if(p.classList.contains('open')) { 
        $('search-input').focus(); 
        buildSearchResults($('search-input').value || ''); 
        loadPanelAd('search-ad-container'); // 🔴 LLAMADA PARA EL ANUNCIO AL ABRIR
    } 
    showUI(); 
}

    /* Prev/Next global buttons (Se mantiene igual) */
    $('prev-video-btn').addEventListener('click', prevPart);
    $('next-video-btn').addEventListener('click', nextPart);
    const randomBtn = $('random-btn');
    if(randomBtn) {
        randomBtn.addEventListener('click', loadRandomVideo);
    }
    
    /* Scroll to a specific video index with smooth snap (Se mantiene igual) */
    function scrollToVideo(index){
        const page = document.querySelector(`.video-page[data-index="${index}"]`);
        if(page && scrollContainer){
            scrollContainer.scrollTop = page.offsetTop;
            const partsContainer = page.querySelector('.video-page-parts-container');
            if(partsContainer) partsContainer.scrollTop = 0; 
            
            loadVideo(index);
        }
    }
    
    /* Scroll a una parte específica dentro del video (Se mantiene igual) */
    function scrollToPart(videoIndex, partIndex, forceLoad = false){
        const videoPage = document.querySelector(`.video-page[data-index="${videoIndex}"]`);
        if(videoPage){
            const partsContainer = videoPage.querySelector('.video-page-parts-container');
            const partSection = partsContainer.querySelector(`.part-section[data-part-index="${partIndex}"]`);
            
            if(partsContainer && partSection && scrollContainer){
                scrollContainer.scrollTop = videoPage.offsetTop;
                partsContainer.scrollTop = partSection.offsetTop;
                
                if(forceLoad && partIndex !== current) {
                    setTimeout(() => loadPart(partIndex), 100);
                }
            }
        }
    }
    
    /* Interaction to show UI (Se mantiene igual) */
    document.addEventListener('mousemove', showUI, {passive:true});
    document.addEventListener('touchstart', showUI, {passive:true});
    document.addEventListener('keydown', showUI);
    
    // Listener para el cambio de hash (maneja los botones Atrás/Adelante del navegador)
    window.addEventListener('hashchange', () => {
        if (!isHandlingRoute) {
            handleRoute();
        }
    });

    /* Nueva Función para cargar el anuncio en los paneles laterales */
/* Función para cargar y recargar el anuncio en los paneles laterales */
function loadPanelAd(containerId) {
    const container = document.getElementById(containerId);
    
    // Si el contenedor no existe o no es un elemento, salimos.
    if (!container) return;
    
    // 1. Limpiamos completamente el contenedor para la nueva carga.
    container.innerHTML = ''; 
    
    // 2. Definición del objeto 'atOptions' (Configuración del anuncio)
    const adScriptConfig = document.createElement("script");
    adScriptConfig.type = "text/javascript";
    adScriptConfig.innerHTML = `
        atOptions = {
            'key' : '3e93e9513909a27236edf2b37efbaa01',
            'format' : 'iframe',
            'height' : 250,
            'width' : 300,
            'params' : {}
        };
    `;
    
    // 3. Definición del script de invocación del proveedor
    const adScriptInvoke = document.createElement("script");
    adScriptInvoke.type = "text/javascript";
    adScriptInvoke.src = "//www.highperformanceformat.com/3e93e9513909a27236edf2b37efbaa01/invoke.js";
    
    // 4. Inyectamos ambos scripts en el contenedor del anuncio
    container.appendChild(adScriptConfig);
    container.appendChild(adScriptInvoke);
}

    /* Initialize */
    loadJSON();