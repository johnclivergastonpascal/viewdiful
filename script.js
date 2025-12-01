/* ============================
 * Variables y configuración 
 * ============================ */
let videoData = [], videoIndex = 0, videoId = "", partes = [], current = 0;
let allowSound = false, progressInterval, currentProgress = 0, paused = false, hideTimeout;
let partObserver; // Observador para detectar cuándo una parte del video está visible.

/* Configuración de Paginación */
const LIMIT = 10;
let currentPage = 0;
let hasMore = true; 

/* URL de la API */
const BASE_URL = "http://localhost:8080";

/* Selectores cortos */
const $ = id => document.getElementById(id);
const scrollContainer = $('tiktok-scroll-container');
const playerFrame = $('player-frame'); 

/* URL base para miniaturas (Asumimos que el API solo devuelve el nombre del archivo si no empieza con http/https) */
const THUMBNAIL_BASE_URL = "https://raw.githubusercontent.com/johnclivergastonpascal/server_viewdiful/main/";


// ====================================================================
// ===== FUNCIONES PRINCIPALES DE CARGA Y PAGINACIÓN ==================
// ====================================================================

/* ===== CARGAR JSON (API Paginada) ===== */
async function loadJSON(){
    // Cargar la primera página (página 0)
    await loadPage(0);

    // Inicializar el botón "Ver Más" y sus clones
    setupLoadMoreButton(); 

    // Inicializar UI de exploración/búsqueda con los datos disponibles
    buildThumbnails(); 
    buildThumbnails('search-results', []); 

    // Cargar el primer video
    if(videoData.length) loadVideo(0);
    else $('title-bar').innerText = "No hay videos o la API no responde";
}

