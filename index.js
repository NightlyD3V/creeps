const homepage_sound = document.getElementById('homepage-sound')
const typing_sound = document.getElementById('typing-sound')
const item_sound = document.getElementById('item-sound')
const button_sound = document.getElementById('button-click-sound')
const scary_music_box = document.getElementById('scary-music-box')

// Seamless looping music box using Web Audio API
let audioContext = null;
let musicBuffer = null;
let musicSource = null;
let isMusicPlaying = false;

// Preloading state
let preloadComplete = false;
let loadedAssets = 0;
let totalAssets = 0;

// Assets to preload for the game (including the game page itself!)
const assetsToPreload = [
    // Game page and scripts
    './src/levels/1/level_1.html',
    './src/levels/1/level_1.js',
    // Models
    '/assets/models/Skeleton/Skeleton.gltf',
    '/assets/animations/ZombieCrawlAnimation/26c3a332-36ca-491c-89f8-0fd28a98ffec.gltf',
    '/assets/models/flashlight.glb',
    '/assets/models/grass_patch.glb',
    '/assets/models/SM_Autumn_02.gltf',
    // Textures
    '/assets/materials/groundPBR/rocky_terrain_02_diff_4k.jpg',
    '/assets/materials/flashlight_texture.jpg',
    '/assets/materials/grass/grass_atlas_1024.png',
    '/assets/materials/trees/T_Autumn_D.png',
    '/assets/materials/trees/T_Autumn_N_1.png',
    '/assets/materials/trees/T_Autumn_OP_1.png',
    'soccer_ball_mat_bcolor.png',
    // Audio
    '/assets/sounds/fx/calming-rain.mp3',
    '/assets/sounds/fx/walking-through-grass.mp3',
    '/assets/sounds/fx/grunts.mp3',
    '/assets/sounds/fx/wailing-creature.mp3',
    '/assets/sounds/fx/monster-growl.mp3',
    '/assets/sounds/amp-tension.mp3'
];

totalAssets = assetsToPreload.length;

function getPreloadProgress() {
    return Math.floor((loadedAssets / totalAssets) * 100);
}

function updateProgressBar(url) {
    const progressBar = document.getElementById('preload-bar');
    const progressPercent = document.getElementById('preload-percent');
    const progressStatus = document.getElementById('preload-status');
    
    if (progressBar && progressPercent && progressStatus) {
        const progress = getPreloadProgress();
        progressBar.style.width = progress + '%';
        progressPercent.textContent = progress + '%';
        
        // Show shortened filename
        const filename = url.split('/').pop();
        progressStatus.textContent = `Loading: ${filename}`;
    }
}

function preloadAsset(url) {
    return fetch(url)
        .then(response => response.blob())
        .then(() => {
            loadedAssets++;
            updateProgressBar(url);
            console.log(`Loaded: ${url} (${loadedAssets}/${totalAssets})`);
        })
        .catch(err => {
            loadedAssets++;
            updateProgressBar(url);
            console.warn(`Failed to preload: ${url}`, err);
        });
}

async function preloadAllAssets() {
    console.log('Starting asset preload...');
    
    // Load assets sequentially with a small delay so user can see progress
    for (const url of assetsToPreload) {
        await preloadAsset(url);
        // Small delay between assets so user can see what's loading
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    preloadComplete = true;
    console.log('All assets preloaded!');
}

function initAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContext;
}

function loadMusicBox() {
    const context = initAudioContext();
    
    fetch('./assets/sounds/fx/scary-music-box.mp3')
        .then(response => response.arrayBuffer())
        .then(arrayBuffer => context.decodeAudioData(arrayBuffer))
        .then(buffer => {
            musicBuffer = buffer;
            console.log('Music box loaded successfully');
            
            // Try to start playing immediately
            startSeamlessLoop();
        })
        .catch(error => {
            console.error('Error loading music box:', error);
        });
}

function startSeamlessLoop() {
    if (!musicBuffer || !audioContext) return;
    
    // Stop any existing playback
    if (musicSource) {
        musicSource.stop();
    }
    
    const context = audioContext;
    musicSource = context.createBufferSource();
    const gainNode = context.createGain();
    
    musicSource.buffer = musicBuffer;
    musicSource.loop = true; // Enable seamless looping
    gainNode.gain.value = 0.3; // Volume
    
    musicSource.connect(gainNode);
    gainNode.connect(context.destination);
    
    musicSource.start(0);
    isMusicPlaying = true;
    console.log('Music box started with seamless looping');
}

function stopMusicBox() {
    if (musicSource && isMusicPlaying) {
        musicSource.stop();
        isMusicPlaying = false;
    }
}

// Initialize music box loading
loadMusicBox();

// Resume audio context on user interaction (required by browsers)
document.addEventListener('click', () => {
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
        if (musicBuffer && !isMusicPlaying) {
            startSeamlessLoop();
        }
    }
}, { once: true });

