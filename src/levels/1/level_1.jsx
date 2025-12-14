import * as THREE from 'three/webgpu'
import { GLTFLoader } from 'three/examples/jsm/Addons.js'
import WebGPU from 'three/addons/capabilities/WebGPU.js';
import { dotScreen } from 'three/addons/tsl/display/DotScreenNode.js';
import { rgbShift } from 'three/addons/tsl/display/RGBShiftNode.js';
import { dof } from 'three/examples/jsm/tsl/display/DepthOfFieldNode.js';
import { ACESFilmicToneMappingShader } from 'three/addons/shaders/ACESFilmicToneMappingShader.js';
import { LineBasicMaterial } from 'three/webgpu';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js'
import { Skybox } from '../../../assets/models/scripts/skybox'
import { Stars } from '../../../assets/models/scripts/stars'
import Grass from '../../../assets/models/scripts/grass'
import { Rain } from '../../../assets/models/scripts/rain'
import { WaterSplash } from '../../../assets/models/scripts/waterSplash'
import { Trees } from '../../../assets/models/scripts/trees'
import { Bushes } from '../../../assets/models/scripts/bushes'
import { Fog } from '../../../assets/models/scripts/fog'
import { Fire } from '../../../assets/models/scripts/fire'
import { Moon } from '../../../assets/models/scripts/moon'
import { EnemyAI } from '../../../assets/models/scripts/enemyAI_improved.jsx'
import { loadSkeletonFx, playDeadlyStrike, playHitMiss } from './audio_fx'
import { Maze } from '../../../assets/models/scripts/maze'
import  Page  from '../../../assets/models/scripts/page'
import Stats from 'stats.js'
import { positionLocal, Fn, pass, uniform, vec4, vec3, vec2, tslFn, length, float, abs, time, sin, mod, fract, floor, hash, uv, mix, clamp, shapeCircle,
				instancedArray, instanceIndex } from 'three/tsl'

requestAnimationFrame(function loop(){ requestAnimationFrame(loop) });
let container, camera, scene, renderer, flashlight = null;

// Reusable temp vectors to avoid GC pressure in render loop
const _camPos = new THREE.Vector3();
const _toEnemy = new THREE.Vector3();
const _tempUp = new THREE.Vector3(0, 1, 0);
const _mobileTemp = new THREE.Vector3();
const _characterPos = new THREE.Vector3();

// === OPTIMIZED AUDIO SYSTEM ===
// Audio context will be set from THREE.AudioListener to ensure compatibility
let audioContext = null;
let threeAudioListener = null; // Store reference to THREE.js AudioListener for fade out

// Audio buffers
let menuSoundBuffer = null;
let buttonPressBuffer = null;
let rainSoundBuffer = null;
let cricketSoundBuffer = null;
let walkingSoundBuffer = null;
let gruntSoundBuffer = null;

// Looping sound sources (need to track for stop/restart)
let rainSource = null;
let rainGain = null;
let cricketSource = null;
let cricketGain = null;
let walkingSource = null;
let walkingGain = null;
let masterGain = null; // Master volume control for fade out

// Initialize audio with the shared context from THREE.AudioListener
function initAudioSystem(listener) {
    audioContext = listener.context;
    threeAudioListener = listener; // Store reference for fade out
    
    // Create master gain node for global volume control
    masterGain = audioContext.createGain();
    masterGain.connect(audioContext.destination);
    masterGain.gain.value = 1.0;
    
    // Set latency hint if possible (may not work on all browsers after creation)
    console.log('Audio system initialized with shared context');
    
    loadAllSounds();
}

// Load all sounds into buffers (Web Audio API is more efficient than HTML5 Audio)
function loadAllSounds() {
    if (!audioContext) return;
    
    const loadSound = (url) => {
        return fetch(url)
            .then(response => response.arrayBuffer())
            .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer));
    };

    loadSound('/assets/sounds/fx/menu-open.mp3')
        .then(buffer => { menuSoundBuffer = buffer; console.log('Menu sound loaded'); })
        .catch(e => console.error('Error loading menu sound:', e));

    loadSound('/assets/sounds/fx/button-press.mp3')
        .then(buffer => { buttonPressBuffer = buffer; })
        .catch(e => console.error('Error loading button sound:', e));

    loadSound('/assets/sounds/fx/calming-rain.mp3')
        .then(buffer => { 
            rainSoundBuffer = buffer; 
            console.log('Rain sound loaded');
            startRainOnInteraction();
        })
        .catch(e => console.error('Error loading rain sound:', e));

    // Load ambient insect/cricket loop to layer with rain
    loadSound('/assets/sounds/fx/cricket-insect-sound.mp3')
      .then(buffer => {
        cricketSoundBuffer = buffer;
        console.log('Cricket sound loaded');
      })
      .catch(e => console.error('Error loading cricket sound:', e));

    loadSound('/assets/sounds/fx/walking-through-grass.mp3')
        .then(buffer => { walkingSoundBuffer = buffer; })
        .catch(e => console.error('Error loading walking sound:', e));
    
    loadSound('/assets/sounds/fx/grunts.mp3')
        .then(buffer => { 
            gruntSoundBuffer = buffer; 
            console.log('Grunt sounds loaded, duration:', buffer.duration.toFixed(2) + 's');
        })
        .catch(e => console.error('Error loading grunt sound:', e));
}

function startRainOnInteraction() {
    const startRain = () => {
        playRainSound();
        document.removeEventListener('click', startRain);
        document.removeEventListener('keydown', startRain);
    };
    if (audioContext && audioContext.state === 'running' && rainSoundBuffer) {
        playRainSound();
    } else {
        document.addEventListener('click', startRain, { once: true });
        document.addEventListener('keydown', startRain, { once: true });
    }
}

// --- DAMAGE UI HELPERS ---
let damageOverlay = null;
function ensureDamageOverlay() {
  try {
    if (damageOverlay) return;
    damageOverlay = document.getElementById('damage-overlay');
    if (!damageOverlay) {
      damageOverlay = document.createElement('div');
      damageOverlay.id = 'damage-overlay';
      Object.assign(damageOverlay.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100vw',
        height: '100vh',
        background: 'rgba(255,0,0,0.8)',
        pointerEvents: 'none',
        opacity: '0',
        transition: 'opacity 200ms ease-out',
        zIndex: '999999'
      });
      document.body.appendChild(damageOverlay);
    }
  } catch (e) {
    damageOverlay = null;
  }
}

function screenShake(duration = 200, magnitude = 6) {
  try {
    const el = renderer && renderer.domElement ? renderer.domElement : document.body;
    const start = performance.now();
    const orig = el.style.transform || '';
    function frame() {
      const now = performance.now();
      const elapsed = now - start;
      const pct = Math.min(1, elapsed / duration);
      const damper = 1 - pct;
      if (pct >= 1) {
        el.style.transform = orig;
        return;
      }
      const x = (Math.random() * 2 - 1) * magnitude * damper;
      const y = (Math.random() * 2 - 1) * magnitude * damper;
      el.style.transform = `translate(${x}px, ${y}px)`;
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  } catch (e) {
    // ignore errors
  }
}

// --- PICKUP ICON HUD ---
let pickupIcon = null;
function ensurePickupIcon() {
  try {
    if (pickupIcon) return;
    pickupIcon = document.getElementById('pickup-icon');
    if (!pickupIcon) {
      pickupIcon = document.createElement('img');
      pickupIcon.id = 'pickup-icon';
      pickupIcon.src = '/assets/icons/github.png';
      Object.assign(pickupIcon.style, {
        position: 'fixed',
        left: 'calc(50% - 24px)',
        top: 'calc(50% - 24px)',
        width: '48px',
        height: '48px',
        pointerEvents: 'none',
        opacity: '0',
        transition: 'opacity 120ms ease-out, transform 120ms ease-out',
        transform: 'scale(1)',
        zIndex: '999998'
      });
      document.body.appendChild(pickupIcon);
    }
  } catch (e) {
    pickupIcon = null;
  }
}

function showPickupIcon() {
  ensurePickupIcon();
  if (!pickupIcon) return;
  pickupIcon.style.opacity = '1';
  pickupIcon.style.transform = 'scale(1.05)';
}

function hidePickupIcon() {
  if (!pickupIcon) return;
  pickupIcon.style.opacity = '0';
  pickupIcon.style.transform = 'scale(1)';
}

function playRainSound() {
  if (!audioContext || !rainSoundBuffer || rainSource) return;
    
    if (audioContext.state === 'suspended') audioContext.resume();
    
    rainSource = audioContext.createBufferSource();
    rainGain = audioContext.createGain();
    
    rainSource.buffer = rainSoundBuffer;
    rainSource.loop = true;
    rainGain.gain.value = 0.1;
    
    rainSource.connect(rainGain);
    rainGain.connect(masterGain || audioContext.destination);
    rainSource.start(0);
    
  // Also start cricket/insect ambient loop if loaded
  try {
    if (cricketSoundBuffer && !cricketSource) {
      cricketSource = audioContext.createBufferSource();
      cricketGain = audioContext.createGain();
      cricketSource.buffer = cricketSoundBuffer;
      cricketSource.loop = true;
      // quieter than rain by default
      cricketGain.gain.value = 0.06;
      cricketSource.connect(cricketGain);
      cricketGain.connect(masterGain || audioContext.destination);
      cricketSource.start(0);
    }
  } catch (e) {
    console.warn('Failed to start cricket sound:', e);
  }
}

function stopRainSound() {
    if (rainSource) {
        try { rainSource.stop(); } catch(e) {}
        rainSource = null;
    }
  if (cricketSource) {
    try { cricketSource.stop(); } catch(e) {}
    cricketSource = null;
  }
}

// Fade out rain sound over duration (in seconds)
function fadeOutRainSound(duration = 2.0) {
  if (audioContext && (rainGain || cricketGain) && (rainSource || cricketSource)) {
    const startTime = audioContext.currentTime;
    if (rainGain) {
      rainGain.gain.setValueAtTime(rainGain.gain.value, startTime);
      rainGain.gain.linearRampToValueAtTime(0, startTime + duration);
    }
    if (cricketGain) {
      cricketGain.gain.setValueAtTime(cricketGain.gain.value, startTime);
      cricketGain.gain.linearRampToValueAtTime(0, startTime + duration);
    }
    setTimeout(() => {
      stopRainSound();
    }, duration * 1000);
  }
}

// Fade out walking sound over duration (in seconds)
function fadeOutWalkingSound(duration = 1.0) {
    if (walkingGain && walkingSource) {
        const startTime = audioContext.currentTime;
        walkingGain.gain.setValueAtTime(walkingGain.gain.value, startTime);
        walkingGain.gain.linearRampToValueAtTime(0, startTime + duration);
        setTimeout(() => {
            stopWalkingSound();
        }, duration * 1000);
    }
}

// Fade out ALL audio globally (affects everything including THREE.js positional audio)
function fadeOutAllAudio(duration = 2.0) {
    if (!audioContext) return;
    
    const startTime = audioContext.currentTime;
    
    // Fade out master gain (affects rain, walking, menu sounds)
    if (masterGain) {
        masterGain.gain.setValueAtTime(masterGain.gain.value, startTime);
        masterGain.gain.linearRampToValueAtTime(0, startTime + duration);
    }
    
    // Fade out the THREE.js AudioListener gain (affects all positional audio from enemies)
    if (threeAudioListener && threeAudioListener.gain) {
        threeAudioListener.gain.gain.setValueAtTime(threeAudioListener.gain.gain.value, startTime);
        threeAudioListener.gain.gain.linearRampToValueAtTime(0, startTime + duration);
    }
    
    // Also fade individual sources in case they're connected directly
    if (rainGain) {
        rainGain.gain.setValueAtTime(rainGain.gain.value, startTime);
        rainGain.gain.linearRampToValueAtTime(0, startTime + duration);
    }
    if (cricketGain) {
      cricketGain.gain.setValueAtTime(cricketGain.gain.value, startTime);
      cricketGain.gain.linearRampToValueAtTime(0, startTime + duration);
    }
    if (walkingGain) {
        walkingGain.gain.setValueAtTime(walkingGain.gain.value, startTime);
        walkingGain.gain.linearRampToValueAtTime(0, startTime + duration);
    }
}

function playWalkingSound() {
    if (!audioContext || !walkingSoundBuffer || walkingSource) return;
    
    if (audioContext.state === 'suspended') audioContext.resume();
    
    walkingSource = audioContext.createBufferSource();
    walkingGain = audioContext.createGain();
    
    walkingSource.buffer = walkingSoundBuffer;
    walkingSource.loop = true;
    walkingGain.gain.value = 0.5;
    
    walkingSource.connect(walkingGain);
    walkingGain.connect(masterGain || audioContext.destination);
    walkingSource.start(0);
}

function stopWalkingSound() {
    if (walkingSource) {
        try { walkingSource.stop(); } catch(e) {}
        walkingSource = null;
    }
}

function playMenuSound(detuneAmount = 0) {
    if (!audioContext || !menuSoundBuffer) return;
    if (audioContext.state === 'suspended') audioContext.resume();
    
    const source = audioContext.createBufferSource();
    const gainNode = audioContext.createGain();
    
    source.buffer = menuSoundBuffer;
    source.playbackRate.value = Math.pow(2, detuneAmount / 1200);
    gainNode.gain.value = 1.0;
    
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);
    source.start(0);
}