// --- FUNCIÓN PARA CARGAR PÁGINAS ESPECÍFICAS ---
async function loadPage(pageNumber) {
    const loadMoreButton = $('load-more-btn');
    // Si ya sabemos que no hay más (y no es la primera carga), terminamos.
    if (!hasMore && pageNumber > 0) {
        if(loadMoreButton) loadMoreButton.innerText = 'No hay más videos.';
        // Asegurarse de que los clones también se actualicen
        updateLoadMoreButtonClones(loadMoreButton); 
        return;
    }

    const url = `${BASE_URL}/videos?page=${pageNumber}&limit=${LIMIT}`;
    try {
        console.log(`Cargando página ${pageNumber} desde: ${url}`);
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Error HTTP: ${res.status}`);
        }
        const newVideos = await res.json();
        
        // El índice de inicio para construir las nuevas páginas.
        const startIdx = videoData.length;

        // 1. Manejar el estado de "hasMore" y el botón
        if (newVideos.length === 0 || newVideos.length < LIMIT) {
            hasMore = false;
        } else {
            hasMore = true;
        }
        
        // Actualizar el estado del botón original (será sincronizado después)
        if (loadMoreButton) {
            loadMoreButton.innerText = hasMore ? `Ver más videos (${LIMIT})` : 'No hay más videos.';
            loadMoreButton.disabled = !hasMore;
        }
        
        // 2. Agregar los nuevos videos
        videoData = videoData.concat(newVideos);
        currentPage = pageNumber; 

        // 3. Construir SOLO los nuevos elementos en la interfaz
        if (newVideos.length > 0) {
            buildScrollPages(startIdx); // Pasar el índice de inicio
        }

        // 4. Si es la primera carga (página 0), asegurar que el primer video se cargue
        if (pageNumber === 0 && videoData.length > 0) {
              loadVideo(0);
        }

        // 5. Actualizar el explorador de miniaturas si está abierto y sincronizar clones
        // **CORRECCIÓN CLAVE:** Forzar la reconstrucción de miniaturas de Explorar
        // y, crucialmente, de **Búsqueda** para que aparezca el botón "Ver más"
        // y para que la búsqueda contenga los nuevos videos.
        if ($('explore-panel')?.classList.contains('open')) {
            buildThumbnails('thumbnails-container', videoData);
        }
        // Si el panel de búsqueda está abierto, reconstruir los resultados para incluir el botón
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

// --- FUNCIÓN PARA CREAR Y CONFIGURAR EL BOTÓN "VER MÁS" ---
function setupLoadMoreButton() {
    let loadMoreButton = $('load-more-btn');
    
    // Si el botón ya existe (el original en el scrollContainer), solo sincronizamos
    if (loadMoreButton) {
        updateLoadMoreButtonClones(loadMoreButton);
        return;
    }

    // Crear el botón original
    loadMoreButton = document.createElement('button');
    loadMoreButton.id = 'load-more-btn';
    loadMoreButton.className = 'load-more-button'; 
    loadMoreButton.innerText = hasMore ? `Ver más videos (${LIMIT})` : 'No hay más videos.';
    loadMoreButton.disabled = !hasMore;
    
    // Lógica para cargar la siguiente página al hacer clic
    const loadNextPage = async (btn) => {
        btn.innerText = 'Cargando...';
        btn.disabled = true;
        // Llamar a loadPage que se encarga de todo el flujo y actualización
        await loadPage(currentPage + 1);
        // loadPage actualizará el estado del botón y llamará a updateLoadMoreButtonClones
    };
    
    // Asignar el listener al botón original.
    loadMoreButton.onclick = () => loadNextPage(loadMoreButton);

    // 1. Insertar el botón en el contenedor de scroll principal
    if (scrollContainer) {
        scrollContainer.appendChild(loadMoreButton);
    }
    
    // 2. Clonar el botón para los paneles de Explorar y Buscar
    updateLoadMoreButtonClones(loadMoreButton);
}

// --- FUNCIÓN HELPER PARA CLONAR Y SINCRONIZAR EL BOTÓN ---
function updateLoadMoreButtonClones(originalButton) {
    const explorerContainer = $('explore-load-more');
    const searchContainer = $('search-load-more');
    
    // Obtener el estado actual del botón original
    const btnText = originalButton.innerText;
    const btnDisabled = originalButton.disabled;

    // Función de clic reutilizable
    const handleClick = async (clone) => {
         // Temporalmente, actualizar el texto y estado del botón que se hace clic
         clone.innerText = 'Cargando...';
         clone.disabled = true;
         // Llamar a loadPage que actualizará la data y el estado del botón original
         await loadPage(currentPage + 1);
         // Forzar la resincronización de TODOS los clones después de la carga
         updateLoadMoreButtonClones(originalButton); 
    };

    // CLONACIÓN Y SINCRONIZACIÓN PARA EXPLORAR
    if (explorerContainer) {
        explorerContainer.innerHTML = '';
        const clone = originalButton.cloneNode(true);
        clone.id = 'explore-load-more-btn'; 
        clone.innerText = btnText;
        clone.disabled = btnDisabled;
        
        clone.onclick = () => handleClick(clone);
        explorerContainer.appendChild(clone);
    }

    // CLONACIÓN Y SINCRONIZACIÓN PARA BUSCAR
    if (searchContainer) {
        searchContainer.innerHTML = '';
        const clone = originalButton.cloneNode(true);
        clone.id = 'search-load-more-btn';
        clone.innerText = btnText;
        clone.disabled = btnDisabled;

        clone.onclick = () => handleClick(clone);
        searchContainer.appendChild(clone);
    }
}


/* ===== Construir páginas tipo TikTok dinámicamente ===== */
function buildScrollPages(startIdx = 0){
    if (!scrollContainer) return;
    
    // 1. Crear el nuevo observador para las partes (si no existe)
    if (!partObserver) {
        // Inicializar el observador (sin desconexión, solo se usa para observar nuevos elementos)
        partObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if(entry.isIntersecting && entry.intersectionRatio > 0.6){
                    const newPartIndex = Number(entry.target.dataset.partIndex);
                    const newVideoIndex = Number(entry.target.closest('.video-page').dataset.index);

                    // Lógica para cambiar de video o de parte
                    if(!Number.isNaN(newVideoIndex) && newVideoIndex !== videoIndex){
                        loadVideo(newVideoIndex); 
                    } else if(!Number.isNaN(newPartIndex) && newPartIndex !== current && newVideoIndex === videoIndex) {
                        loadPart(newPartIndex);
                    }
                }
            });
        }, { threshold: [0.6], root: null, rootMargin: '0px' });
    }
    
    // 2. Obtener el punto de inserción (el botón)
    const loadMoreButton = $('load-more-btn'); 

    // 3. Iterar SOLO sobre los nuevos videos
    for (let idx = startIdx; idx < videoData.length; idx++) {
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
            
            // 🔥 CORRECCIÓN: Lógica para la URL de la miniatura de fondo.
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
            
            // 4. Observar la nueva sección de parte
            partObserver.observe(partSection);
        });

        page.appendChild(partsContainer);
        
        // 5. Insertar la nueva página ANTES del botón (si existe).
        if (loadMoreButton) {
            scrollContainer.insertBefore(page, loadMoreButton);
        } else {
            // Si el botón aún no se ha creado (ej. en la carga inicial), añadir al final.
            scrollContainer.appendChild(page);
        }
    }
}


/* ===== VIDEO + PARTES (Se mantiene igual) ===== */
function loadVideo(index) {
    if(!videoData.length) return;
    if(index < 0) index = 0;
    if(index >= videoData.length) index = videoData.length - 1;

    // 1. Quitar clases de actividad/carga
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
    // Usar 'partes' o 'Segments'
    partes = video.partes || video.Segments || []; 
    current = 0; // Siempre empezar por la primera parte al cambiar de video

    $('title-bar').innerText = video.titulo ?? video.Title ?? 'Sin título';
    buildPartsList();
    resetAds();
    
    // 2. Marcar la página activa y ponerla en estado de carga
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

/* Helpers for +/-5s (Se mantienen iguales) */
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

/* Restart progress from sec (Se mantiene igual) */
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

/* Toggle play/pause (Se mantiene igual) */
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

/* Reinicia la parte actual desde la posición guardada (Se mantiene igual) */
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
        
        // Comprobar si hay que cargar más antes de saltar
        if(nextIndex >= videoData.length && hasMore) {
            alert('Llegaste al final de los videos cargados. Presiona "Ver más videos" para cargar la siguiente página.');
        } else if (nextIndex < videoData.length) {
            scrollToVideo(nextIndex);
        }
        // Si no hay más videos y ya estamos en el último, no hacer nada.
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
        // Si ya estamos en el primer video y primera parte, no hacer nada.
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


/* THUMBNAILS / SEARCH GRID */
function buildThumbnails(containerId = 'thumbnails-container', data = videoData, clickFn = (idx)=> { 
    // Comportamiento predeterminado para Explorar (thumbnails-container)
    scrollToVideo(idx);
    
    // **CORRECCIÓN 1: CERRAR EXPLORAR AL HACER CLIC**
    if (containerId === 'thumbnails-container') {
        toggleExplore(); // Cierra el panel de explorar
    }
} ){ 
    const container = $(containerId);
    if(!container) return;
    
    // Si el contenedor es el de exploración, limpiamos antes de reconstruir.
    if(containerId === 'thumbnails-container') {
        container.innerHTML = '';
    }
    
    // Si el contenedor es el de búsqueda, siempre limpiamos (ya que la lista es dinámica)
    if(containerId === 'search-results') {
         container.innerHTML = '';
    }

    (data || []).forEach((video, index) => {
        const wrapper = document.createElement('div'); wrapper.className = 'thumbnail-wrapper';
        const img = document.createElement('img');
        
        // Lógica para la URL de la miniatura
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
        // Si la imagen falla (ej. no existe en el repositorio), volvemos al placeholder.
        img.onerror = () => img.src='https://via.placeholder.com/320x180?text=Sin+imagen';
        
        const overlay = document.createElement('div'); overlay.className = 'thumbnail-overlay';
        overlay.innerText = `${video.titulo ?? "Sin título"} · ${video.partes?.length ?? video.Segments?.length ?? 0} partes`;

        wrapper.appendChild(img);
        wrapper.appendChild(overlay);
        wrapper.onclick = () => clickFn(index);
        container.appendChild(wrapper);
    });
    
    // **CORRECCIÓN ADICIONAL:** Reconstruir el botón de búsqueda para que aparezca después de las miniaturas
    if (containerId === 'search-results') {
         const originalButton = $('load-more-btn');
         if (originalButton) {
             // Sincronizar el clon del botón de búsqueda
             updateLoadMoreButtonClones(originalButton);
         }
    }
}

/* SEARCH logic (Corregida la llamada a updateLoadMoreButtonClones y cierre del panel) */
const searchInput = $('search-input');
if(searchInput){
    searchInput.addEventListener('input', ()=> {
        const q = (searchInput.value || '').toLowerCase();
        buildSearchResults(q);
    });
}
function buildSearchResults(query){
    const results = (videoData || []).filter(v => (v.titulo||v.Title||'').toLowerCase().includes(query));
    
    buildThumbnails('search-results', results, (localIndex) => {
        const item = results[localIndex];
        if(!item) return;
        const global = videoData.findIndex(v => v.id === item.id);
        if(global >= 0) {
            // **CORRECCIÓN 2:** Cerrar el panel de Búsqueda al hacer clic en un video
            toggleSearch(); 
            scrollToVideo(global);
        }
    });
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
    $('explore-panel').classList.toggle('open'); 
    if ($('explore-panel').classList.contains('open')) {
        buildThumbnails('thumbnails-container', videoData);
    }
    showUI(); 
}
function toggleSearch(){ 
    const p = $('search-panel'); 
    p.classList.toggle('open'); 
    if(p.classList.contains('open')) { 
        $('search-input').focus(); 
        buildSearchResults($('search-input').value || ''); // Recargar resultados al abrir
    } 
    showUI(); 
}

/* Prev/Next global buttons (Se mantiene igual) */
$('prev-video-btn').addEventListener('click', prevPart);
$('next-video-btn').addEventListener('click', nextPart);

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

/* Initialize */
loadJSON();