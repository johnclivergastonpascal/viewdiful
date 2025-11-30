/* ============================
 *     Variables y configuración
 *     ============================ */
let videoData = [], videoIndex = 0, videoId = "", partes = [], current = 0;
let allowSound = false, progressInterval, currentProgress = 0, paused = false, hideTimeout;
let partObserver; // Nuevo observador para las partes

/* JSON con tu lista de videos */
const JSON_URL = "https://raw.githubusercontent.com/johnclivergastonpascal/server_viewdiful/refs/heads/main/videos.json";

/* Selectores cortos */
const $ = id => document.getElementById(id);
const scrollContainer = $('tiktok-scroll-container');
const playerFrame = $('player-frame'); // Obtener el iframe

/* ===== CARGAR JSON ===== */
async function loadJSON(){
    try {
        const res = await fetch(JSON_URL);
        videoData = await res.json();
    } catch (err) {
        console.error("Error cargando JSON:", err);
        videoData = [];
    }

    // construir UI
    buildScrollPages();
    buildThumbnails(); // explorador
    buildThumbnails('search-results', []); // iniciar vacío
    if(videoData.length) loadVideo(0);
    else $('title-bar').innerText = "No hay videos";
}

/* ===== Construir páginas tipo TikTok dinámicamente ===== */
function buildScrollPages(){
    scrollContainer.innerHTML = '';
    // Desconectar el observador de partes si ya existe
    if (partObserver) {
        partObserver.disconnect();
    }
    
    // Crear el nuevo observador para las partes
    partObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            // Umbral > 0.6 para que detecte la parte principal centrada
            if(entry.isIntersecting && entry.intersectionRatio > 0.6){
                const newPartIndex = Number(entry.target.dataset.partIndex);
                const newVideoIndex = Number(entry.target.closest('.video-page').dataset.index);

                // **CORRECCIÓN LÓGICA:** if(!Number.isNaN(newVideoIndex) && newVideoIndex !== videoIndex){
                    // Si el video cambia, cargamos el video. Esto siempre cargará la parte 0.
                    loadVideo(newVideoIndex); 
                } else if(!Number.isNaN(newPartIndex) && newPartIndex !== current && newVideoIndex === videoIndex) {
                    // Si solo la parte cambia DENTRO del mismo video
                    loadPart(newPartIndex);
                }
            }
        );
    }, { 
        threshold: [0.25, 0.5, 0.6, 0.75],
        root: null, // viewport
        rootMargin: '0px'
    });
    
    videoData.forEach((video, idx) => {
        const page = document.createElement('section');
        page.className = 'video-page';
        page.dataset.index = idx;
        
        // Contenedor de scroll interno para las partes
        const partsContainer = document.createElement('div');
        partsContainer.className = 'video-page-parts-container';

        // Crear una "sección de parte" por cada parte del video
        const videoPartes = video.partes || [{ parte: 1, inicio_seg: 0, duracion_seg: 300 }]; // Asegurar al menos 1 parte
        
        videoPartes.forEach((part, partIdx) => {
            const partSection = document.createElement('div');
            partSection.className = 'part-section';
            partSection.dataset.partIndex = partIdx;

            const inner = document.createElement('div');
            inner.className = 'page-inner';

            const thumb = document.createElement('div');
            thumb.className = 'page-thumb';
            // USANDO LA MINIATURA DEL JSON PARA EL FONDO DEL SCROLL
            thumb.style.backgroundImage = `url("${ video.thumbnail ? 'https://raw.githubusercontent.com/johnclivergastonpascal/server_viewdiful/main/' + video.thumbnail : 'https://via.placeholder.com/720x1280?text=Sin+imagen' }")`;

            const overlay = document.createElement('div');
            overlay.className = 'page-overlay';

            const left = document.createElement('div');
            left.className = 'page-title';
            left.textContent = (video.titulo ?? 'Sin título') + ` - Parte ${part.parte ?? (partIdx + 1)}`;

            const right = document.createElement('div');
            right.className = 'page-meta';
            right.textContent = `Video: ${idx + 1}/${videoData.length} | Parte: ${partIdx + 1}/${videoPartes.length}`;

            overlay.appendChild(left);
            overlay.appendChild(right);

            inner.appendChild(thumb);
            inner.appendChild(overlay);
            partSection.appendChild(inner);
            
            partsContainer.appendChild(partSection);
            
            // Observar cada sección de parte
            partObserver.observe(partSection);
        });

        page.appendChild(partsContainer);
        scrollContainer.appendChild(page);
    });
}