function playButtonPress(detune = 0) {
    if (!audioContext || !buttonPressBuffer) return;
    if (audioContext.state === 'suspended') audioContext.resume();
    
    const source = audioContext.createBufferSource();
    const gainNode = audioContext.createGain();
    
    source.buffer = buttonPressBuffer;
    source.detune.value = detune;
    gainNode.gain.value = 1.0;
    
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);
    source.start(0);
}

// Play a random grunt from the grunts.mp3 file
// The file contains multiple grunts, each approximately 0.5-1 second long
function playGruntSound() {
    if (!audioContext || !gruntSoundBuffer) return;
    if (audioContext.state === 'suspended') audioContext.resume();
    
    const source = audioContext.createBufferSource();
    const gainNode = audioContext.createGain();
    
    source.buffer = gruntSoundBuffer;
    
    // Estimate number of grunts in file (assuming ~1 second per grunt)
    const gruntDuration = 1.0; // Approximate duration of each grunt
    const totalDuration = gruntSoundBuffer.duration;
    const numGrunts = Math.floor(totalDuration / gruntDuration);
    
    // Pick a random grunt
    const gruntIndex = Math.floor(Math.random() * numGrunts);
    const startTime = gruntIndex * gruntDuration;
    
    // Add slight pitch variation for variety
    source.playbackRate.value = 0.9 + Math.random() * 0.2; // 0.9 to 1.1
    
    gainNode.gain.value = 0.8;
    
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Play only the selected grunt segment
    source.start(0, startTime, gruntDuration);
}
// RAPIER PHYSICS!
import('@dimforge/rapier3d').then(RAPIER => {
    console.log('Rapier ready:', RAPIER.version())
    // ----------------------------------------------------------------
    // MAIN GAME SETUP
    // ----------------------------------------------------------------
    let gravity = { x: 0.0, y: -20, z: 0.0 }
    let world = new RAPIER.World(gravity)
    let prevTime = performance.now()
    const dynamicBodies = []
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
    camera.position.set(80, 5 + 0.8, 80) // Start player far from enemies
    
    // Create audio listener for positional audio - all sounds share this context
    const audioListener = new THREE.AudioListener();
    camera.add(audioListener);
    
    // Initialize our audio system with the shared context
    initAudioSystem(audioListener);
    loadSkeletonFx(audioContext);
    
    const renderer = new THREE.WebGPURenderer({ antialias: false })
    renderer.setSize(window.innerWidth, window.innerHeight)
    // Cap pixel ratio to reduce GPU fill cost (lower gives more stable fps)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.0))
    // renderer.shadowMap.enabled = true
    // VSMShadowMap can be expensive; use PCFSoftShadowMap for better perf/quality balance
    // renderer.shadowMap.type = THREE.PCFSoftShadowMap
    // renderer.outputEncoding = THREE.sRGBEncoding
    // renderer.toneMapping = THREE.NeutralToneMapping
    // renderer.toneMappingExposure = 1.0 // Balanced exposure - dark but fog visible
    renderer.setClearColor(0x000000, 1)
    document.body.appendChild(renderer.domElement)
    
    // postprocessing
    let postProcessing = new THREE.PostProcessing(renderer);
    let dotScreenPass, rgbShiftPass;  

    function createPostProcessingNodes() {
        const scenePass = pass(scene, camera);
        const scenePassColor = scenePass.getTextureNode();

        dotScreenPass = dotScreen(scenePassColor);
        dotScreenPass.scale.value = 1000;  

        rgbShiftPass = rgbShift(scenePass);
        rgbShiftPass.amount.value = 0.0001;

        postProcessing.outputNode = rgbShiftPass;  

        // Flag the system to rebuild WebGPU targets
        postProcessing.needsUpdate = true;
    }

// Call this once on init
createPostProcessingNodes();

window.addEventListener('resize', onWindowResize);

function onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Update camera
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    // Update renderer
    const dpr = Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height);

    // Recreate the node chain to rebuild targets
    createPostProcessingNodes();  // Now updates the outer refs correctly

    // Update effect params directly via stored refs (no chaining needed!)
    dotScreenPass.scale.value = (width + height) * 0.25;

    // Force immediate render to sync and eliminate any flash
    postProcessing.render(scene, camera);
}   
			
    const textureLoader = new THREE.TextureLoader()
    const loader = new GLTFLoader();

    // PAGE PICKUP 
    const page = new Page()
    scene.add(page.group)


    // --- ZOOM EFFECT FOR ENEMY ENCOUNTERS ---
    const defaultFov = 75;
    const zoomFov = 50; // Zoomed in FOV when enemy detected
    let targetFov = defaultFov;
    let currentFov = defaultFov;
    const zoomSpeed = 12; // Faster FOV transition for snappier effect
    let zoomResetTimer = 0; // Auto-reset zoom after duration
    const zoomDuration = 0.7; // Shorter zoom duration for less jank
    let isZooming = false;
    let zoomTargetPosition = null; // Enemy position to look at
    let lookAtProgress = 0; // 0 to 1 for smooth look-at
    let originalCameraRotation = null; // Store original rotation to restore
    let isEncounterFrozen = false; // Freeze player movement during encounter zoom
    
    // Global function to trigger zoom effect with camera look-at
    window.triggerZoomEffect = (zoomIn = true, enemyPosition = null) => {
        if (zoomIn && enemyPosition) {
            targetFov = zoomFov;
            zoomResetTimer = zoomDuration;
            isZooming = true;
            isEncounterFrozen = true; // Freeze player during encounter
            zoomTargetPosition = enemyPosition.clone();
            lookAtProgress = 0;
            // Store current camera rotation (clamp and reset Z to prevent gimbal issues)
            originalCameraRotation = {
                x: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x)),
                y: camera.rotation.y,
                z: camera.rotation.z
            };
            // Reset Z rotation immediately to prevent flipping
            camera.rotation.z = 0;
            // Clear all movement inputs to prevent camera issues
            moveForward = false;
            moveBackward = false;
            moveLeft = false;
            moveRight = false;
            moveJump = false;
            isRunning = false;
            // Immediately zero out velocity to stop momentum
            velocityX.current = 0;
            velocityZ.current = 0;
        } else {
            targetFov = defaultFov;
            isZooming = false;
            isEncounterFrozen = false; // Unfreeze player
            zoomResetTimer = 0;
            zoomTargetPosition = null;
            lookAtProgress = 0;
            originalCameraRotation = null;
        }
    };
    
    let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false, moveJump = false, moveCrouch = false
    let canJump = true
    const forwardVec = new THREE.Vector3()
    const rightVec = new THREE.Vector3()
    const moveDir = new THREE.Vector3()
    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      camera.aspect = (w / h)
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    })
    // const grid = new THREE.GridHelper( 400, 100, 0xffffff, 0xffffff )
    // grid.material.opacity = 0.5
    // grid.material.depthWrite = false
    // grid.material.transparent = true
    // scene.add( grid )
    // AXES HELPER
    // const axesHelper = new THREE.AxesHelper( 5 );
    // scene.add( axesHelper );
    // let mazeData = null;
    
    // VOLUMETRIC FOG - Linear fog for better light interaction
    // Horror atmosphere with visible atmospheric fog
    const fogColor = 0x5d765b; // Neutral dark gray - no color tint
    const fogNear = 0.5; // Fog starts immediately
    const fogFar = 50; // Full fog at shorter distance - much denser
    scene.fog = new THREE.Fog(fogColor, fogNear, fogFar);
    scene.background = new THREE.Color(fogColor); // Match background to fog for seamless blend
    
    // STARS - High altitude particles (fog: false so they stay visible)
    Stars(scene);
    
    // WISPY FOG PARTICLES - Realistic ground fog
    const fogParticles = [];
    
    // Create soft circular fog texture procedurally
    const fogCanvas = document.createElement('canvas');
    fogCanvas.width = 128;
    fogCanvas.height = 128;
    const fogCtx = fogCanvas.getContext('2d');
    const gradient = fogCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(180, 180, 180, 0.4)');
    gradient.addColorStop(0.4, 'rgba(150, 150, 150, 0.2)');
    gradient.addColorStop(0.7, 'rgba(120, 120, 120, 0.05)');
    gradient.addColorStop(1, 'rgba(100, 100, 100, 0)');
    fogCtx.fillStyle = gradient;
    fogCtx.fillRect(0, 0, 128, 128);
    const fogTexture = new THREE.CanvasTexture(fogCanvas);
    
    const fogSpriteMaterial = new THREE.SpriteMaterial({
      map: fogTexture,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      blending: THREE.NormalBlending,
      color: 0x666666
    });
    
    for (let i = 0; i < 15; i++) { // Reduced fog particles for performance
      const fogSprite = new THREE.Sprite(fogSpriteMaterial.clone());
      const scale = 8 + Math.random() * 20;
      fogSprite.scale.set(scale, scale * 0.4, 1); // Wider than tall
      fogSprite.position.set(
        (Math.random() - 0.5) * 120,
        Math.random() * 2 + 0.3, // Low to ground
        (Math.random() - 0.5) * 120
      );
      fogSprite.material.opacity = 0.08 + Math.random() * 0.12;
      fogSprite.material.rotation = Math.random() * Math.PI * 2;
      fogSprite.userData = {
        baseY: fogSprite.position.y,
        speedX: (Math.random() - 0.5) * 0.5,
        speedZ: (Math.random() - 0.5) * 0.5,
        bobSpeed: 0.3 + Math.random() * 0.3,
        bobAmount: 0.1 + Math.random() * 0.2,
        phase: Math.random() * Math.PI * 2
      };
      scene.add(fogSprite);
      fogParticles.push(fogSprite);
    }
    
    // Ambient Light - Dim but enough to see fog and silhouettes
    const ambientLight = new THREE.AmbientLight(0x202020, 150); // Neutral gray, subtle fill
    scene.add(ambientLight);
    // Cuboid Collider
    const cubeMesh = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 10), new THREE.MeshBasicMaterial({color: 0x800080}))
    cubeMesh.castShadow = true
    scene.add(cubeMesh)
    const cubeBody = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(5, 5, 0).setCanSleep(false))
    const cubeShape = RAPIER.ColliderDesc.cuboid(5, 0.5, 5).setMass(1).setRestitution(1.1)
    world.createCollider(cubeShape, cubeBody)
    dynamicBodies.push([cubeMesh, cubeBody])
    // Ball Collider
    // Load the texture first, then the model to ensure the texture is ready

    textureLoader.load('/assets/materials/soccer-ball/soccer_ball_mat_bcolor.png', (soccerball_diffuseMap) => {
      // Texture loaded successfully; now load the GLTF
      loader.load('/assets/models/soccer_ball.gltf', (gltf) => {
        // Apply the texture to the model's material(s)
        gltf.scene.traverse((child) => {
          if (child.isMesh) {
            child.material = new THREE.MeshStandardMaterial({ map: soccerball_diffuseMap,  })   ; // Assign as base color map
            child.material.map.flipY = false;
            child.material.map.needsUpdate = true;
            child.material.needsUpdate = true; 
          }
        });
        const model = gltf.scene;
            model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    child.geometry.computeBoundingSphere();
                    const originalRadius = ballMesh.geometry.boundingSphere.radius;
                }
            });

            // Optional: scale your model
            model.scale.set(0.1, 0.1, 0.1);
            model.position.set(0, 0, 0);

            scene.add(model);

            // STEP 2 — Create Rapier Rigid Body
            const bodyDesc = RAPIER.RigidBodyDesc
                .dynamic()
                .setTranslation(0, 0, 0)
                .setCanSleep(false);

            const body = world.createRigidBody(bodyDesc);

            // STEP 3 — Choose a collider shape
            // Simplest: sphere collider approximating the model
            const collider = RAPIER.ColliderDesc
                .ball(0.6)                // radius
                .setMass(2)
                .setRestitution(1.1);

            world.createCollider(collider, body);

            // STEP 4 — Save for syncing
            dynamicBodies.push([model, body]);

      }, undefined, (error) => {
        console.error('Error loading GLTF:', error);
      });
    });
    // const sphereMesh = new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshStandardMaterial({
    //   map: soccerball_diffuseMap
    // }))
    // sphereMesh.castShadow = true
    // scene.add(sphereMesh)
    // const sphereBody = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(10, 5, 0).setCanSleep(false))
    // const sphereShape = RAPIER.ColliderDesc.ball(1).setMass(1).setRestitution(1.1)
    // world.createCollider(sphereShape, sphereBody)
    // dynamicBodies.push([sphereMesh, sphereBody])
    // Cylinder Collider
    const cylinderMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2, 16), new THREE.MeshBasicMaterial({color: 0x800080}))
    cylinderMesh.castShadow = true
    scene.add(cylinderMesh)
    const cylinderBody = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 5, 5).setCanSleep(false))
    const cylinderShape = RAPIER.ColliderDesc.cylinder(1, 1).setMass(1).setRestitution(1.1)
    world.createCollider(cylinderShape, cylinderBody)
    dynamicBodies.push([cylinderMesh, cylinderBody])
   // COLLISION DEBUG
    const debugBuffers = new RAPIER.DebugRenderBuffers();
    // Material & geometry for wireframe lines
    const debugGeometry = new THREE.BufferGeometry();
    // Create *empty* placeholders so WebGPU sees the attributes at material compile time
    debugGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(0), 3)
    );

    debugGeometry.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(0), 3)
    );

    const debugMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      toneMapped: false,
    });

    const debugLines = new THREE.LineSegments(debugGeometry, debugMaterial);
    scene.add(debugLines);

    function updateDebugRender(world) {
    const debugRender = world.debugRender();
    const { vertices, colors } = debugRender;

    if (!vertices || vertices.length === 0) {
        debugLines.visible = false;
        return;
    }

    debugLines.visible = true;

    const posAttr = debugGeometry.getAttribute("position");
    const colAttr = debugGeometry.getAttribute("color");

    // If buffer size changed → rebuild attribute (safe for WebGPU)
    if (posAttr.array.length !== vertices.length) {
        debugGeometry.setAttribute(
            "position",
            new THREE.BufferAttribute(vertices, 3)
        );
    } else {
        posAttr.array.set(vertices);
        posAttr.needsUpdate = true;
    }

    if (colAttr.array.length !== colors.length) {
        debugGeometry.setAttribute(
            "color",
            new THREE.BufferAttribute(colors, 3)
        );
    } else {
        colAttr.array.set(colors);
        colAttr.needsUpdate = true;
    }

    debugGeometry.setDrawRange(0, vertices.length / 3);
}
    console.log(dynamicBodies)
    // --- PICKUP INTERACTION ---
    // Allow player to pick up dynamic bodies by pointing at them and holding LMB
    let grabbedObject = null; // { mesh, body, origType, offset, distance }
    const pickupReach = 5.0; // maximum distance (meters) at which pickup icon appears and pick succeeds

    function getDynamicBodyForMesh(mesh) {
      // Walk up the parent chain to find a matching dynamic mesh entry
      let node = mesh;
      while (node) {
        for (const [m, b] of dynamicBodies) {
          if (m === node) return [m, b];
        }
        node = node.parent;
      }
      return null;
    }

    function tryPick(event) {
      // Allow pick with left mouse button or primary button; pointer lock not strictly required
      if (event && typeof event.button === 'number' && event.button !== 0) return;

      // Cast a ray forward from the camera center
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const origin = camera.position.clone();
      const ray = new THREE.Raycaster(origin, dir.normalize(), 0, 6); // 6 units reach

      const candidates = dynamicBodies.map(d => d[0]);
      const hits = ray.intersectObjects(candidates, true);
      if (!hits || hits.length === 0) {
        //console.log('tryPick: no hits');
        return;
      }

      const hit = hits[0];
      const found = getDynamicBodyForMesh(hit.object);
      if (!found) {
        //console.log('tryPick: hit but no dynamic body found for', hit.object);
        return;
      }

      const [mesh, body] = found;
      try {
        // Set to kinematic so we can move it directly while held
        body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);

        grabbedObject = {
          mesh,
          body,
          // store offset from hit point to object's origin so it holds naturally
          offset: new THREE.Vector3().subVectors(hit.point, mesh.position),
          distance: hit.distance || 3
        };

        console.log('Picked up object:', mesh.name || mesh.uuid, 'distance', grabbedObject.distance.toFixed(2));
        // Slight visual feedback
        try { mesh.scale.multiplyScalar(1.02); } catch (e) {}
      } catch (e) {
        console.warn('Pickup failed', e);
      }
    }

    function releasePick(applyThrow = true) {
      if (!grabbedObject) return;
      const { mesh, body } = grabbedObject;
      try {
        // restore dynamic body
        body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);

        // apply a small throw velocity in camera forward if requested
        if (applyThrow) {
          const forward = new THREE.Vector3();
          camera.getWorldDirection(forward);
          const speed = 6; // toss speed
          body.setLinvel({ x: forward.x * speed, y: forward.y * speed + 1.5, z: forward.z * speed }, true);
        }
      } catch (e) {
        console.warn('Release failed', e);
      }

      try { mesh.scale.multiplyScalar(1 / 1.02); } catch (e) {}
      grabbedObject = null;
    }

    // PICKUP (ADD TO INVENTORY) WHEN E KEY PRESSED
    // window.addEventListener('keydown', (event) => {
    //   if (event.key === 'e' || event.key === 'E') {
    //     // Cast a ray forward from the camera center
    //     const dir = new THREE.Vector3();
    //     camera.getWorldDirection(dir);
    //     const origin = camera.position.clone();
    //     const ray = new THREE.Raycaster(origin, dir.normalize(), 0, pickupReach); // reach
      

    // Mouse events for picking
    document.addEventListener('mousedown', tryPick);
    document.addEventListener('mouseup', () => releasePick(true));


    // --- GROUND PHYSICS ---
    // 1. Create the fixed body (Use the builder .fixed())
    const groundBodyDesc = RAPIER.RigidBodyDesc.fixed()
        .setTranslation(0, -1, 0);
    const groundBody = world.createRigidBody(groundBodyDesc);
    // 2. Create the collider (Make it THICK so you can't tunnel through it)
    // 250 width, 2 height (4 units thick), 250 depth
    const groundColliderDesc = RAPIER.ColliderDesc.cuboid(500, 2, 500);
    world.createCollider(groundColliderDesc, groundBody);
    
    // --- INVISIBLE BOUNDARY WALLS ---
    // Keep player from falling off the map edge
    // Walls are placed well inside the edge so player can't see over
    const wallHeight = 50;  // Tall enough to prevent jumping over
    const wallThickness = 2;
    const wallDistance = 300;  // Much tighter boundary so player can't see edge
    const mapSize = 500;
    
    // North wall (+Z)
    const northWallBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, wallHeight / 2, wallDistance));
    world.createCollider(RAPIER.ColliderDesc.cuboid(mapSize, wallHeight / 2, wallThickness), northWallBody);
    
    // South wall (-Z)
    const southWallBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, wallHeight / 2, -wallDistance));
    world.createCollider(RAPIER.ColliderDesc.cuboid(mapSize, wallHeight / 2, wallThickness), southWallBody);
    
    // East wall (+X)
    const eastWallBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(wallDistance, wallHeight / 2, 0));
    world.createCollider(RAPIER.ColliderDesc.cuboid(wallThickness, wallHeight / 2, mapSize), eastWallBody);
    
    // West wall (-X)
    const westWallBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(-wallDistance, wallHeight / 2, 0));
    world.createCollider(RAPIER.ColliderDesc.cuboid(wallThickness, wallHeight / 2, mapSize), westWallBody);
    
    console.log('Invisible boundary walls created at ±', wallDistance);
    
    // --- PLAYER HEALTH SYSTEM ---
    let playerHealth = 3; // 3 fireballs = 3 health
    let isGameOver = false; // Flag to prevent escape menu during game over
    let lastDamageTime = 0;
    const damageCooldown = 1.0; // 1 second cooldown between damage
    
    const takeDamage = () => {
      const now = performance.now() / 1000;
      if (now - lastDamageTime < damageCooldown) return false; // Still in cooldown
      
      lastDamageTime = now;
      playerHealth--;
      
      // Play random grunt sound
      playGruntSound();
      
      // Remove a fireball from the healthbar
      const fireballs = document.querySelectorAll('#healthbar #fire');
      if (fireballs.length > 0) {
        // Hide the last visible fireball
        for (let i = fireballs.length - 1; i >= 0; i--) {
          if (fireballs[i].style.visibility !== 'hidden') {
            fireballs[i].style.visibility = 'hidden';
            break;
          }
        }
      }
      
      // Flash screen red for damage feedback
        const vignette = document.getElementById('vignette');
        if (vignette) {
          vignette.style.boxShadow = 'inset 0 0 150px rgba(255, 0, 0, 0.6)';
          setTimeout(() => {
            vignette.style.boxShadow = ''; // Reset to default
          }, 200);
        }

        // Full-screen red flash overlay (created on demand)
        ensureDamageOverlay();
        if (damageOverlay) {
          // quick flash
          damageOverlay.style.opacity = '0.72';
          // fade back out
          setTimeout(() => { damageOverlay.style.opacity = '0'; }, 160);
        }

        // Small screen shake on hit
        try {
          screenShake(220, 6);
        } catch (e) {
          // ignore if any issue with DOM
        }
      
      console.log('Player took damage! Health:', playerHealth);
      
      // Check for death
      if (playerHealth <= 0) {
        console.log('Player died!');
        showGameOver();
      }
      
      return true;
    };
    
    // Game Over screen
    const showGameOver = () => {
      isGameOver = true; // Set flag to prevent escape menu
      
      // Fade out ALL audio smoothly (rain, walking, enemy sounds, everything)
      fadeOutAllAudio(2.0);
      
      // Hide escape menu if visible
      const menu = document.getElementById('escape-container');
      if (menu) menu.style.display = 'none';
      
      // Hide crosshair
      const crosshair = document.getElementById('crosshair');
      if (crosshair) crosshair.style.display = 'none';
      
      // Unlock pointer immediately
      document.exitPointerLock();
      
      // Create game over overlay
      const gameOverDiv = document.createElement('div');
      gameOverDiv.id = 'game-over';
      gameOverDiv.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.95);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 999999;
        font-family: 'Raven Scream', serif;
      `;
      
      // Create elements with inline styles (no animations to avoid glitches)
      const title = document.createElement('h1');
      title.style.cssText = `
        color: #8B0000;
        font-size: 6rem;
        text-shadow: 0 0 20px #ff0000, 0 0 40px #8B0000;
        margin: 0 0 2rem 0;
        font-family: 'Raven Scream', serif;
      `;
      title.textContent = 'YOU DIED';

      const subtitle = document.createElement('p');
      subtitle.style.cssText = `
        color: #666;
        font-size: 1.5rem;
        margin: 0;
        font-family: 'Raven Scream', serif;
      `;
      subtitle.textContent = 'The darkness consumed you...';

      // Return to Menu button
      const button = document.createElement('button');
      button.style.cssText = `
        margin-top: 3rem;
        padding: 1rem 3rem;
        font-size: 1.5rem;
        font-family: 'Raven Scream', serif;
        background: transparent;
        border: 2px solid #8B0000;
        color: #8B0000;
        cursor: pointer;
        transition: all 0.3s ease;
      `;
      button.textContent = 'RETURN TO MENU';
      button.onmouseenter = () => {
        button.style.background = '#8B0000';
        button.style.color = '#fff';
        button.style.boxShadow = '0 0 20px rgba(139, 0, 0, 0.5)';
      };
      button.onmouseleave = () => {
        button.style.background = 'transparent';
        button.style.color = '#8B0000';
        button.style.boxShadow = 'none';
      };
      button.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.location.href = '/index.html';
      };

      // Restart button
      const restartButton = document.createElement('button');
      restartButton.style.cssText = `
        margin-top: 1.5rem;
        padding: 1rem 3rem;
        font-size: 1.5rem;
        font-family: 'Raven Scream', serif;
        background: transparent;
        border: 2px solid #8B0000;
        color: #8B0000;
        cursor: pointer;
        transition: all 0.3s ease;
      `;
      restartButton.textContent = 'RESTART';
      restartButton.onmouseenter = () => {
        restartButton.style.background = '#8B0000';
        restartButton.style.color = '#fff';
        restartButton.style.boxShadow = '0 0 20px rgba(139, 0, 0, 0.5)';
      };
      restartButton.onmouseleave = () => {
        restartButton.style.background = 'transparent';
        restartButton.style.color = '#8B0000';
        restartButton.style.boxShadow = 'none';
      };
      restartButton.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.location.reload();
      };

      gameOverDiv.appendChild(title);
      gameOverDiv.appendChild(subtitle);
      gameOverDiv.appendChild(button);
      gameOverDiv.appendChild(restartButton);
      document.body.appendChild(gameOverDiv);
    };
    
    // WATER SPLASH - will be initialized after ground loads
    let waterSplash = null;
    let floorMesh = null;
    
    // GROUND_PLANE with PBR textures 
    
    
    // Create bump texture by converting diffuse to grayscale.
    // Use a larger working size to avoid blocky artifacts when the map is repeated.
    const createBumpTexture = (diffuseTexture) => {
      const srcW = diffuseTexture.image?.width || 2048;
      const srcH = diffuseTexture.image?.height || 2048;
      // Target bump size: clamp to a reasonable max to keep GPU cost moderate
      const size = Math.min(2048, Math.max(512, Math.min(srcW, srcH)));

      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');

      // Draw diffuse texture to a temporary canvas at original resolution then resample
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = srcW;
      tempCanvas.height = srcH;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.drawImage(diffuseTexture.image, 0, 0, srcW, srcH);

      // Scale to bump size and convert to grayscale
      ctx.drawImage(tempCanvas, 0, 0, size, size);
      const imageData = ctx.getImageData(0, 0, size, size);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const gray = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
        data[i] = gray;
        data[i + 1] = gray;
        data[i + 2] = gray;
      }

      ctx.putImageData(imageData, 0, 0);

      const bumpTex = new THREE.CanvasTexture(canvas);
      bumpTex.wrapS = THREE.RepeatWrapping;
      bumpTex.wrapT = THREE.RepeatWrapping;
      // Match the diffuse repeat so tiling stays consistent
      try {
        bumpTex.repeat.copy(diffuseTexture.repeat || new THREE.Vector2(8, 8));
      } catch (e) {
        bumpTex.repeat.set(8, 8);
      }
      // Let the renderer generate mipmaps for smoother LOD transitions
      bumpTex.generateMipmaps = true;
      bumpTex.minFilter = THREE.LinearMipmapLinearFilter;
      bumpTex.magFilter = THREE.LinearFilter;
      return bumpTex;
    };
    
    textureLoader.load('/assets/materials/groundPBR/rocky_terrain_02_diff_4k.jpg', (texture) => {
      // Ensure proper wrapping and color space
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(8, 8);
      texture.encoding = THREE.sRGBEncoding;
      // Encourage trilinear filtering and mipmaps for less blocky look when viewed at glancing angles
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      try {
        // Try to set max anisotropy if available (improves sharpness at oblique angles)
        if (renderer.capabilities && typeof renderer.capabilities.getMaxAnisotropy === 'function') {
          texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        } else if (renderer.capabilities && renderer.capabilities.getMaxAnisotropy) {
          texture.anisotropy = renderer.capabilities.getMaxAnisotropy;
        }
      } catch (e) {}

      const bumpMap = createBumpTexture(texture);

      const floor_material = new THREE.MeshStandardMaterial({
        map: texture,
        bumpMap: bumpMap,
        bumpScale: 25.0,
        roughness: 0.8,
        metalness: 0.0,
        side: THREE.DoubleSide
      });
      
      floorMesh = new THREE.Mesh(new THREE.BoxGeometry(1000, 4, 1000, 64, 1, 64), floor_material);
      floorMesh.position.y = -1;
      scene.add(floorMesh);

      console.log('Ground mesh created with diffuse texture and procedural bump map');
      
      // WATER SPLASH EFFECT
      waterSplash = new WaterSplash(scene, floorMesh);
      waterSplash.init();
      
      // TREES
      Trees(floorMesh, scene, world, RAPIER);
      
      // MAZE - Small 8x8 procedural maze with basic material
    //   mazeData = Maze(scene, world, RAPIER, {
    //     gridSize: 8,       // 8x8 grid
    //     cellSize: 6,       // 6 units per cell
    //     wallHeight: 8,     // 8 units tall (can't jump over)
    //     offsetX: 30,       // Offset from spawn
    //     offsetZ: 30
    //   });
    // }, undefined, (err) => {
    //   console.error('Failed to load ground texture:', err);
    // });
    // Optional: Add some walls for testing
    // const wallGeometry = new THREE.BoxGeometry(1, 20, 100);
    // const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc,
    //     roughness: 0.5,
    //     metalness: 1.0});
    // const wall = new THREE.Mesh(wallGeometry, wallMaterial);
    // wall.position.set(10, 2.5, 0);
    // scene.add(wall);
    // const wallColliderDesc = RAPIER.ColliderDesc.cuboid(0.5, 10, 50).setTranslation(10, 2.5, 0);
    // world.createCollider(wallColliderDesc);
    // BUSHES
    Bushes()
    // CAMERA RAYCAST
    const raycaster = new THREE.Raycaster()
  
  // CHARACTER CONTROLS
    const controls = new PointerLockControls( camera, renderer.domElement)
    controls.pointerSpeed = 0.5;
    controls.minPolarAngle = 0; // Allow looking straight up
    controls.maxPolarAngle = Math.PI; // Allow looking straight down
    
    // Block mouse look during encounter freeze by capturing mousemove events
    document.addEventListener('mousemove', (event) => {
        if (isEncounterFrozen) {
            event.stopImmediatePropagation();
        }
    }, true); // Use capture phase to intercept before PointerLockControls
    
    const menu = document.getElementById('escape-container')
    const crosshair = document.getElementById('crosshair')
    
    // Movement state icons
    const walkingIcon = document.getElementById('walking-icon');
    const runningIcon = document.getElementById('running-icon');
    const crouchIcon = document.getElementById('crouch-icon');
    
    // Track if menu sound should play (prevent spam on rapid lock/unlock)
    let lastMenuSoundTime = 0;
    const menuSoundCooldown = 200; // ms
    
    // Check if this is a touch device
    const isTouchDeviceCheck = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    
    // Auto-lock pointer on first click (browser requires user interaction)
    // Once locked, Escape will unlock it (standard browser behavior)
    // Skip pointer lock on mobile - use touch controls instead
    const lockPointer = (e) => {
      // Skip pointer lock on touch devices
      if (isTouchDeviceCheck) {
        // Just resume audio on mobile
        if (audioListener.context.state === 'suspended') {
          audioListener.context.resume();
        }
        if (audioContext && audioContext.state === 'suspended') {
          audioContext.resume();
        }
        // Hide menu on tap (mobile)
        if (!e.target.closest('#escape-container') && !e.target.closest('#mobile-controls') && !e.target.closest('#action-buttons')) {
          menu.style.display = 'none';
          crosshair.style.display = 'block';
        }
        return;
      }
      
      // Only lock if clicking on canvas/game area, not UI elements
      if (e.target.tagName === 'BUTTON' || e.target.closest('#escape-container')) {
        return; // Don't lock when clicking menu buttons
      }
      
      // Only try to lock if not already locked
      if (!controls.isLocked) {
        controls.lock();
      }
      
      // Resume audio contexts on user interaction (browsers require this)
      if (audioListener.context.state === 'suspended') {
        audioListener.context.resume();
      }
      if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
      }
    };
    
    // Lock on any click in the document
    document.addEventListener('click', lockPointer);
    
    // On mobile, start with controls active (no pointer lock)
    if (isTouchDeviceCheck) {
      menu.style.display = 'none';
      crosshair.style.display = 'block';
    }
    
    controls.addEventListener('lock', () => {
      console.log("CONTROLS LOCKED")
      crosshair.style.display = 'block'
      menu.style.display = 'none'
      // Play menu close sound with cooldown
      const now = Date.now();
      if (now - lastMenuSoundTime > menuSoundCooldown) {
        playMenuSound(-400); // -400 cents = lower pitch
        lastMenuSoundTime = now;
      }
    })
    controls.addEventListener( 'unlock', () => {
      console.log("CONTROLS UNLOCKED")
      // Don't show escape menu if game over
      if (isGameOver) return;
      
      // Don't show menu on mobile unlock (touch devices don't use pointer lock)
      if (isTouchDeviceCheck) return;
      
      menu.style.display = 'block'
      crosshair.style.display = 'none'
      // Stop walking sound when menu opens
      stopWalkingSound();
      // Play menu open sound with cooldown
      const now = Date.now();
      if (now - lastMenuSoundTime > menuSoundCooldown) {
        playMenuSound(300); // +300 cents = higher pitch
        lastMenuSoundTime = now;
      }
    });
    
    // Stop walking sound when window loses focus (alt+tab)
    window.addEventListener('blur', () => {
      stopWalkingSound();
    });
    
    // Also stop when document visibility changes (tab switch)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopWalkingSound();
      }
    });
    
    scene.add(controls.object)
    
    let flashlightOn = true; // Flashlight toggle state
    let flashlightJustToggled = false; // Track when flashlight is toggled for AI hearing
    let flashlightIntensity = 600.0; // Store original intensity
    
    const onKeyDown = (e) => {
    // Block movement input during encounter freeze
    if (isEncounterFrozen && ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight'].includes(e.code)) {
      return;
    }
    switch (e.code) {
      case 'KeyW': moveForward = true; break;
      case 'KeyS': moveBackward = true; break;
      case 'KeyA': moveLeft = true; break;
      case 'KeyD': moveRight = true; break;
      case 'Space': moveJump = true; break;
      // case 'KeyE':
      //   // Toggle door
      //   if (!e.repeat && mazeData && mazeData.doors) {
      //     toggleNearestDoor(mazeData.doors);
      //   }
      //   break;
      case 'KeyC':
        // Toggle crouch
        if (!e.repeat) {
          moveCrouch = !moveCrouch;
        }
        break;
      case 'KeyF':
        // Toggle flashlight
        if (!e.repeat) {
          flashlightOn = !flashlightOn;
          flashlightJustToggled = true; // AI can hear the click
          spotLight.intensity = flashlightOn ? flashlightIntensity : 0;
          playButtonPress(flashlightOn ? 0 : -300); // -300 cents = 3 semitones lower
        }
        break;
      case 'ShiftLeft': case 'ShiftRight':
        isRunning = true;
        break;
    }
    };
    const onKeyUp = (e) => {
      switch (e.code) {
        case 'KeyW': moveForward = false; break;
        case 'KeyS': moveBackward = false; break;
        case 'KeyA': moveLeft = false; break;
        case 'KeyD': moveRight = false; break;
        case 'Space': moveJump = false; break;
        case 'ShiftLeft': case 'ShiftRight': isRunning = false; break;
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    
    // ========== MOBILE TOUCH CONTROLS ==========
    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    
    // Mobile control state
    const mobileInput = {
        moveX: 0,       // -1 to 1 (left/right)
        moveY: 0,       // -1 to 1 (forward/back)
        lookX: 0,       // Camera rotation delta
        lookY: 0,       // Camera pitch delta
        isActive: false
    };
    
    if (isTouchDevice) {
        console.log('Touch device detected - enabling mobile controls');
        
        // Get control elements
        const joystickZone = document.getElementById('joystick-zone');
        const joystickBase = document.getElementById('joystick-base');
        const joystickThumb = document.getElementById('joystick-thumb');
        const lookZone = document.getElementById('look-zone');
        const btnJump = document.getElementById('btn-jump');
        const btnSprint = document.getElementById('btn-sprint');
        const btnCrouch = document.getElementById('btn-crouch');
        const btnFlashlight = document.getElementById('btn-flashlight');
        
        // Joystick state
        let joystickActive = false;
        let joystickTouchId = null;
        const joystickCenter = { x: 0, y: 0 };
        const joystickMaxRadius = 35; // Max distance thumb can move from center
        
        // Look state
        let lookTouchId = null;
        let lastLookPos = { x: 0, y: 0 };
        const lookSensitivity = 0.003;
        
        // Initialize joystick center position
        const updateJoystickCenter = () => {
            const rect = joystickBase.getBoundingClientRect();
            joystickCenter.x = rect.left + rect.width / 2;
            joystickCenter.y = rect.top + rect.height / 2;
        };
        
        // Joystick touch handlers
        joystickZone.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (joystickTouchId === null) {
                const touch = e.changedTouches[0];
                joystickTouchId = touch.identifier;
                joystickActive = true;
                mobileInput.isActive = true;
                updateJoystickCenter();
            }
        }, { passive: false });
        
        joystickZone.addEventListener('touchmove', (e) => {
            e.preventDefault();
            // Block movement during encounter freeze
            if (isEncounterFrozen) return;
            for (let touch of e.changedTouches) {
                if (touch.identifier === joystickTouchId) {
                    // Calculate offset from center
                    let dx = touch.clientX - joystickCenter.x;
                    let dy = touch.clientY - joystickCenter.y;
                    
                    // Clamp to max radius
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist > joystickMaxRadius) {
                        dx = (dx / dist) * joystickMaxRadius;
                        dy = (dy / dist) * joystickMaxRadius;
                    }
                    
                    // Update thumb position
                    joystickThumb.style.transform = `translate(${dx}px, ${dy}px)`;
                    
                    // Normalize to -1 to 1
                    mobileInput.moveX = dx / joystickMaxRadius;
                    mobileInput.moveY = -dy / joystickMaxRadius; // Invert Y (up = forward)
                }
            }
        }, { passive: false });
        
        const resetJoystick = () => {
            joystickTouchId = null;
            joystickActive = false;
            joystickThumb.style.transform = 'translate(0, 0)';
            mobileInput.moveX = 0;
            mobileInput.moveY = 0;
        };
        
        joystickZone.addEventListener('touchend', (e) => {
            for (let touch of e.changedTouches) {
                if (touch.identifier === joystickTouchId) {
                    resetJoystick();
                }
            }
        });
        
        joystickZone.addEventListener('touchcancel', resetJoystick);
        
        // Look zone touch handlers (camera rotation)
        lookZone.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (lookTouchId === null) {
                const touch = e.changedTouches[0];
                lookTouchId = touch.identifier;
                lastLookPos.x = touch.clientX;
                lastLookPos.y = touch.clientY;
                mobileInput.isActive = true;
                
                // Resume audio on touch
                if (audioListener.context.state === 'suspended') {
                    audioListener.context.resume();
                }
                if (audioContext && audioContext.state === 'suspended') {
                    audioContext.resume();
                }
            }
        }, { passive: false });
        
        lookZone.addEventListener('touchmove', (e) => {
            e.preventDefault();
            // Block camera rotation during encounter freeze
            if (isEncounterFrozen) return;
            for (let touch of e.changedTouches) {
                if (touch.identifier === lookTouchId) {
                    const dx = touch.clientX - lastLookPos.x;
                    const dy = touch.clientY - lastLookPos.y;
                    
                    // Rotate camera
                    camera.rotation.y -= dx * lookSensitivity;
                    camera.rotation.x -= dy * lookSensitivity;
                    
                    // Clamp vertical rotation
                    camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x));
                    
                    lastLookPos.x = touch.clientX;
                    lastLookPos.y = touch.clientY;
                }
            }
        }, { passive: false });
        
        const resetLook = (e) => {
            for (let touch of e.changedTouches) {
                if (touch.identifier === lookTouchId) {
                    lookTouchId = null;
                }
            }
        };
        
        lookZone.addEventListener('touchend', resetLook);
        lookZone.addEventListener('touchcancel', resetLook);
        
        // Action button handlers
        btnJump.addEventListener('touchstart', (e) => {
            e.preventDefault();
            moveJump = true;
            btnJump.classList.add('active');
        }, { passive: false });
        
        btnJump.addEventListener('touchend', (e) => {
            e.preventDefault();
            moveJump = false;
            btnJump.classList.remove('active');
        });
        
        // Sprint toggle
        btnSprint.addEventListener('touchstart', (e) => {
            e.preventDefault();
            isRunning = !isRunning;
            btnSprint.classList.toggle('active', isRunning);
        }, { passive: false });
        
        // Crouch toggle
        btnCrouch.addEventListener('touchstart', (e) => {
            e.preventDefault();
            moveCrouch = !moveCrouch;
            btnCrouch.classList.toggle('active', moveCrouch);
        }, { passive: false });
        
        // Flashlight toggle
        btnFlashlight.addEventListener('touchstart', (e) => {
            e.preventDefault();
            flashlightOn = !flashlightOn;
            flashlightJustToggled = true;
            spotLight.intensity = flashlightOn ? flashlightIntensity : 0;
            
            btnFlashlight.classList.toggle('active', flashlightOn);
            playButtonPress(flashlightOn ? 0 : -300);
        }, { passive: false });
        
        // Initialize flashlight button state
        btnFlashlight.classList.add('active');
        
        // Menu button handler
        const btnMenu = document.getElementById('btn-menu');
        btnMenu.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (menu.style.display === 'none' || menu.style.display === '') {
                menu.style.display = 'block';
                crosshair.style.display = 'none';
                stopWalkingSound();
                playMenuSound(300);
            } else {
                menu.style.display = 'none';
                crosshair.style.display = 'block';
                playMenuSound(-400);
            }
        }, { passive: false });
        
        // Prevent context menu on long press
        document.addEventListener('contextmenu', (e) => e.preventDefault());
        
        // Hide escape menu on mobile - use back button or provide close button
        menu.innerHTML = `
            <button class="menu-button" id="mobile-resume">RESUME</button>
            <a href="../../../index.html"><button class="menu-button">EXIT GAME</button></a>
            <button class="menu-button">SOUND OFF</button>
        `;
        
        document.getElementById('mobile-resume').addEventListener('click', () => {
            menu.style.display = 'none';
            crosshair.style.display = 'block';
        });
    }
    
    // ========== END MOBILE CONTROLS ==========
    
    // ---------------- SHADER TEST ------------------------------------- //
    // const material1 = new THREE.MeshBasicNodeMaterial()
    // const circle1 = Fn(() => {
    //   let c = vec3().toVar()
    //   let uv = positionLocal.xy.mul(5)
    //   let d = length(uv)
    //   for (let i = 0; i < 3; i++) {
    //     uv = uv.add(uv.div(d).mul(time.mul(0.1 + i * 0.05)))
    //     c[i] = float(0.01).div(length(fract(uv).sub(0.5)))
    //   }
    //   return vec4(c.div(d), 1)
    // })
    // material1.colorNode = circle1()
    // const mesh1 = new THREE.Mesh(new THREE.PlaneGeometry(10,10), material1)
    // mesh1.position.z = -50
    // mesh1.position.y = 5
    // scene.add(mesh1)
    // ----------------------------------------------------------------- //
    // PROPS
    /*FLASHLIGHT - Primary light source in darkness*/
    
    // SpotLight params: color, intensity, distance, angle, penumbra, decay
    // Realistic flashlight: warm white, moderate intensity, natural falloff
    const spotLight = new THREE.SpotLight( 
        0xfff5e6,   // Slightly warmer color (incandescent tint)
        600.0,      // Reduced intensity for realism
        100,         // Shorter distance - light falls off naturally
        0.5,       // Narrower beam angle (~20 degrees)
        0.7,        // Softer penumbra edge (0-1, higher = softer)
        1.5         // Physical light decay (inverse square)
    );
    spotLight.position.set( 0, 0, 0 );
    spotLight.target = new THREE.Object3D( 0, 0, 0 );
    // const spotLightHelper = new THREE.SpotLightHelper( spotLight );
    // scene.add( spotLightHelper );
   
    spotLight.castShadow = false;
   
    // Lower shadow map resolution to reduce shadow rendering cost
    spotLight.shadow.mapSize.width = 256;
    spotLight.shadow.mapSize.height = 256;    
    spotLight.shadow.camera.near = 0.5;
    spotLight.shadow.camera.far = 80;  // Match light distance
    spotLight.shadow.camera.fov = 35;  // Match beam angle
    spotLight.shadow.bias = -0.0005;   // Reduce shadow acne
    spotLight.shadow.normalBias = 0.02; // Reduce peter-panning
spotLight.shadow.mapSize.set(1024, 1024);        // was 2048 → halve it
spotLight.shadow.radius = 4;                     // soften slightly
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // CHUNK GRASS?
    const grass = new Grass(scene, renderer, camera)
    
    // MOON
    const moon = Moon(scene, camera);
    
    // RAIN SYSTEM
    const rain = new Rain(scene, camera, 500)
    rain.init()
    rain.setIntensity(3) // 0 = off, 1 = light, 2 = medium, 3 = heavy
    
    // Create circular end cap with flashlight texture projection
  
    loader.load('/assets/models/flashlight.glb', (gltf) => {
      flashlight = gltf.scene.children[0]
      console.log(flashlight)
      flashlight.position.z = -1.3
      flashlight.position.y = -1
      flashlight.position.x = 1
      flashlight.rotation.x = -14.3
      camera.add(flashlight)
      
      // Position spotlight at the front of the flashlight mesh
      spotLight.position.set(1, -0.8, -1.5);
      spotLight.target.position.set(1, -0.8, -10);
      camera.add(spotLight)
      camera.add(spotLight.target)
    
    })
     
    const clock = new THREE.Clock()
    // STATS
    let stats = new Stats();
    stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
    document.body.appendChild(stats.dom);
    // Character setup
    const characterHeight = 8;
    const characterRadius = 0.5;
    const characterBody = world.createRigidBody(
      new RAPIER.RigidBodyDesc(RAPIER.RigidBodyType.kinematicPositionBased)
      .setTranslation(80, 5, 80) // Start player far from enemies
      .setCanSleep(false)
      .setCcdEnabled(true)
    )
    characterBody.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    const characterCollider = world.createCollider(
      RAPIER.ColliderDesc.capsule((characterHeight / 2) - characterRadius, characterRadius),
      characterBody
    )
    const characterController = world.createCharacterController(0.1);
    // Configure Controller behaviors
    characterController.enableAutostep(0.7, 0.5, true); // Auto-climb stairs/small obstacles
    characterController.enableSnapToGround(0.5); // Glue to ground when walking down slopes
    characterController.setCharacterMass(80); // Virtual mass for pushing objects
    characterController.setApplyImpulsesToDynamicBodies(true); // Allow pushing crates/balls
    characterController.setSlideEnabled(true); // Enable sliding along walls
    // Visible character mesh (e.g., a capsule for debugging)
    const characterMesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(characterRadius, characterHeight - 2 * characterRadius, 4, 8),
      // new THREE.MeshBasicMaterial({ color: 'blue', wireframe: true })
    );
    scene.add(characterMesh);
  // --- CHARACTER MOVEMENT CONSTANTS ---
  const moveSpeed = 8;
  const runSpeed = 15; // Speed when running
  const crouchSpeed = 4; // Slower when crouching
  const jumpForce = 12;
  let verticalVelocity = 0;
  const MAX_DELTA = 0.05;
  const terminalVelocity = -50; // Prevent infinite fall acceleration
  
  // --- RUNNING (Double-tap W) ---
  let isRunning = false;
  let lastWKeyTime = 0;
  const doubleTapWindow = 0.3; // Time window for double-tap in seconds
  
  // --- INERTIA/MOMENTUM SETTINGS ---
  const velocityX = { current: 0 };
  const velocityZ = { current: 0 };
  const acceleration = 18; // Base responsiveness
  const runAcceleration = 26; // Sprint should ramp faster, not slower
  const deceleration = 12; // Pull back to zero quicker
  const runDeceleration = 16; // Harder braking after sprinting
  const airControl = 0.25; // Slightly more authority mid-air

  const smoothResponse = (current, target, responseRate, dt) => {
      const rate = Math.max(responseRate, 0);
      if (!dt || rate === 0) return current;
      const factor = 1 - Math.exp(-rate * dt);
      return current + (target - current) * factor;
  };
  
  // --- CROUCH SETTINGS ---
  const standingHeight = 2;
  const crouchingHeight = 0.8;
  const standingEyeOffset = 0.8;
  const crouchingEyeOffset = 0.01;
  let currentHeight = standingHeight;
  let currentEyeOffset = standingEyeOffset;
  let isCrouching = false;
  const crouchTransitionSpeed = 8; // How fast to transition crouch
  
  // --- HEAD BOB SETTINGS ---
  let headBobPhase = 0; // Accumulator for bob animation
  let bobIntensity = 0; // Smooth intensity multiplier (0-1)
  const headBobSpeed = 4.5; // Frequency of bob (higher = faster oscillation)
  const headBobAmount = 0.15; // Amplitude of bob (how high/low)
  const verticalBobAmount = 0.08; // Up/down bob amplitude
  const crouchHeadBobAmount = 0.08; // Reduced bob when crouching
  const runHeadBobAmount = 0.25; // More aggressive bob when running
  const runVerticalBobAmount = 0.15; // More aggressive vertical bob when running
  
  // --- BREATHING FOG EFFECT (Local to Camera) ---
  // Removed
  
  // --- ENEMY AI ---
  // Clean up any existing enemies from previous HMR cycle
  if (window.__enemies) {
    window.__enemies.forEach(e => e.destroy());
    window.__enemies = null;
  }
  
  // Create single enemy
  const enemySpawns = [
    new THREE.Vector3(-60, 5, -60),   // Southwest
  ];
  
  const enemies = enemySpawns.map(spawnPos => 
    new EnemyAI(scene, world, camera, characterBody, RAPIER, audioListener, spawnPos)
  );
  
  // Wait for all enemies to be ready (models loaded)
  const enemiesReadyPromise = Promise.all(enemies.map(e => e.ready));
  
  // Store reference for HMR cleanup
  window.__enemies = enemies;
  window.__threeScene = scene;
  
  // --- DOOR TOGGLE FUNCTION ---
  // const toggleNearestDoor = (doors) => {
  //   const playerPos = characterBody.translation();
  //   let nearestDoor = null;
  //   let minDistance = 5; // Max distance to toggle door
  //   for (const door of doors) {
  //     const doorPos = door.body.translation();
  //     const distance = Math.sqrt((doorPos.x - playerPos.x) ** 2 + (doorPos.z - playerPos.z) ** 2);
  //     if (distance < minDistance) {
  //       minDistance = distance;
  //       nearestDoor = door;
  //     }
  //   }
  //   if (nearestDoor) {
  //     nearestDoor.open = !nearestDoor.open;
  //     if (nearestDoor.open) {
  //       // Open: rotate 90 degrees around hinge
  //       const angle = Math.PI / 2;
  //       // Hinge at left edge of door
  //       const perpendicular = new THREE.Vector3(Math.cos(nearestDoor.rotationY), 0, -Math.sin(nearestDoor.rotationY));
  //       const hinge = new THREE.Vector3().copy(nearestDoor.originalPosition).add(perpendicular.clone().multiplyScalar(-2.4));
  //       // Relative position
  //       const relX = nearestDoor.originalPosition.x - hinge.x;
  //       const relZ = nearestDoor.originalPosition.z - hinge.z;
  //       // Rotate around Y
  //       const newRelX = relX * Math.cos(angle) - relZ * Math.sin(angle);
  //       const newRelZ = relX * Math.sin(angle) + relZ * Math.cos(angle);
  //       const newX = hinge.x + newRelX;
  //       const newZ = hinge.z + newRelZ;
  //       nearestDoor.body.setNextKinematicTranslation({ x: newX, y: nearestDoor.originalPosition.y, z: newZ });
  //       nearestDoor.mesh.position.set(newX, nearestDoor.originalPosition.y, newZ);
  //       nearestDoor.mesh.rotation.y = nearestDoor.rotationY + angle;
  //       const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, nearestDoor.rotationY + angle, 0));
  //       nearestDoor.body.setNextKinematicRotation(quat);
  //     } else {
  //       // Close: back to original
  //       nearestDoor.body.setNextKinematicTranslation(nearestDoor.originalPosition);
  //       nearestDoor.mesh.position.copy(nearestDoor.originalPosition);
  //       nearestDoor.mesh.rotation.y = nearestDoor.rotationY;
  //       const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, nearestDoor.rotationY, 0));
  //       nearestDoor.body.setNextKinematicRotation(quat);
  //     }
  //   }
  // };
  
  // ** 1. AUDIO MANAGEMENT FUNCTION (Safe from input crashes) **
  const audioManager = (isMoving) => {
      // Only manage audio if controls are locked
      if (controls.isLocked) {
          if (isMoving) {
              playWalkingSound();
              // Adjust walking sound speed based on running
              if (walkingSource) {
                  walkingSource.playbackRate.value = isRunning ? 1.5 : 1.0;
              }
          } else {
              stopWalkingSound();
          }
      }
  };
  
  // Track if loading screen has been hidden
  let loadingScreenHidden = false;
  let enemiesReady = false;
  
  // Wait for enemies to be ready
  enemiesReadyPromise.then(() => {
      enemiesReady = true;
      console.log('All enemies loaded and ready!');
  });
  
  renderer.setAnimationLoop((animate) => {
      stats.begin();
      
      // Hide loading screen only after enemies are ready
      if (!loadingScreenHidden && enemiesReady) {
          const loadingScreen = document.getElementById('game-loading-screen');
          if (loadingScreen) {
              loadingScreen.classList.add('fade-out');
              setTimeout(() => {
                  loadingScreen.style.display = 'none';
              }, 500);
          }
          loadingScreenHidden = true;
      }
     
      let delta = clock.getDelta();
      if (delta > MAX_DELTA) delta = MAX_DELTA;
      world.timestep = Math.min(delta, 0.1);
      
      // --- ZOOM EFFECT UPDATE ---
      // Auto-reset zoom after duration
      if (isZooming && zoomResetTimer > 0) {
          zoomResetTimer -= delta;
          if (zoomResetTimer <= 0) {
              targetFov = defaultFov;
              isZooming = false;
              isEncounterFrozen = false; // Unfreeze player when zoom ends
              zoomTargetPosition = null;
              lookAtProgress = 0;
              originalCameraRotation = null;
          }
      }
      
        // Smooth FOV transition (fixed lerp rate for stability)
        if (Math.abs(currentFov - targetFov) > 0.1) {
          currentFov = THREE.MathUtils.lerp(currentFov, targetFov, Math.min(1, zoomSpeed * delta));
          camera.fov = currentFov;
          camera.updateProjectionMatrix();
        }
      
        // Camera look-at enemy during zoom effect
        if (isZooming && zoomTargetPosition && lookAtProgress < 1) {
          lookAtProgress = Math.min(1, lookAtProgress + delta * 4.5); // Faster look-at
          // Calculate the direction vector from camera to enemy
          _camPos.copy(camera.position);
          _toEnemy.copy(zoomTargetPosition).sub(_camPos);
          // Calculate the target quaternion to look at the enemy
          const targetQuat = new THREE.Quaternion();
          const up = new THREE.Vector3(0, 1, 0);
          // Use lookAt to get the target rotation (no roll)
          const lookAtMatrix = new THREE.Matrix4();
          lookAtMatrix.lookAt(_camPos, zoomTargetPosition, up);
          targetQuat.setFromRotationMatrix(lookAtMatrix);
          // Interpolate from the original rotation to the target lookAt rotation
          if (originalCameraRotation) {
            // Build a quaternion from the original rotation (preserve roll=0)
            const startQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(
              originalCameraRotation.x,
              originalCameraRotation.y,
              0 // always zero roll
            ));
            // Slerp between start and target
            const t = lookAtProgress * lookAtProgress * (3 - 2 * lookAtProgress); // Smoothstep
            camera.quaternion.copy(startQuat).slerp(targetQuat, t);
            // Force roll to zero after slerp
            const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
            euler.z = 0;
            camera.quaternion.setFromEuler(euler);
          }
        }
      
      // --- CROUCH HANDLING ---
      const targetHeight = moveCrouch ? crouchingHeight : standingHeight;
      const targetEyeOffset = moveCrouch ? crouchingEyeOffset : standingEyeOffset;
      
      // Smooth transition for height and eye offset
      currentHeight += (targetHeight - currentHeight) * crouchTransitionSpeed * delta;
      currentEyeOffset += (targetEyeOffset - currentEyeOffset) * crouchTransitionSpeed * delta;
      isCrouching = moveCrouch;
      
      // Current movement speed (faster when running, slower when crouching)
      const currentMoveSpeed = isCrouching ? crouchSpeed : (isRunning ? runSpeed : moveSpeed);
      
      // 1. Ground and Gravity Check
      const isGrounded = characterController.computedGrounded();
      if (isGrounded) {
          verticalVelocity = 0; // Small constant force to ensure ground stickiness
         
          if (moveJump && !isCrouching) { // Can't jump while crouching
              verticalVelocity = jumpForce;
              characterController.disableSnapToGround();
          } else {
              characterController.enableSnapToGround(0.5);
          }
      } else {
          verticalVelocity -= 30 * delta; // Apply gravity
          verticalVelocity = Math.max(verticalVelocity, terminalVelocity); // Cap fall speed
      }
     
      // 2. Calculate Direction from Input
      // Get camera forward direction (ignoring vertical component)
      camera.getWorldDirection(forwardVec);
      forwardVec.y = 0;
      forwardVec.normalize();
      
      // Calculate right vector from forward vector
      rightVec.crossVectors(forwardVec, _tempUp).normalize();
      
      moveDir.set(0, 0, 0);
      
      // Keyboard input
      if (moveForward) moveDir.add(forwardVec);
      if (moveBackward) moveDir.sub(forwardVec);
      if (moveLeft) moveDir.sub(rightVec);
      if (moveRight) moveDir.add(rightVec);
      
      // Mobile joystick input (blends with keyboard)
      if (mobileInput.isActive && (Math.abs(mobileInput.moveX) > 0.1 || Math.abs(mobileInput.moveY) > 0.1)) {
          _mobileTemp.copy(forwardVec).multiplyScalar(mobileInput.moveY);
          moveDir.add(_mobileTemp);
          _mobileTemp.copy(rightVec).multiplyScalar(mobileInput.moveX);
          moveDir.add(_mobileTemp);
      }
      
      const hasHorizontalInput = moveDir.lengthSq() > 0.001;
      
      // --- INERTIA SYSTEM ---
      const controlMultiplier = isGrounded ? 1.0 : airControl;
      const usingRunModel = isRunning && !isCrouching;
      const currentAccel = usingRunModel ? runAcceleration : acceleration;
      const currentDecel = usingRunModel ? runDeceleration : deceleration;
      
        if (hasHorizontalInput) {
          moveDir.normalize();
          // Accelerate toward target velocity
          const targetVelX = moveDir.x * currentMoveSpeed;
          const targetVelZ = moveDir.z * currentMoveSpeed;
          const response = currentAccel * controlMultiplier;
          velocityX.current = smoothResponse(velocityX.current, targetVelX, response, delta);
          velocityZ.current = smoothResponse(velocityZ.current, targetVelZ, response, delta);
      } else {
          // Decelerate (friction) when no input - use running decel if was running fast
          const wasRunningFast = Math.sqrt(velocityX.current ** 2 + velocityZ.current ** 2) > 12;
          const frictionDecel = wasRunningFast ? runDeceleration : currentDecel;
          const frictionRate = (isGrounded ? frictionDecel : frictionDecel * 0.3);
          velocityX.current = smoothResponse(velocityX.current, 0, frictionRate, delta);
          velocityZ.current = smoothResponse(velocityZ.current, 0, frictionRate, delta);
          
          // Stop completely if very slow
          if (Math.abs(velocityX.current) < 0.01) velocityX.current = 0;
          if (Math.abs(velocityZ.current) < 0.01) velocityZ.current = 0;
      }
      
      const isMoving = Math.abs(velocityX.current) > 0.1 || Math.abs(velocityZ.current) > 0.1;
      audioManager(isMoving); // Update walking sound based on actual movement
      
      // Update movement state icons
      if (walkingIcon && runningIcon && crouchIcon) {
          // Show walking icon when moving (not running, not crouching)
          walkingIcon.style.display = (isMoving && !isRunning && !isCrouching) ? 'block' : 'none';
          // Show running icon when running (not crouching)
          runningIcon.style.display = (isMoving && isRunning && !isCrouching) ? 'block' : 'none';
          // Show crouch icon when crouching
          crouchIcon.style.display = isCrouching ? 'block' : 'none';
      }
      
      // --- HEAD BOB UPDATE ---
      if (isGrounded && isMoving) {
          headBobPhase += headBobSpeed * delta;
          bobIntensity += (1 - bobIntensity) * 5 * delta; // Fade in
      } else if (isGrounded) {
          // Keep phase moving slightly to avoid jarring stop
          headBobPhase += headBobSpeed * delta * 0.3;
          bobIntensity *= Math.pow(0.05, delta); // Smooth fade out
      }
      
      // 3. Determine Translation Vector
      let targetMovementVector = null;
      const hasVelocity = Math.abs(velocityX.current) > 0.001 || Math.abs(velocityZ.current) > 0.001;
     
      // Condition A: Character has horizontal velocity
      if (hasVelocity) {
          const displacementX = velocityX.current * delta;
          const displacementZ = velocityZ.current * delta;
         
          // Horizontal movement + vertical velocity
          targetMovementVector = new RAPIER.Vector3(displacementX, verticalVelocity * delta, displacementZ);
      }
      // Condition B: Character is actively falling or jumping
      else if (!isGrounded || verticalVelocity > 0) {
          // Vertical movement only
          targetMovementVector = new RAPIER.Vector3(0, verticalVelocity * delta, 0);
      }
      // ELSE: targetMovementVector remains null (character stays put)
     
     
      // 4. Apply Movement (ONLY if targetMovementVector is not null)
      if (targetMovementVector !== null) {
         
          // Compute collision-free movement
          characterController.computeColliderMovement(
              characterCollider,
              targetMovementVector
          );
          const correctedMovement = characterController.computedMovement();
          const currentPos = characterBody.translation();
         
          // Apply the corrected movement to the Kinematic body
          characterBody.setNextKinematicTranslation({
              x: currentPos.x + correctedMovement.x,
              y: currentPos.y + correctedMovement.y,
              z: currentPos.z + correctedMovement.z
          });
      }
      // --- Physics Step ---
      world.step();
      controls.update(delta);
      // --- Sync Visuals (AFTER STEP) ---
      const newPos = characterBody.translation();
      
      // Calculate head bob offset
      let bobAmount = isCrouching ? crouchHeadBobAmount : headBobAmount;
      let currentVerticalBobAmount = verticalBobAmount;
      
      // Increase bob amplitude when running
      if (isRunning && !isCrouching) {
          bobAmount = runHeadBobAmount;
          currentVerticalBobAmount = runVerticalBobAmount;
      }
      
      const bobOffsetX = Math.sin(headBobPhase * 2) * bobAmount * bobIntensity; // Side-to-side sway
      const bobOffsetY = Math.abs(Math.sin(headBobPhase)) * currentVerticalBobAmount * bobIntensity; // Up-down bounce
      
      camera.position.set(
          newPos.x + bobOffsetX, 
          newPos.y + currentEyeOffset + bobOffsetY, 
          newPos.z
      );
      if(flashlight) {
        spotLight.position.x = bobOffsetX
        flashlight.position.y = bobOffsetY - 1
      }
    
      characterMesh.position.copy(newPos);
      characterMesh.visible = false; // Hide mesh to avoid clipping artifacts
      camera.getWorldDirection(_mobileTemp); // Reuse temp vector for direction
 
      raycaster.set(camera.position, _mobileTemp);
      // scene.add(new THREE.ArrowHelper(raycaster.ray.direction, raycaster.ray.origin, 300, 0xff0000) );
 
      const intersects = raycaster.intersectObjects(
        [cubeMesh, cylinderMesh],
        false
      )
      // Only show grab cursor / pickup icon if the nearest hit is within `pickupReach`
      if (intersects.length) {
        const hit = intersects[0];
        // require both within reach and the hit object maps to a dynamic body
        const withinReach = typeof hit.distance === 'number' && hit.distance <= pickupReach;
        const candidate = getDynamicBodyForMesh(hit.object);
        if (withinReach && candidate) {
          try { if (renderer && renderer.domElement) renderer.domElement.style.cursor = 'grab'; } catch (e) {}
          try { showPickupIcon(); } catch (e) {}
        } else {
          try { if (renderer && renderer.domElement) renderer.domElement.style.cursor = ''; } catch (e) {}
          try { hidePickupIcon(); } catch (e) {}
        }
      } else {
        try { if (renderer && renderer.domElement) renderer.domElement.style.cursor = ''; } catch (e) {}
        try { hidePickupIcon(); } catch (e) {}
      }
      // Sync other dynamic bodies (Spheres, cubes)
      for (const [mesh, body] of dynamicBodies) {
          // If this object is currently grabbed, drive it to the camera hold point
          if (typeof grabbedObject !== 'undefined' && grabbedObject && mesh === grabbedObject.mesh) {
            const forward = new THREE.Vector3();
            camera.getWorldDirection(forward);
            const holdTarget = new THREE.Vector3().copy(camera.position).add(forward.multiplyScalar(grabbedObject.distance || 3));
            // position the object's origin so the original hit point aligns with the hold target
            const desiredPos = new THREE.Vector3().subVectors(holdTarget, grabbedObject.offset || new THREE.Vector3());
            try {
              body.setNextKinematicTranslation({ x: desiredPos.x, y: desiredPos.y, z: desiredPos.z });
            } catch (e) {}
            mesh.position.copy(desiredPos);
            const r = body.rotation();
            mesh.quaternion.set(r.x, r.y, r.z, r.w);
            continue;
          }

          const t = body.translation();
          const r = body.rotation();
          mesh.position.set(t.x, t.y, t.z);
          mesh.quaternion.set(r.x, r.y, r.z, r.w);
      }
      grass.update(delta);
      rain.update(delta);
      moon.update(camera); // Update lens flare
      
      // Update wispy fog - gentle drifting and bobbing
      const elapsed = clock.getElapsedTime();
      for (const fog of fogParticles) {
        // Slow drift
        fog.position.x += fog.userData.speedX * delta;
        fog.position.z += fog.userData.speedZ * delta;
        
        // Gentle vertical bob
        fog.position.y = fog.userData.baseY + Math.sin(elapsed * fog.userData.bobSpeed + fog.userData.phase) * fog.userData.bobAmount;
        
        // Wrap around player
        const dx = fog.position.x - newPos.x;
        const dz = fog.position.z - newPos.z;
        if (dx > 60) fog.position.x -= 120;
        if (dx < -60) fog.position.x += 120;
        if (dz > 60) fog.position.z -= 120;
        if (dz < -60) fog.position.z += 120;
      }
      
      // Update enemy AI
      _characterPos.set(newPos.x, newPos.y + currentEyeOffset, newPos.z);
      const playerState = {
        isMoving: isMoving,
        isCrouching: isCrouching,
        isRunning: isRunning,
        flashlightOn: flashlightOn,
        flashlightToggled: flashlightJustToggled // True for one frame when toggled
      };
      
      // Update all enemies and check for collisions
      for (const enemy of enemies) {
        const enemyCollision = enemy.update(delta, _characterPos, playerState);
        
        // Handle collision with enemy - push player away and deal damage
        if (enemyCollision && enemyCollision.colliding && enemyCollision.push) {
          // Deal damage to player (only when enemy attacks or is chasing)
          if (enemyCollision.isAttack) {
            // Attack hit - deal damage and apply strong knockback
            takeDamage();
            playDeadlyStrike(audioContext, masterGain);
            enemy._lastAttackHit = true;
          } else if (enemy.currentState === enemy.states.CHASE) {
            // Regular collision damage while chasing
            takeDamage();
          }
          
          const currentPlayerPos = characterBody.translation();
          
          // Apply knockback - much stronger for attacks
          let knockbackMultiplier = enemyCollision.isAttack ? 1.0 : delta;
          
          // For attacks, also add to player velocity for sustained knockback
          if (enemyCollision.isAttack) {
            // Apply strong velocity knockback that will persist
            velocityX.current += enemyCollision.push.x * 0.5;
            velocityZ.current += enemyCollision.push.z * 0.5;
            // Add upward velocity for impact feel
            verticalVelocity = Math.max(verticalVelocity, 8);
          }
          
          const pushVector = new RAPIER.Vector3(
            enemyCollision.push.x * knockbackMultiplier,
            enemyCollision.push.y * knockbackMultiplier,
            enemyCollision.push.z * knockbackMultiplier
          );
          
          // Compute collision-safe push movement
          characterController.computeColliderMovement(characterCollider, pushVector);
          const correctedPush = characterController.computedMovement();
          
          characterBody.setNextKinematicTranslation({
            x: currentPlayerPos.x + correctedPush.x,
            y: currentPlayerPos.y + correctedPush.y,
            z: currentPlayerPos.z + correctedPush.z
          });
        }
      }
      // Play hit-miss sound if attack animation ended and no hit occurred
      for (const enemy of enemies) {
        if (enemy.attackData && enemy.attackData.justEnded) {
          if (!enemy._lastAttackHit) {
            playHitMiss(audioContext, masterGain);
          }
          enemy.attackData.justEnded = false;
          enemy._lastAttackHit = false;
        }
      }
      flashlightJustToggled = false; // Reset after passing to AI
      
      if (waterSplash) {
        waterSplash.update(delta);
      }

      //Rotate page mesh 
      

      page.update();

      // updateDebugRender(world);   
    
      // renderer.render(scene, camera);
      postProcessing.render();

      stats.end();
  });
}); // end rapier import

const soundToggleButton = document.querySelector('#escape-container .menu-button:nth-child(2)');
let soundEnabled = true;

// Store global mute state for access in audio functions
window.gameSoundEnabled = true;

soundToggleButton.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    window.gameSoundEnabled = soundEnabled;
    
    // Mute/unmute HTML audio elements
    const audioElements = document.querySelectorAll('audio');
    audioElements.forEach(audio => {
        audio.muted = !soundEnabled;
    });
    
    // Mute/unmute Web Audio API sounds
    if (rainGain) {
        rainGain.gain.value = soundEnabled ? 0.1 : 0;
    }
    if (walkingGain) {
        walkingGain.gain.value = soundEnabled ? 0.5 : 0;
    }
    
    // Update button text
    soundToggleButton.textContent = soundEnabled ? 'SOUND OFF' : 'SOUND ON';
});

function updateClock() {
  const now = new Date();

  // Time
  let hours = now.getHours();
  let minutes = now.getMinutes();

  // Format time
  hours = hours.toString().padStart(2, "0");
  hours = hours % 12 || 12;
  minutes = minutes.toString().padStart(2, "0");

  document.getElementById("time").textContent = `${hours}:${minutes} ${now.getHours() >= 12 ? "PM" : "AM"}`;

  // Date
  const options = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
  const dateStr = now.toLocaleDateString("en-US", options);
  document.getElementById("date").textContent = dateStr;
}

// Update every second
setInterval(updateClock, 1000);

// Run once immediately
updateClock();

// HMR cleanup - destroy old enemies when hot reloading
if (import.meta.hot) {
    import.meta.hot.accept();
    import.meta.hot.dispose(() => {
        if (window.__enemies) {
            window.__enemies.forEach(e => e.destroy());
            window.__enemies = null;
        }
    });
}
})
