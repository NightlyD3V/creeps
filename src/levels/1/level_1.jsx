import * as THREE from 'three/webgpu'
import { GLTFLoader } from 'three/examples/jsm/Addons.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js'
import { Skybox } from '../../../assets/models/scripts/skybox'
import { Grass } from '../../../assets/models/scripts/grass'
import { Trees } from '../../../assets/models/scripts/trees'
import { Bushes } from '../../../assets/models/scripts/bushes'
import { Fog } from '../../../assets/models/scripts/fog'
import { Fire } from '../../../assets/models/scripts/fire'
import { Enemy } from '../../../assets/models/scripts/enemy'
import { Moon } from '../../../assets/models/scripts/moon'
import Stats from 'stats.js'

const rain_sound = document.getElementById('rain-sound')
rain_sound.volume = 0.1
rain_sound.play()

const walking_sound = document.getElementById('walking-sound')

// RAPIER PHYSICS!
import('@dimforge/rapier3d').then(RAPIER => {
    console.log('Rapier ready:', RAPIER.version())
    let gravity = { x: 0.0, y: -20, z: 0.0 }  
    let world = new RAPIER.World(gravity)
    let prevTime = performance.now()

    const dynamicBodies = []

    let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false, moveJump = false
    let canJump = true
    const forwardVec = new THREE.Vector3()
    const rightVec = new THREE.Vector3()
    const moveDir = new THREE.Vector3()
  
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
    renderer.toneMappingExposure = 8
    document.body.appendChild(renderer.domElement)

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

     Enemy(scene, camera)
 
    // SKYBOX
    // Skybox(scene)

    // FOG 
    // Fog(scene)

    // Ambient Light (Optional: Provides a base level of illumination)
    // const ambientLight = new THREE.AmbientLight(0x101010,10.0); // Very subtle
    // scene.add(ambientLight);

    // Cuboid Collider
    const cubeMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({color: 0x800080}))
    cubeMesh.castShadow = true
    scene.add(cubeMesh)
    const cubeBody = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(5, 5, 0).setCanSleep(false))
    const cubeShape = RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5).setMass(1).setRestitution(1.1)
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

    // GROUND_PLANE
    const textureLoader = new THREE.TextureLoader()
    textureLoader.load('/assets/materials/seamless-rock.avif', function(texture) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(70, 70); // Adjust these values to control repetition
    
      const floor_material = new THREE.MeshStandardMaterial({
        color: 0xC7EA46,
        map: texture
      })
      const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(500, 4, 500), floor_material)
      floorMesh.position.y = -1
      scene.add(floorMesh)

      // TREES
      Trees(floorMesh, scene)
    })
    // Optional: Add some walls for testing
    const wallGeometry = new THREE.BoxGeometry(1, 5, 20);
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 'brown' });
    const wall = new THREE.Mesh(wallGeometry, wallMaterial);
    wall.position.set(10, 2.5, 0);
    scene.add(wall);
    const wallColliderDesc = RAPIER.ColliderDesc.cuboid(0.5, 2.5, 10).setTranslation(10, 2.5, 0);
    world.createCollider(wallColliderDesc);


    // BUSHES
    Bushes()

    // CAMERA RAYCAST 
    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2();

    function onMouseMove(event) {
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
  }
  window.addEventListener('mousemove', onMouseMove, false)
  // CHARACTER CONTROLS
    const controls = new PointerLockControls( camera, renderer.domElement)
    controls.pointerSpeed = 0.5;   
    controls.minPolarAngle = 0;         // Allow looking straight up
    controls.maxPolarAngle = Math.PI;   // Allow looking straight down

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
    const onKeyDown = (e) => {
    switch (e.code) {
      case 'KeyW': moveForward = true; break;
      case 'KeyS': moveBackward = true; break;
      case 'KeyA': moveLeft = true; break;
      case 'KeyD': moveRight = true; break;
      case 'Space': moveJump = true; break;
    }
    };
    const onKeyUp = (e) => {
      switch (e.code) {
        case 'KeyW': moveForward = false; break;
        case 'KeyS': moveBackward = false; break;
        case 'KeyA': moveLeft = false; break;
        case 'KeyD': moveRight = false; break;
        case 'Space': moveJump = false; break;
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // PROPS 
    /*FLASHLIGHT*/

    const spotLight = new THREE.SpotLight( 0xffffff, 1000.0, 0, 0.05);
    spotLight.position.set( 0, 3, 50 );
    spotLight.target = new THREE.Object3D( 0, 0, 0 );

    const spotLightHelper = new THREE.SpotLightHelper( spotLight );
    
    spotLight.castShadow = true;
    
    // spotLight.shadow.mapSize.width = 1024;
    // spotLight.shadow.mapSize.height = 1024;
    
    // spotLight.shadow.camera.near = 100;
    // spotLight.shadow.camera.far = 100;
    spotLight.shadow.camera.fov = 70;

    // CHUNK GRASS?
    // Grass(scene)

   
    
    const loader = new GLTFLoader();
    
    loader.load('/assets/models/flashlight.glb', (gltf) => {
      const flashlight = gltf.scene.children[0]
      console.log(flashlight)
      flashlight.position.z = -1.3
      flashlight.position.y = -1
      flashlight.position.x = 1
      flashlight.rotation.x = -14.3
      camera.add(flashlight)
      camera.add(spotLight)
      flashlight.add(spotLight.target)
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

    const characterController = world.createCharacterController(0.2);

    // Configure Controller behaviors
    characterController.enableAutostep(0.7, 0.5, true); // Auto-climb stairs/small obstacles
    characterController.enableSnapToGround(0.5);        // Glue to ground when walking down slopes
    characterController.setCharacterMass(80);           // Virtual mass for pushing objects
    characterController.setApplyImpulsesToDynamicBodies(true); // Allow pushing crates/balls

    // Visible character mesh (e.g., a capsule for debugging)
    const characterMesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(characterRadius, characterHeight - 2 * characterRadius, 4, 8),
      // new THREE.MeshBasicMaterial({ color: 'blue', wireframe: true })
    );
    scene.add(characterMesh);

  // --- CHARACTER MOVEMENT CONSTANTS ---
  const moveSpeed = 10;
  const jumpForce = 12;
  let verticalVelocity = 0;
  const MAX_DELTA = 0.05;
  const terminalVelocity = -50; // Prevent infinite fall acceleration

  // ** 1. AUDIO MANAGEMENT FUNCTION (Safe from input crashes) **
  const audioManager = (isMoving) => {
      // Only manage audio if controls are locked
      if (controls.isLocked) {
          if (isMoving) {
              if (walking_sound.paused) {
                  // Use .catch to prevent uncaught promise errors if audio is blocked
                  walking_sound.play().catch(e => { /* Ignore audio errors */ });
              }
          } else {
              if (!walking_sound.paused) {
                  walking_sound.pause();
              }
          }
      }
  };

  renderer.setAnimationLoop(() => {
      stats.begin();

      let delta = clock.getDelta();
      if (delta > MAX_DELTA) delta = MAX_DELTA;
      world.timestep = Math.min(delta, 0.1);

      // 1. Ground and Gravity Check
      const isGrounded = characterController.computedGrounded();
      if (isGrounded) {
          verticalVelocity = 0; // Small constant force to ensure ground stickiness
          
          if (moveJump) {
              verticalVelocity = jumpForce;
              characterController.disableSnapToGround();
          } else {
              characterController.enableSnapToGround(0.5);
          }
      } else {
          verticalVelocity -= 20 * delta; // Apply gravity
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
      audioManager(hasHorizontalInput); // Update walking sound based on input

      // 3. Determine Translation Vector (The FIX for infinite sliding)
      
      let targetMovementVector = null;
      
      // Condition A: Character is moving horizontally (W/A/S/D pressed)
      if (hasHorizontalInput) {
          moveDir.normalize();

          const displacementX = moveDir.x * moveSpeed * delta;
          const displacementZ = moveDir.z * moveSpeed * delta;
          
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

      // --- Sync Visuals (AFTER STEP) ---
      const newPos = characterBody.translation();
      camera.position.set(newPos.x, newPos.y + 0.8, newPos.z);
      characterMesh.position.copy(newPos);

      // Sync other dynamic bodies (Spheres, cubes)
      for (const [mesh, body] of dynamicBodies) {
          const t = body.translation();
          const r = body.rotation();
          mesh.position.set(t.x, t.y, t.z);
          mesh.quaternion.set(r.x, r.y, r.z, r.w);
      }

      renderer.render(scene, camera);
      stats.end();
  });

}); // end rapier import