/* ===== VIDEO + PARTES (MEJORADO) ===== */
function loadVideo(index) {
    if(!videoData.length) return;
    if(index < 0) index = 0;
    if(index >= videoData.length) index = videoData.length - 1;

    // 1. Quitar clases de actividad/carga de todas las páginas y el iframe
    document.querySelectorAll('.video-page').forEach(p => {
        p.classList.remove('active');
        p.classList.remove('loading');
        // **CORRECCIÓN:** Resetear el scroll interno del contenedor de partes
        const partsContainer = p.querySelector('.video-page-parts-container');
        if(partsContainer) partsContainer.scrollTop = 0;
    });
    playerFrame.classList.remove('active');
    
    videoIndex = index;
    const video = videoData[videoIndex];
    if(!video) return;

    videoId = video.id;
    partes = video.partes || [];
    current = 0; // Siempre empezar por la primera parte al cambiar de video

    $('title-bar').innerText = video.titulo ?? video.Title ?? 'Sin título';
    buildPartsList();
    resetAds();
    
    // 2. Marcar la página activa y ponerla en estado de carga (mostrará el spinner)
    const currentPageElement = document.querySelector(`.video-page[data-index="${videoIndex}"]`);
    if(currentPageElement) {
        currentPageElement.classList.add('active');
        currentPageElement.classList.add('loading');
    }
    
    loadPart(current);
}

/* Load a specific part */
function loadPart(i){
    if(!partes || i < 0 || i >= partes.length) return;

    resetAds(); // ← reiniciar anuncios al cambiar de parte

    current = i; 
    paused = false; 
    currentProgress = 0;
    showUI();
    $('play-btn').innerText = "⏸";
    highlightCurrentPart();

    const currentPageElement = document.querySelector(`.video-page[data-index="${videoIndex}"]`);
    if(currentPageElement) {
        const titleEl = currentPageElement.querySelector('.page-title');
        const metaEl = currentPageElement.querySelector('.page-meta');
        const video = videoData[videoIndex];
        
        if (titleEl) titleEl.textContent = (video.titulo ?? 'Sin título') + ` - Parte ${partes[i].parte ?? (i + 1)}`;
        if (metaEl) metaEl.textContent = `Video: ${videoIndex + 1}/${videoData.length} | Parte: ${i + 1}/${partes.length}`;
        
        // Aseguramos que la clase 'active' se mantenga
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


/* Progress handling */
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
            nextPart(); // Al terminar la parte, intenta ir a la siguiente parte
        }
    }, 1000);
}

/* Helpers for +/-5s */
function adjustTime(offset){
    const part = partes[current];
    if(!part) return;
    const start = part.inicio_seg ?? part.Start ?? 0;
    const duration = part.duracion_seg ?? part.Duration ?? 0;
    let newPos = start + currentProgress + offset;
    if(newPos < start) newPos = start;
    
    // Si saltas más allá del final de la parte, avanza a la siguiente parte
    if(newPos >= start + duration) {
        return nextPart();
    }
    
    setPlayer(start, duration, newPos);
    restartProgressFrom(newPos - start);
}
function back5(){ adjustTime(-5); }
function skip5(){ adjustTime(5); }

/* Restart progress from sec */
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

/* Toggle play/pause (CORREGIDO: Limpia el iframe para detener el audio) */
function togglePlay(){
    const btn = $('play-btn'); 
    
    paused = !paused;
    btn.innerText = paused ? "▶" : "⏸";

    if(paused) {
        playerFrame.classList.remove('active');
        playerFrame.src = 'about:blank'; 
        clearInterval(progressInterval);
    } else {
        restartPartFromProgress();
    }
}

