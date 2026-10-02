import { 
    db, 
    auth, 
    musicasRef 
} from '../firebaseConfig_6.js';

import { 
    ref, 
    push, 
    onValue, 
    remove, 
    set, 
    get, 
    child 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

import { 
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// --- REGISTRO DO SERVICE WORKER PARA PWA ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker registrado com sucesso:', reg.scope))
            .catch(err => console.error('Falha ao registrar o Service Worker:', err));
    });
}

const DEFAULT_COVER = 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=500&q=80';

document.addEventListener('DOMContentLoaded', () => {

    let currentUser = null;
    let currentUserData = null;
    let cacheMusicas = {};
    let listaMusicas = [];
    let curtidasSet = new Set();
    let indexAtual = -1;
    let isShuffle = false;
    let isRepeat = false;

    // --- ELEMENTOS DE AUTENTICAÇÃO ---
    const authModal = document.getElementById('auth-modal');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const linkShowRegister = document.getElementById('link-show-register');
    const linkShowLogin = document.getElementById('link-show-login');
    const btnLogout = document.getElementById('btn-logout');
    const userDisplayName = document.getElementById('user-display-name');
    const userRoleTag = document.getElementById('user-role-tag');

    linkShowRegister?.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
        document.getElementById('auth-modal-title').textContent = 'Criar nova conta';
    });

    linkShowLogin?.addEventListener('click', (e) => {
        e.preventDefault();
        registerForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
        document.getElementById('auth-modal-title').textContent = 'Entrar no Spotify';
    });

    registerForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('reg-name').value.trim();
        const email = document.getElementById('reg-email').value.trim();
        const password = document.getElementById('reg-password').value;
        const role = document.querySelector('input[name="account-role"]:checked').value;

        try {
            const userCred = await createUserWithEmailAndPassword(auth, email, password);
            await set(ref(db, `users/${userCred.user.uid}`), {
                name: name,
                role: role,
                email: email
            });
            alert('Conta criada com sucesso!');
        } catch (err) {
            alert('Erro ao registrar: ' + err.message);
        }
    });

    loginForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;

        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (err) {
            alert('Erro no login: ' + err.message);
        }
    });

    btnLogout?.addEventListener('click', async () => {
        try {
            await signOut(auth);
            currentUser = null;
            currentUserData = null;
            curtidasSet.clear();
            authModal?.classList.add('active');
            alert('Sessão encerrada com sucesso.');
        } catch (err) {
            alert('Erro ao sair: ' + err.message);
        }
    });

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            const snapshot = await get(child(ref(db), `users/${user.uid}`));
            if (snapshot.exists()) {
                currentUserData = snapshot.val();
                if (userDisplayName) userDisplayName.textContent = currentUserData.name;
                if (userRoleTag) userRoleTag.textContent = currentUserData.role === 'creator' ? 'Criador' : 'Ouvinte';
                aplicarPermissoes(currentUserData.role);
            }
            authModal?.classList.remove('active');

            const likesRef = ref(db, `likes/${currentUser.uid}`);
            onValue(likesRef, (snap) => {
                const val = snap.val() || {};
                curtidasSet = new Set(Object.keys(val));
                renderizar();
                renderizarCurtidas();
                atualizarBotaoCurtirPlayer();
            });

        } else {
            currentUser = null;
            currentUserData = null;
            curtidasSet.clear();
            if (userDisplayName) userDisplayName.textContent = 'Visitante';
            if (userRoleTag) userRoleTag.textContent = '-';
            aplicarPermissoes('listener');
            authModal?.classList.add('active');
        }
    });

    function aplicarPermissoes(role) {
        const navCreator = document.getElementById('nav-creator');
        if (role === 'creator') {
            navCreator?.classList.remove('hidden');
        } else {
            navCreator?.classList.add('hidden');
            switchView(navHome);
        }
        renderizar();
        renderizarPublicadas();
    }

    // --- NAVEGAÇÃO SPA ---
    const navHome = document.getElementById('nav-home');
    const navCreator = document.getElementById('nav-creator');
    const navLiked = document.getElementById('nav-liked');

    const viewHome = document.getElementById('view-home');
    const viewCreator = document.getElementById('view-creator');
    const viewLiked = document.getElementById('view-liked');
    const searchBoxWrapper = document.getElementById('search-box-wrapper');

    const views = [
        { btn: navHome, view: viewHome, showSearch: true },
        { btn: navCreator, view: viewCreator, showSearch: false },
        { btn: navLiked, view: viewLiked, showSearch: false }
    ];

    function switchView(targetBtn) {
        views.forEach(item => {
            if (item.btn && item.view) {
                if (item.btn === targetBtn) {
                    item.btn.classList.add('active');
                    item.view.classList.remove('hidden');
                    if (searchBoxWrapper) searchBoxWrapper.style.visibility = item.showSearch ? 'visible' : 'hidden';
                } else {
                    item.btn.classList.remove('active');
                    item.view.classList.add('hidden');
                }
            }
        });
    }

    navHome?.addEventListener('click', (e) => { e.preventDefault(); switchView(navHome); });
    navCreator?.addEventListener('click', (e) => { e.preventDefault(); switchView(navCreator); });
    navLiked?.addEventListener('click', (e) => { 
        e.preventDefault(); 
        switchView(navLiked); 
        renderizarCurtidas();
    });

    // --- ESCUTA DAS MÚSICAS ---
    const songsGrid = document.getElementById('songs-grid');
    const likedSongsGrid = document.getElementById('liked-songs-grid');
    const creatorPublishedList = document.getElementById('creator-published-list');
    const publishedCountBadge = document.getElementById('published-count-badge');
    const searchInput = document.getElementById('search-input');
    const songsRef = ref(db, 'songs');

    onValue(songsRef, (snapshot) => {
        cacheMusicas = snapshot.val() || {};
        listaMusicas = Object.keys(cacheMusicas).map(id => ({ id, ...cacheMusicas[id] }));
        renderizar();
        renderizarPublicadas();
        renderizarCurtidas();
    });

    if (searchInput) {
        searchInput.addEventListener('input', () => renderizar());
    }

    async function toggleCurtida(songId) {
        if (!currentUser) return alert('Faça login para curtir músicas!');
        const likeRef = ref(db, `likes/${currentUser.uid}/${songId}`);
        if (curtidasSet.has(songId)) {
            await remove(likeRef);
        } else {
            await set(likeRef, true);
        }
    }

    function renderizar() {
        if (!songsGrid) return;
        const termo = searchInput ? searchInput.value.toLowerCase().trim() : '';
        songsGrid.innerHTML = '';

        const filtradas = listaMusicas.filter(song => 
            song.title?.toLowerCase().includes(termo) || song.artist?.toLowerCase().includes(termo)
        );

        if (filtradas.length === 0) {
            songsGrid.innerHTML = '<p class="empty-msg">Nenhuma música encontrada.</p>';
            return;
        }

        filtradas.forEach((song) => {
            const card = criarCardMusica(song);
            songsGrid.appendChild(card);
        });
    }

    function renderizarCurtidas() {
        if (!likedSongsGrid) return;
        likedSongsGrid.innerHTML = '';

        const curtidas = listaMusicas.filter(song => curtidasSet.has(song.id));

        if (curtidas.length === 0) {
            likedSongsGrid.innerHTML = '<p class="empty-msg">Sua lista de músicas curtidas está vazia.</p>';
            return;
        }

        curtidas.forEach((song) => {
            const card = criarCardMusica(song);
            likedSongsGrid.appendChild(card);
        });
    }

    function criarCardMusica(song) {
        const card = document.createElement('div');
        card.className = 'music-card';
        
        const podeEliminar = currentUserData?.role === 'creator' && song.ownerId === currentUser?.uid;
        const isCurtida = curtidasSet.has(song.id);

        card.innerHTML = `
            <div class="card-img-wrapper">
                <img src="${song.cover}" alt="${song.title}" onerror="this.src='${DEFAULT_COVER}'">
                <button class="btn-play-card" type="button"><i class="fa-solid fa-play"></i></button>
                <button class="btn-like-card ${isCurtida ? 'active' : ''}" type="button">
                    <i class="${isCurtida ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
                </button>
            </div>
            <h4>${song.title}</h4>
            <p>${song.artist}</p>
            ${podeEliminar ? `
                <div class="card-actions">
                    <button class="btn-delete-song" type="button" title="Excluir"><i class="fa-solid fa-trash"></i></button>
                </div>
            ` : ''}
        `;

        card.querySelector('.btn-play-card')?.addEventListener('click', (e) => {
            e.stopPropagation();
            tocarMusicaPorId(song.id);
        });

        card.querySelector('.btn-like-card')?.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleCurtida(song.id);
        });

        if (podeEliminar) {
            card.querySelector('.btn-delete-song')?.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm(`Excluir "${song.title}"?`)) {
                    await remove(ref(db, `songs/${song.id}`));
                }
            });
        }

        return card;
    }

    function renderizarPublicadas() {
        if (!creatorPublishedList) return;
        creatorPublishedList.innerHTML = '';

        const minhasMusicas = listaMusicas.filter(s => s.ownerId === currentUser?.uid);
        if (publishedCountBadge) publishedCountBadge.textContent = `${minhasMusicas.length} faixas`;

        if (minhasMusicas.length === 0) {
            creatorPublishedList.innerHTML = '<p class="empty-msg">Ainda não publicou nenhuma música.</p>';
            return;
        }

        minhasMusicas.forEach(song => {
            const item = document.createElement('div');
            item.className = 'published-item';
            item.innerHTML = `
                <img src="${song.cover}" onerror="this.src='${DEFAULT_COVER}'" alt="Capa">
                <div class="published-item-info">
                    <h4>${song.title}</h4>
                    <p>${song.artist}</p>
                </div>
                <div class="published-actions">
                    <button class="btn-mini-play" type="button"><i class="fa-solid fa-play"></i></button>
                    <button class="btn-mini-delete" type="button"><i class="fa-solid fa-trash"></i></button>
                </div>
            `;

            item.querySelector('.btn-mini-play')?.addEventListener('click', () => tocarMusicaPorId(song.id));
            item.querySelector('.btn-mini-delete')?.addEventListener('click', async () => {
                if (confirm(`Remover "${song.title}"?`)) {
                    await remove(ref(db, `songs/${song.id}`));
                }
            });

            creatorPublishedList.appendChild(item);
        });
    }

    // --- ITUNES MODAL ---
    const btnImportItunes = document.getElementById('btn-import-itunes');
    const itunesModal = document.getElementById('itunes-modal');
    const btnCloseItunesModal = document.getElementById('btn-close-itunes-modal');
    const itunesSearchInput = document.getElementById('itunes-search-input');
    const btnItunesSearchExec = document.getElementById('btn-itunes-search-exec');
    const itunesResultsList = document.getElementById('itunes-results-list');

    btnImportItunes?.addEventListener('click', () => {
        if (itunesModal) {
            itunesModal.classList.add('active');
            if (itunesResultsList) itunesResultsList.innerHTML = '';
            if (itunesSearchInput) itunesSearchInput.value = '';
        }
    });

    btnCloseItunesModal?.addEventListener('click', () => {
        itunesModal?.classList.remove('active');
    });

    btnItunesSearchExec?.addEventListener('click', () => executarBuscaItunes());
    itunesSearchInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') executarBuscaItunes();
    });

    async function executarBuscaItunes() {
        const query = itunesSearchInput?.value.trim();
        if (!query) return alert('Digite algo para buscar no iTunes.');

        if (itunesResultsList) itunesResultsList.innerHTML = '<p class="empty-msg">Buscando...</p>';

        try {
            const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=10`);
            const data = await res.json();

            if (!data.results || data.results.length === 0) {
                if (itunesResultsList) itunesResultsList.innerHTML = `<p class="empty-msg">Nenhum resultado para "${query}".</p>`;
                return;
            }

            if (itunesResultsList) {
                itunesResultsList.innerHTML = '';
                data.results.forEach(item => {
                    const coverHD = item.artworkUrl100 ? item.artworkUrl100.replace('100x100bb', '600x600bb') : DEFAULT_COVER;
                    const elem = document.createElement('div');
                    elem.className = 'itunes-item';
                    elem.innerHTML = `
                        <img src="${coverHD}" alt="Capa">
                        <div class="itunes-item-info">
                            <h4>${item.trackName}</h4>
                            <p>${item.artistName}</p>
                        </div>
                        <button class="btn-import-single" type="button">Importar</button>
                    `;

                    elem.querySelector('.btn-import-single')?.addEventListener('click', async (e) => {
                        const btn = e.target;
                        btn.disabled = true;
                        btn.textContent = 'Importando...';

                        await push(ref(db, 'songs'), {
                            title: item.trackName,
                            artist: item.artistName,
                            cover: coverHD,
                            url: item.previewUrl,
                            ownerId: 'itunes'
                        });

                        btn.textContent = 'Importada!';
                        btn.style.background = '#444';
                        btn.style.color = '#fff';
                    });

                    itunesResultsList.appendChild(elem);
                });
            }
        } catch (err) {
            alert('Erro ao buscar no iTunes: ' + err.message);
        }
    }

    // --- LEITOR DE ÁUDIO ---
    const audioPlayer = document.getElementById('audio-player');
    const btnPlay = document.getElementById('btn-play');
    const playIcon = document.getElementById('play-icon');
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    const btnShuffle = document.getElementById('btn-shuffle');
    const btnRepeat = document.getElementById('btn-repeat');
    const btnLikePlayer = document.getElementById('btn-like-player');

    const progressBar = document.getElementById('progress-bar');
    const currentTimeEl = document.getElementById('current-time');
    const durationEl = document.getElementById('duration');
    const volumeBar = document.getElementById('volume-bar');
    const volumeIcon = document.getElementById('volume-icon');

    const playerTitle = document.getElementById('player-title');
    const playerArtist = document.getElementById('player-artist');
    const playerCover = document.getElementById('player-cover');

    function tocarMusicaPorIndex(idx) {
        if (!audioPlayer || listaMusicas.length === 0 || idx < 0 || idx >= listaMusicas.length) return;
        indexAtual = idx;
        const song = listaMusicas[indexAtual];

        audioPlayer.src = song.url;
        audioPlayer.play().then(() => {
            if (playIcon) playIcon.className = 'fa-solid fa-pause';
        }).catch(err => console.error(err));

        const cover = song.cover || DEFAULT_COVER;
        if (playerTitle) playerTitle.textContent = song.title;
        if (playerArtist) playerArtist.textContent = song.artist;
        if (playerCover) playerCover.src = cover;

        atualizarBotaoCurtirPlayer();
    }

    function tocarMusicaPorId(id) {
        const idx = listaMusicas.findIndex(s => s.id === id);
        if (idx !== -1) tocarMusicaPorIndex(idx);
    }

    function atualizarBotaoCurtirPlayer() {
        if (!btnLikePlayer) return;
        if (indexAtual !== -1 && listaMusicas[indexAtual]) {
            const songId = listaMusicas[indexAtual].id;
            const isCurtida = curtidasSet.has(songId);
            btnLikePlayer.innerHTML = `<i class="${isCurtida ? 'fa-solid' : 'fa-regular'} fa-heart"></i>`;
            btnLikePlayer.classList.toggle('active', isCurtida);
        } else {
            btnLikePlayer.innerHTML = `<i class="fa-regular fa-heart"></i>`;
            btnLikePlayer.classList.remove('active');
        }
    }

    btnLikePlayer?.addEventListener('click', () => {
        if (indexAtual !== -1 && listaMusicas[indexAtual]) {
            toggleCurtida(listaMusicas[indexAtual].id);
        }
    });

    btnPlay?.addEventListener('click', () => {
        if (!audioPlayer || !audioPlayer.src) return;
        if (audioPlayer.paused) {
            audioPlayer.play();
            if (playIcon) playIcon.className = 'fa-solid fa-pause';
        } else {
            audioPlayer.pause();
            if (playIcon) playIcon.className = 'fa-solid fa-play';
        }
    });

    btnNext?.addEventListener('click', () => proximaMusica());

    function proximaMusica() {
        if (listaMusicas.length === 0) return;
        if (isShuffle) {
            const randomIndex = Math.floor(Math.random() * listaMusicas.length);
            tocarMusicaPorIndex(randomIndex);
        } else {
            const proximoIndex = (indexAtual + 1) % listaMusicas.length;
            tocarMusicaPorIndex(proximoIndex);
        }
    }

    btnPrev?.addEventListener('click', () => {
        if (listaMusicas.length === 0 || !audioPlayer) return;
        if (audioPlayer.currentTime > 3) {
            audioPlayer.currentTime = 0;
        } else {
            const prevIndex = (indexAtual - 1 + listaMusicas.length) % listaMusicas.length;
            tocarMusicaPorIndex(prevIndex);
        }
    });

    btnShuffle?.addEventListener('click', () => {
        isShuffle = !isShuffle;
        btnShuffle.classList.toggle('active', isShuffle);
    });

    btnRepeat?.addEventListener('click', () => {
        isRepeat = !isRepeat;
        btnRepeat.classList.toggle('active', isRepeat);
    });

    audioPlayer?.addEventListener('ended', () => {
        if (isRepeat) {
            audioPlayer.currentTime = 0;
            audioPlayer.play();
        } else {
            proximaMusica();
        }
    });

    audioPlayer?.addEventListener('timeupdate', () => {
        if (!audioPlayer.duration) return;
        if (progressBar) progressBar.value = (audioPlayer.currentTime / audioPlayer.duration) * 100;
        if (currentTimeEl) currentTimeEl.textContent = formatarTempo(audioPlayer.currentTime);
        if (durationEl) durationEl.textContent = formatarTempo(audioPlayer.duration);
    });

    progressBar?.addEventListener('input', () => {
        if (audioPlayer && audioPlayer.duration) {
            audioPlayer.currentTime = (progressBar.value / 100) * audioPlayer.duration;
        }
    });

    volumeBar?.addEventListener('input', () => {
        if (!audioPlayer) return;
        audioPlayer.volume = volumeBar.value / 100;
        if (volumeIcon) {
            volumeIcon.className = audioPlayer.volume === 0 ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
        }
    });

    function formatarTempo(segs) {
        const m = Math.floor(segs / 60);
        const s = Math.floor(segs % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    // --- FORMULÁRIO DE PUBLICAÇÃO (AJUSTADO PARA URL) ---
    const creatorForm = document.getElementById('creator-form');
    const audioUrlInput = document.getElementById('song-audio-url');
    const coverUrlInput = document.getElementById('song-cover-url');

    creatorForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (currentUserData?.role !== 'creator') return alert('Apenas criadores podem publicar.');

        const title = document.getElementById('song-title').value.trim();
        const artist = document.getElementById('song-artist').value.trim();
        const audioUrl = audioUrlInput?.value.trim();
        const coverUrl = coverUrlInput?.value.trim();

        if (!audioUrl) return alert('Insira o link direto do arquivo de áudio.');

        try {
            await push(ref(db, 'songs'), {
                title,
                artist,
                url: audioUrl,
                cover: coverUrl || DEFAULT_COVER,
                ownerId: currentUser.uid
            });

            alert('Música publicada com sucesso!');
            creatorForm.reset();
        } catch (err) {
            alert('Erro ao guardar música: ' + err.message);
        }
    });
});