import * as THREE from 'three/webgpu'
import { pass, mrt, output, emissive } from 'three/tsl'
import { GLTFLoader } from 'three/examples/jsm/Addons.js'
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
import { Enemy } from '../../../assets/models/scripts/enemy'
import { Moon } from '../../../assets/models/scripts/moon'
import { EnemyAI } from '../../../assets/models/scripts/enemyAI'
import Stats from 'stats.js'
import { positionLocal, Fn, uniform, vec4, vec3, vec2, length, float, abs, time, sin, mod, fract, floor, hash, uv, mix, clamp } from 'three/tsl'
const rain_sound = document.getElementById('rain-sound')
rain_sound.volume = 0.1
const walking_sound = document.getElementById('walking-sound')

// Button press sound with pitch variation
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
let buttonPressBuffer = null;
fetch('/assets/sounds/fx/button-press.mp3')
  .then(response => response.arrayBuffer())
  .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
  .then(buffer => { buttonPressBuffer = buffer; });

function playButtonPress(detune = 0) {
  if (!buttonPressBuffer) return;
  const source = audioContext.createBufferSource();
  const gainNode = audioContext.createGain();
  source.buffer = buttonPressBuffer;
  source.detune.value = detune; // Pitch shift in cents (100 cents = 1 semitone)
  gainNode.gain.value = 0.8;
  source.connect(gainNode);
  gainNode.connect(audioContext.destination);
  source.start(0);
}
// RAPIER PHYSICS!
import('@dimforge/rapier3d').then(RAPIER => {
    console.log('Rapier ready:', RAPIER.version())
    let gravity = { x: 0.0, y: -20, z: 0.0 }
    let world = new RAPIER.World(gravity)
    let prevTime = performance.now()
    const dynamicBodies = []
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
    camera.position.set(0, 5 + 0.8, 0) // Match initial body pos + eye offset
    const renderer = new THREE.WebGPURenderer({ antialias: true })
    renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio( window.devicePixelRatio )
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.VSMShadowMap
    renderer.outputEncoding = THREE.sRGBEncoding
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 2.5 // Balanced exposure - dark but fog visible
    renderer.setClearColor(0x000000, 1)
    document.body.appendChild(renderer.domElement)
    
    // --- NO POST PROCESSING (for performance) ---
    
    let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false, moveJump = false, moveCrouch = false
    let canJump = true
    const forwardVec = new THREE.Vector3()
    const rightVec = new THREE.Vector3()
    const moveDir = new THREE.Vector3()
    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
    })
    // const grid = new THREE.GridHelper( 400, 100, 0xffffff, 0xffffff )
    // grid.material.opacity = 0.5
    // grid.material.depthWrite = false
    // grid.material.transparent = true
    // scene.add( grid )
    const axesHelper = new THREE.AxesHelper( 5 );
    scene.add( axesHelper );
    // Enemy(scene, camera)
    // SKYBOX - disabled, conflicts with fog
    // Skybox(scene)
    
    // VOLUMETRIC FOG - Linear fog for better light interaction
    // Horror atmosphere with visible atmospheric fog
    const fogColor = 0x1a1a1a; // Neutral dark gray - no color tint
    const fogNear = 0.5; // Fog starts immediately
    const fogFar = 60; // Full fog at shorter distance - much denser
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
    
    for (let i = 0; i < 60; i++) {
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
    const ambientLight = new THREE.AmbientLight(0x202020, 2.5); // Neutral gray, subtle fill
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
    const sphereMesh = new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshBasicMaterial({color: 0x800080}))
    sphereMesh.castShadow = true
    scene.add(sphereMesh)
    const sphereBody = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(10, 5, 0).setCanSleep(false))
    const sphereShape = RAPIER.ColliderDesc.ball(1).setMass(1).setRestitution(1.1)
    world.createCollider(sphereShape, sphereBody)
    dynamicBodies.push([sphereMesh, sphereBody])
    // Cylinder Collider
    const cylinderMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2, 16), new THREE.MeshBasicMaterial({color: 0x800080}))
    cylinderMesh.castShadow = true
    scene.add(cylinderMesh)
    const cylinderBody = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 5, 5).setCanSleep(false))
    const cylinderShape = RAPIER.ColliderDesc.cylinder(1, 1).setMass(1).setRestitution(1.1)
    world.createCollider(cylinderShape, cylinderBody)
    dynamicBodies.push([cylinderMesh, cylinderBody])
   
    console.log(dynamicBodies)
    // --- GROUND PHYSICS ---
    // 1. Create the fixed body (Use the builder .fixed())
    const groundBodyDesc = RAPIER.RigidBodyDesc.fixed()
        .setTranslation(0, 1, 0);
    const groundBody = world.createRigidBody(groundBodyDesc);
    // 2. Create the collider (Make it THICK so you can't tunnel through it)
    // 250 width, 2 height (4 units thick), 250 depth
    const groundColliderDesc = RAPIER.ColliderDesc.cuboid(250, 2, 250);
    world.createCollider(groundColliderDesc, groundBody);
    // GROUND_PLANE with PBR textures (diffuse only since EXR not supported by TextureLoader)
    const textureLoader = new THREE.TextureLoader()
    
    // Create bump texture by converting diffuse to grayscale
    const createBumpTexture = (diffuseTexture) => {
      const canvas = document.createElement('canvas');
      const size = 512;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      
      // Draw diffuse texture to canvas
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = diffuseTexture.image.width;
      tempCanvas.height = diffuseTexture.image.height;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.drawImage(diffuseTexture.image, 0, 0);
      
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
      bumpTex.repeat.set(8, 8);
      return bumpTex;
    };
    
    textureLoader.load('/assets/materials/groundPBR/rocky_terrain_02_diff_4k.jpg', (texture) => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(8, 8);
      
      const bumpMap = createBumpTexture(texture);
      
      const floor_material = new THREE.MeshStandardMaterial({
        map: texture,
        bumpMap: bumpMap,
        bumpScale: 5.0,
        roughness: 0.8,
        metalness: 0.0,
        side: THREE.DoubleSide
      });
      
      floorMesh = new THREE.Mesh(new THREE.BoxGeometry(500, 4, 500, 64, 1, 64), floor_material);
      floorMesh.position.y = -1;
      scene.add(floorMesh);

      console.log('Ground mesh created with diffuse texture and procedural bump map');
      
      // WATER SPLASH EFFECT
      waterSplash = new WaterSplash(scene, floorMesh);
      waterSplash.init();
      
      // TREES
      Trees(floorMesh, scene, world, RAPIER);
    }, undefined, (err) => {
      console.error('Failed to load ground texture:', err);
    });
    // Optional: Add some walls for testing
    const wallGeometry = new THREE.BoxGeometry(1, 20, 100);
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc,
        roughness: 0.5,
        metalness: 1.0});
    const wall = new THREE.Mesh(wallGeometry, wallMaterial);
    wall.position.set(10, 2.5, 0);
    scene.add(wall);
    const wallColliderDesc = RAPIER.ColliderDesc.cuboid(0.5, 10, 50).setTranslation(10, 2.5, 0);
    world.createCollider(wallColliderDesc);
    // BUSHES
    Bushes()
    // CAMERA RAYCAST
    const raycaster = new THREE.Raycaster()
  
  // CHARACTER CONTROLS
    const controls = new PointerLockControls( camera, renderer.domElement)
    controls.pointerSpeed = 0.5;
    controls.minPolarAngle = 0; // Allow looking straight up
    controls.maxPolarAngle = Math.PI; // Allow looking straight down
    const menu = document.getElementById('escape-container')
    const crosshair = document.getElementById('crosshair')
    document.addEventListener( 'click', function () {
      controls.lock();
    } );
    controls.addEventListener('lock', () => {
      console.log("CONTROLS LOCKED")
      crosshair.style.display = 'block'
      menu.style.display = 'none'
    })
    controls.addEventListener( 'unlock', () => {
      console.log("CONTROLS UNLOCKED")
      menu.style.display = 'block'
      crosshair.style.display = 'none'
    });
    scene.add(controls.object)
    console.log(walking_sound)
    let flashlightOn = true; // Flashlight toggle state
    let flashlightIntensity = 800.0; // Store original intensity
    
    const onKeyDown = (e) => {
    switch (e.code) {
      case 'KeyW': moveForward = true; break;
      case 'KeyS': moveBackward = true; break;
      case 'KeyA': moveLeft = true; break;
      case 'KeyD': moveRight = true; break;
      case 'Space': moveJump = true; break;
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
    // ---------------- SHADER TEST ------------------------------------- //
    const material1 = new THREE.MeshBasicNodeMaterial()
    const circle1 = Fn(() => {
      let c = vec3().toVar()
      let uv = positionLocal.xy.mul(5)
      let d = length(uv)
      for (let i = 0; i < 3; i++) {
        uv = uv.add(uv.div(d).mul(time.mul(0.1 + i * 0.05)))
        c[i] = float(0.01).div(length(fract(uv).sub(0.5)))
      }
      return vec4(c.div(d), 1)
    })
    material1.colorNode = circle1()
    const mesh1 = new THREE.Mesh(new THREE.PlaneGeometry(10,10), material1)
    mesh1.position.z = -50
    mesh1.position.y = 5
    scene.add(mesh1)
    // ----------------------------------------------------------------- //
    // PROPS
    /*FLASHLIGHT - Primary light source in darkness*/
    const flashlightTexture = textureLoader.load('/assets/materials/flashlight_texture.jpg');
    const spotLight = new THREE.SpotLight( 0xfff8f0, 800.0, 120, 0.4, 0.9, 2.0 ); // Soft diffused beam
    spotLight.map = flashlightTexture; // Project texture through the light
    spotLight.position.set( 0, 0, 0 );
    spotLight.target = new THREE.Object3D( 0, 0, 0 );
    // const spotLightHelper = new THREE.SpotLightHelper( spotLight );
    // scene.add( spotLightHelper );
   
    spotLight.castShadow = true;
   
     spotLight.shadow.mapSize.width = 1024;
     spotLight.shadow.mapSize.height = 1024;    
     spotLight.shadow.camera.near = 0.5;
    spotLight.shadow.camera.far = 150;
    spotLight.shadow.camera.fov = 40;

    // CHUNK GRASS?
    const grass = new Grass(scene, renderer, camera)
    
    // MOON
    const moon = Moon(scene, camera);
    
    // RAIN SYSTEM
    const rain = new Rain(scene, camera, 500)
    rain.init()
    rain.setIntensity(2) // 0 = off, 1 = light, 2 = medium, 3 = heavy
    
    // WATER SPLASH - will be initialized after ground loads
    let waterSplash = null;
    let floorMesh = null;
    
    const loader = new GLTFLoader();
   
    loader.load('/assets/models/flashlight.glb', (gltf) => {
      const flashlight = gltf.scene.children[0]
      console.log(flashlight)
      flashlight.position.z = -1.3
      flashlight.position.y = -1
      flashlight.position.x = 1
      flashlight.rotation.x = -14.3
      camera.add(flashlight)
      
      // Position spotlight at the front of the flashlight mesh
      spotLight.position.set(1, -0.8, -1.5); // Slightly in front of flashlight
      spotLight.target.position.set(1, -0.8, -10); // Point forward into the scene
      camera.add(spotLight)
      camera.add(spotLight.target)
    })
     
    const clock = new THREE.Clock()
    // STATS
    let stats = new Stats();
    stats.showPanel(1); // 0: fps, 1: ms, 2: mb, 3+: custom
    document.body.appendChild(stats.dom);
    // Character setup
    const characterHeight = 2;
    const characterRadius = 0.5;
    const characterBody = world.createRigidBody(
      new RAPIER.RigidBodyDesc(RAPIER.RigidBodyType.kinematicPositionBased)
      .setTranslation(0, 5, 0)
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
  const moveSpeed = 10;
  const runSpeed = 22; // Speed when running
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
  const acceleration = 5; // How fast to reach max speed (lower = more inertia)
  const runAcceleration = 3; // Even slower acceleration when running
  const deceleration = 3; // How fast to slow down (lower = more slide)
  const runDeceleration = 1.5; // Much more slide after running
  const airControl = 0.08; // Reduced control in air (0-1)
  
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
  const enemy = new EnemyAI(scene, world, camera, characterBody, RAPIER);
  
  // ** 1. AUDIO MANAGEMENT FUNCTION (Safe from input crashes) **
  const audioManager = (isMoving) => {
      // Only manage audio if controls are locked
      if (controls.isLocked) {
          rain_sound.play().catch(e => { /* Ignore audio errors */ });
          if (isMoving) {
              if (walking_sound.paused) {
                  // Use .catch to prevent uncaught promise errors if audio is blocked
                  walking_sound.play().catch(e => { /* Ignore audio errors */ });
              }
              // Adjust walking sound speed based on running
              walking_sound.playbackRate = isRunning ? 1.5 : 1.0;
          } else {
              if (!walking_sound.paused) {
                  walking_sound.pause();
              }
          }
      }
  };
  renderer.setAnimationLoop(() => {
      // stats.begin();
     
      let delta = clock.getDelta();
      if (delta > MAX_DELTA) delta = MAX_DELTA;
      world.timestep = Math.min(delta, 0.1);
      
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
      camera.getWorldDirection(forwardVec);
      forwardVec.y = 0;
      forwardVec.normalize();
      rightVec.crossVectors(forwardVec, new THREE.Vector3(0, 1, 0)).normalize();
      moveDir.set(0, 0, 0);
      if (moveForward) moveDir.add(forwardVec);
      if (moveBackward) moveDir.sub(forwardVec);
      if (moveLeft) moveDir.sub(rightVec);
      if (moveRight) moveDir.add(rightVec);
      const hasHorizontalInput = moveDir.lengthSq() > 0.001;
      
      // --- INERTIA SYSTEM ---
      const controlMultiplier = isGrounded ? 1.0 : airControl;
      const currentAccel = isRunning ? runAcceleration : acceleration;
      const currentDecel = isRunning ? runDeceleration : deceleration;
      
      if (hasHorizontalInput) {
          moveDir.normalize();
          // Accelerate toward target velocity
          const targetVelX = moveDir.x * currentMoveSpeed;
          const targetVelZ = moveDir.z * currentMoveSpeed;
          
          velocityX.current += (targetVelX - velocityX.current) * currentAccel * controlMultiplier * delta;
          velocityZ.current += (targetVelZ - velocityZ.current) * currentAccel * controlMultiplier * delta;
      } else {
          // Decelerate (friction) when no input - use running decel if was running fast
          const wasRunningFast = Math.sqrt(velocityX.current ** 2 + velocityZ.current ** 2) > 12;
          const frictionDecel = wasRunningFast ? runDeceleration : currentDecel;
          const frictionMultiplier = isGrounded ? frictionDecel : frictionDecel * 0.1;
          velocityX.current *= Math.max(0, 1 - frictionMultiplier * delta);
          velocityZ.current *= Math.max(0, 1 - frictionMultiplier * delta);
          
          // Stop completely if very slow
          if (Math.abs(velocityX.current) < 0.01) velocityX.current = 0;
          if (Math.abs(velocityZ.current) < 0.01) velocityZ.current = 0;
      }
      
      const isMoving = Math.abs(velocityX.current) > 0.1 || Math.abs(velocityZ.current) > 0.1;
      audioManager(isMoving); // Update walking sound based on actual movement
      
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
      characterMesh.position.copy(newPos);
      characterMesh.visible = false; // Hide mesh to avoid clipping artifacts
       const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
 
      raycaster.set(camera.position, direction);
      // scene.add(new THREE.ArrowHelper(raycaster.ray.direction, raycaster.ray.origin, 300, 0xff0000) );
 
      const intersects = raycaster.intersectObjects(
        [cubeMesh, sphereMesh, cylinderMesh],
        false
      )
      if (intersects.length) {
        dynamicBodies.forEach((b) => {
          b[0] === intersects[0].object && b[1].applyImpulse(new RAPIER.Vector3(0, 3, 0), true)
        })
      }
      // Sync other dynamic bodies (Spheres, cubes)
      for (const [mesh, body] of dynamicBodies) {
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
      const characterPos = new THREE.Vector3(newPos.x, newPos.y + currentEyeOffset, newPos.z);
      enemy.update(delta, characterPos);
      if (waterSplash) {
        waterSplash.update(delta);
      }
      renderer.render(scene, camera);
      stats.end();
  });
}); // end rapier import