/* Reinicia la parte actual desde la posición guardada */
function restartPartFromProgress(){
    if(!partes || current < 0 || current >= partes.length) return;
    showUI();
    $('play-btn').innerText = "⏸";
    highlightCurrentPart();

    const part = partes[current];
    const start = part.inicio_seg ?? part.Start ?? 0;
    const duration = part.duracion_seg ?? part.Duration ?? 0;
    
    const newStartTime = start + currentProgress;
    
    // 1. Cargar el iframe con el nuevo punto de inicio
    setPlayer(start, duration, newStartTime);
    
    // 2. Simulación de carga (mantener el mismo efecto visual de carga)
    const currentPageElement = document.querySelector(`.video-page[data-index="${videoIndex}"]`);
    if(currentPageElement) currentPageElement.classList.add('loading');

    setTimeout(() => {
        // 2a. Hacer visible el iframe
        playerFrame.classList.add('active');
        
        // 2b. Quitar el indicador de carga
        if(currentPageElement) currentPageElement.classList.remove('loading');
        
        // 2c. Reiniciar la barra de progreso desde donde se quedó
        restartProgressFrom(currentProgress);
    }, 800);
}

/* next/prev part (LÓGICA CLAVE MODIFICADA) */
function nextPart(){
    if(current < (partes.length - 1)) {
        // Ir a la siguiente PARTE
        const nextPartIndex = current + 1;
        loadPart(nextPartIndex);
        // Desplazar el scroll interno a la nueva parte
        scrollToPart(videoIndex, nextPartIndex);
    } else {
        // Si no hay más partes, saltar al siguiente VIDEO en scroll principal
        const nextIndex = (videoIndex + 1) % videoData.length;
        scrollToVideo(nextIndex);
    }
}
function prevPart(){
    if(current > 0) {
        // Ir a la anterior PARTE
        const prevPartIndex = current - 1;
        loadPart(prevPartIndex);
        // Desplazar el scroll interno a la nueva parte
        scrollToPart(videoIndex, prevPartIndex);
    } else {
        // Si es la primera parte, saltar al video anterior
        const prevIndex = (videoIndex - 1 + videoData.length) % videoData.length;
        scrollToVideo(prevIndex);
        
        // Si saltamos al video anterior, cargamos su *última* parte
        const prevVideo = videoData[prevIndex];
        const prevPartes = prevVideo.partes || [];
        if(prevPartes.length > 0) {
            const lastPartIndex = prevPartes.length - 1;
            // Un pequeño timeout para asegurar que loadVideo se ha ejecutado
            setTimeout(() => {
                // Forzar la carga y el scroll a la última parte
                loadPart(lastPartIndex);
                scrollToPart(prevIndex, lastPartIndex);
            }, 500); 
        }
    }
}

/* Parts list */
function buildPartsList(){
    const menu = $('parts-menu');
    menu.innerHTML = '';
    (partes || []).forEach((p, i) => {
        const div = document.createElement('div');
        div.className = 'part-item';
        div.innerText = `Parte ${p.parte ?? (i+1)}`;
        div.onclick = () => { 
            loadPart(i); 
            // Mantener la llamada a loadPart aquí para el menú, ya que no depende del observer
            scrollToPart(videoIndex, i, true); // Usar flag de forzar scroll/carga si es necesario
            toggleMenu(); 
        };
        menu.appendChild(div);
    });
    highlightCurrentPart();
}
function highlightCurrentPart(){
    document.querySelectorAll('.part-item').forEach((el, idx) => el.classList.toggle('active', idx === current));
}

/* SOUND */
function enableSound(){
    allowSound = true;
    const s = $('sound-btn'); if(s) s.style.display = 'none';
    loadPart(current);
}

/* Set iframe src helper */
function setPlayer(start, duration, pos){
    const end = start + duration - 0.1;
    const unique = Date.now();
    playerFrame.src = `https://www.youtube.com/embed/${videoId}?start=${pos}&end=${end}&autoplay=1&controls=0&disablekb=1&modestbranding=1&rel=0&iv_load_policy=3&playsinline=1&enablejsapi=1&mute=${allowSound?0:1}&v=${unique}`;
}

/* CONFIG DE ADS (se mantiene igual) */
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

        // Agregar script 1 (config)
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

        // Agregar script 2 (invoke.js)
        const scriptInvoke = document.createElement("script");
        scriptInvoke.src = "//www.highperformanceformat.com/9a8c9978fb1543656fe2727727a4e06f/invoke.js";

        box.appendChild(scriptConfig);
        box.appendChild(scriptInvoke);
        container.appendChild(box);
    }
}


