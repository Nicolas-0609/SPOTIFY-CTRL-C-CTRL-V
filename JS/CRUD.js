import { db } from './firebaseConfig_2.js';
import { 
    ref, 
    push, 
    onValue, 
    remove, 
    update,
    set,
    get
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

let useLocalStorage = false;

if (!db) {
    console.warn("Firebase não configurado. Utilizando LocalStorage como fallback.");
    useLocalStorage = true;
}

function getLocalMusicas() {
    return JSON.parse(localStorage.getItem('spotify_musicas') || '{}');
}

function saveLocalMusicas(data) {
    localStorage.setItem('spotify_musicas', JSON.stringify(data));
}

let localListeners = [];

function notifyLocalListeners() {
    const data = getLocalMusicas();
    localListeners.forEach(cb => cb(data));
}

// ==========================================================================
// 1. OPERAÇÕES NA BIBLIOTECA DO USUÁRIO / MÚSICAS GERAIS
// ==========================================================================

export async function criarMusica(songData) {
    const dataComFavorito = { favorite: false, ...songData };

    if (useLocalStorage) {
        const musicas = getLocalMusicas();
        const newId = 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        musicas[newId] = dataComFavorito;
        saveLocalMusicas(musicas);
        notifyLocalListeners();
        return;
    }

    // Usando o caminho padrão do seu app adaptado para o banco
    const userSongsRef = ref(db, `musicas`);
    return await push(userSongsRef, dataComFavorito);
}

export function escutarMusicas(callback) {
    if (useLocalStorage) {
        localListeners.push(callback);
        callback(getLocalMusicas());
        return;
    }

    const userSongsRef = ref(db, `musicas`);
    onValue(userSongsRef, (snapshot) => {
        callback(snapshot.val());
    }, (error) => {
        console.error("Erro no Firebase, usando LocalStorage:", error);
        useLocalStorage = true;
        callback(getLocalMusicas());
    });
}

export async function atualizarMusica(songId, songData) {
    if (useLocalStorage) {
        const musicas = getLocalMusicas();
        if (musicas[songId]) {
            musicas[songId] = { ...musicas[songId], ...songData };
            saveLocalMusicas(musicas);
            notifyLocalListeners();
        }
        return;
    }

    const songItemRef = ref(db, `musicas/${songId}`);
    return await update(songItemRef, songData);
}

export async function toggleFavorito(id, estadoAtual) {
    await atualizarMusica(id, { favorite: !estadoAtual });
}

export async function deletarMusica(songId) {
    if (useLocalStorage) {
        const musicas = getLocalMusicas();
        delete musicas[songId];
        saveLocalMusicas(musicas);
        notifyLocalListeners();
        return;
    }

    const songItemRef = ref(db, `musicas/${songId}`);
    return await remove(songItemRef);
}

// ==========================================================================
// 2. OPERAÇÕES NO CATÁLOGO GERAL / HITS (catalog_songs)
// ==========================================================================

export async function adicionarAoCatalogo(songData) {
    const catalogRef = ref(db, 'catalog_songs');
    return await push(catalogRef, songData);
}

export function escutarCatalogo(callback) {
    const catalogRef = ref(db, 'catalog_songs');
    onValue(catalogRef, (snapshot) => {
        callback(snapshot.val());
    });
}