document.addEventListener('keydown', () => {
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
        if (musicBuffer && !isMusicPlaying) {
            startSeamlessLoop();
        }
    }
}, { once: true });
const start_button = document.getElementById('start-button')
const title = document.getElementById('top-content')
const loader = document.getElementById('loading')
const credits_button = document.getElementById('credits-button')

start_button.addEventListener('click', (event) => {
    event.preventDefault
    button_sound.play()
    start_button.style.display = 'none';
    homepage_sound.play()
    typing_sound.play()
    fadeOut(title, 500)
    fadeIn(loader, 3000)
    
    // Show progress bar
    const preloadContainer = document.getElementById('preload-container');
    if (preloadContainer) {
        preloadContainer.style.display = 'block';
    }
    
    // Start preloading assets in the background immediately
    preloadAllAssets();
    
    // Start the original typewriter effect
    typewriterEffect(textElement, wordsToType, typingSpeed, pauseTime);
})

function fadeIn(element, duration) {
    element.style.opacity = 0;
    let startTime = null;
  
    function animation(currentTime) {
      if (!startTime) startTime = currentTime;
      const timeElapsed = currentTime - startTime;
      const progress = Math.min(timeElapsed / duration, 1); // Ensure progress doesn't exceed 1
  
      element.style.opacity = progress;
  
      if (timeElapsed < duration) {
        requestAnimationFrame(animation);
      }
    }
    requestAnimationFrame(animation);
  }
  

function fadeOut(element, duration) {
    element.style.opacity = 1;
    let startTime = null;
  
    function animation(currentTime) {
      if (!startTime) startTime = currentTime;
      const timeElapsed = currentTime - startTime;
      const progress = Math.min(timeElapsed / duration, 1);
  
      element.style.opacity = 1 - progress;
  
      if (timeElapsed < duration) {
        requestAnimationFrame(animation);
      }
    }
    requestAnimationFrame(animation);
  }

  function typewriterEffect(element, words, baseSpeed, pauseAfterWord) {
    let wordIndex = 0;
    let charIndex = 0;
    let currentWord = '';
    let isPausing = false;

    function type() {
        if (wordIndex < words.length) {
            currentWord = words[wordIndex];
            if (charIndex < currentWord.length) {
                if (!isPausing) {
                    if(wordIndex == 3) {
                        item_sound.play();
                    }
                    element.textContent += currentWord.charAt(charIndex);
                    charIndex++;

                    const speed = baseSpeed + Math.floor(Math.random() * 50) - 25;

                    if (Math.random() < 0.05) {
                        setTimeout(eraseChar, speed / 2);
                    } else {
                        setTimeout(type, speed);
                    }
                }
            } else {
                isPausing = true;
                if (wordIndex === words.length - 1) { // Check if it's the last word
                    setTimeout(() => { isPausing = false; }, pauseAfterWord);
                    const delay = 3000;

                    // Wait for both typewriter to finish AND preload to complete
                    setTimeout(() => {
                      waitForPreloadAndLaunch();
                    }, delay);
                  
                } else {
                    setTimeout(erase, pauseAfterWord + Math.random() * 200);
                }
            }
        }
    }

    function erase() {
        if (charIndex > 0) {
            element.textContent = currentWord.substring(0, charIndex - 1);
            charIndex--;
            setTimeout(erase, baseSpeed / 2 + Math.random() * 50);
        } else {
            wordIndex++;
            isPausing = false;
            setTimeout(type, baseSpeed * 5 + Math.random() * 300);
        }
    }

    function eraseChar() {
        if (charIndex > 0) {
            element.textContent = currentWord.substring(0, charIndex - 1);
            charIndex--;
            setTimeout(type, baseSpeed + Math.random() * 50 - 25);
        } else {
            setTimeout(type, baseSpeed + Math.random() * 50 - 25);
        }
    }

    type();
}

function waitForPreloadAndLaunch() {
    if (preloadComplete) {
        // All assets loaded - launch immediately
        console.log('Preload complete, launching game...');
        window.location.href = "./src/levels/1/level_1.html";
    } else {
        // Still loading - update status and wait
        const progressStatus = document.getElementById('preload-status');
        if (progressStatus) {
            progressStatus.textContent = `Finalizing... ${getPreloadProgress()}%`;
        }
        console.log(`Waiting for preload: ${getPreloadProgress()}%`);
        setTimeout(waitForPreloadAndLaunch, 200);
    }
}

const textElement = document.getElementById('typewriter-text');
const wordsToType = ["COMPILING WEB ASSEMBLY . . .", "SUMMONING CREEPS . . .", "CONNECTION ESTABLISHED!", "LAUNCHING GAME . . ."];
const typingSpeed = 70;
const pauseTime = 1500;