/* THUMBNAILS / SEARCH GRID (se mantiene igual) */
function buildThumbnails(containerId = 'thumbnails-container', data = videoData, clickFn = (idx)=> scrollToVideo(idx) ){
    const container = $(containerId);
    if(!container) return;
    container.innerHTML = '';
    (data || []).forEach((video, index) => {
        const wrapper = document.createElement('div'); wrapper.className = 'thumbnail-wrapper';
        const img = document.createElement('img');
        // USANDO LA MINIATURA DEL JSON PARA LAS GRILLAS DE EXPLORAR/BUSCAR
        img.src = video.thumbnail ? `https://raw.githubusercontent.com/johnclivergastonpascal/server_viewdiful/main/${video.thumbnail}` : 'https://via.placeholder.com/320x180?text=Sin+imagen';
        img.alt = video.titulo ?? 'Sin título';
        img.loading = 'lazy';
        img.onerror = () => img.src='https://via.placeholder.com/320x180?text=Sin+imagen';
        const overlay = document.createElement('div'); overlay.className = 'thumbnail-overlay';
        overlay.innerText = `${video.titulo ?? "Sin título"} · ${video.partes?.length ?? 0} partes`;

        wrapper.appendChild(img);
        wrapper.appendChild(overlay);
        wrapper.onclick = () => clickFn(index);
        container.appendChild(wrapper);
    });
}

/* SEARCH logic */
const searchInput = $('search-input');
if(searchInput){
    searchInput.addEventListener('input', ()=> {
        const q = (searchInput.value || '').toLowerCase();
        buildSearchResults(q);
    });
}
function buildSearchResults(query){
    const results = (videoData || []).filter(v => (v.titulo||'').toLowerCase().includes(query));
    buildThumbnails('search-results', results, (localIndex) => {
        // find the global index for the selected result
        const item = results[localIndex];
        if(!item) return;
        const global = videoData.findIndex(v => v.id === item.id);
        if(global >= 0) {
            toggleSearch();
            scrollToVideo(global);
        }
    });
}

/* UI show/hide logic (auto-hide controls) */
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

/* Toggle panels */
function toggleMenu(){ $('parts-menu').classList.toggle('open'); showUI(); }
function toggleExplore(){ $('explore-panel').classList.toggle('open'); showUI(); }
function toggleSearch(){ const p = $('search-panel'); p.classList.toggle('open'); if(p.classList.contains('open')) { $('search-input').focus(); buildSearchResults(''); } showUI(); }

/* Prev/Next global buttons ahora llaman a nextPart/prevPart */
$('prev-video-btn').addEventListener('click', prevPart);
$('next-video-btn').addEventListener('click', nextPart);

/* Scroll to a specific video index with smooth snap */
function scrollToVideo(index){
    const page = document.querySelector(`.video-page[data-index="${index}"]`);
    if(page){
        scrollContainer.scrollTop = page.offsetTop;
        // **CORRECCIÓN:** Asegurar que el scroll interno se resetea a 0 al saltar a un video.
        const partsContainer = page.querySelector('.video-page-parts-container');
        if(partsContainer) partsContainer.scrollTop = 0; 

        loadVideo(index);
    }
}

/* Nuevo: Scroll a una parte específica dentro del video */
function scrollToPart(videoIndex, partIndex, forceLoad = false){
    const videoPage = document.querySelector(`.video-page[data-index="${videoIndex}"]`);
    if(videoPage){
        const partsContainer = videoPage.querySelector('.video-page-parts-container');
        const partSection = partsContainer.querySelector(`.part-section[data-part-index="${partIndex}"]`);
        
        if(partsContainer && partSection){
            // Aseguramos que el contenedor del video esté visible
            scrollContainer.scrollTop = videoPage.offsetTop;
            // Desplazamos el contenedor de partes interno
            partsContainer.scrollTop = partSection.offsetTop;
            
            // **CORRECCIÓN:** La carga es responsabilidad del IntersectionObserver, excepto si se fuerza (ej. menú).
            if(forceLoad && partIndex !== current) {
                setTimeout(() => loadPart(partIndex), 100);
            }
        }
    }
}

/* Interaction to show UI */
document.addEventListener('mousemove', showUI, {passive:true});
document.addEventListener('touchstart', showUI, {passive:true});
document.addEventListener('keydown', showUI);

/* Initialize */
loadJSON();