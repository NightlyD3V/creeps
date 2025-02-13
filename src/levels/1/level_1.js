import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/Addons.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { PointerLockControls } from 'three/examples/jsm/Addons.js'
import { Skybox } from '../../../assets/models/scripts/skybox'
import { Grass } from '../../../assets/models/scripts/grass'
import { Trees } from '../../../assets/models/scripts/trees'
import { Bushes } from '../../../assets/models/scripts/bushes'
import { Fog } from '../../../assets/models/scripts/fog'

const rain_sound = document.getElementById('rain-sound')
rain_sound.volume = 0.1
rain_sound.play()

// RAPIER PHYSICS!
import('@dimforge/rapier3d').then(RAPIER => {
    // Use the RAPIER module here.
    let gravity = { x: 0.0, y: -9.81, z: 0.0 }  
    let world = new RAPIER.World(gravity)
    const dynamicBodies = []

    const scene = new THREE.Scene()

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
    camera.position.set(0, 5, 20)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(window.innerWidth, window.innerHeight)
		renderer.setPixelRatio( window.devicePixelRatio );
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.VSMShadowMap
    document.body.appendChild(renderer.domElement)

    // const environment = new RoomEnvironment( renderer )
    // const pmremGenerator = new THREE.PMREMGenerator( renderer )
    // scene.background = new THREE.Color( 0xFF0000 )
    // scene.environment = pmremGenerator.fromScene( environment ).texture
    // environment.dispose();

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
 
    // SKYBOX
    // Skybox(THREE, scene)

    // FOG 
    // Fog(scene)

    // LIGHTING
    // Three Point Lights setup

    // 1. Key Light (The main light, usually the brightest)
    const keyLight = new THREE.PointLight(0xffffff, 300); // Color, Intensity
    keyLight.position.set(2, 2, 2); // Position
    keyLight.name = "Key Light"; //Give the light a name
    camera.add(keyLight);

    // // Optional: Add a helper to visualize the light's position
    // const keyLightHelper = new THREE.PointLightHelper( keyLight, 1 ); // Light, Size
    // scene.add( keyLightHelper );


    // // 2. Fill Light (Fills in the shadows created by the key light)
    // const fillLight = new THREE.PointLight(0x404040, 50); // Slightly dimmer and cooler color
    // fillLight.position.set(-2, 1, 1);
    // fillLight.name = "Fill Light";
    // scene.add(fillLight);

    // const fillLightHelper = new THREE.PointLightHelper( fillLight, 1 );
    // scene.add( fillLightHelper );


    // // 3. Back Light (Separates the subject from the background)
    // const backLight = new THREE.PointLight(0x202020, 100); // Dimmer, often a different color
    // backLight.position.set(0, -2, -2);
    // backLight.name = "Back Light";
    // scene.add(backLight);

    // const backLightHelper = new THREE.PointLightHelper( backLight, 1 );
    // scene.add( backLightHelper );


    // Ambient Light (Optional: Provides a base level of illumination)
    const ambientLight = new THREE.AmbientLight(0x101010); // Very subtle
    scene.add(ambientLight);

    // Capsule Character Collider
    const capsuleMesh = new THREE.Mesh(new THREE.CapsuleGeometry(10,10,10,8))
    // scene.add(capsuleMesh)
    const capsuleBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0).setCanSleep(false))
    const capsuleShape = RAPIER.ColliderDesc.capsule(1, 1)
    world.createCollider(capsuleShape, capsuleBody)
    camera.add(capsuleBody)

    // Cuboid Collider
    const cubeMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({color: 0x800080}))
    cubeMesh.castShadow = true
    scene.add(cubeMesh)
    const cubeBody = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 5, 0).setCanSleep(false))
    const cubeShape = RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5).setMass(1).setRestitution(1.1)
    world.createCollider(cubeShape, cubeBody)
    dynamicBodies.push([cubeMesh, cubeBody])

    // Ball Collider
    const sphereMesh = new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshBasicMaterial({color: 0x800080}))
    sphereMesh.castShadow = true
    scene.add(sphereMesh)
    const sphereBody = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(-2, 5, 0).setCanSleep(false))
    const sphereShape = RAPIER.ColliderDesc.ball(1).setMass(1).setRestitution(1.1)
    world.createCollider(sphereShape, sphereBody)
    dynamicBodies.push([sphereMesh, sphereBody])

    // Cylinder Collider
    const cylinderMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2, 16), new THREE.MeshBasicMaterial({color: 0x800080}))
    cylinderMesh.castShadow = true
    scene.add(cylinderMesh)
    const cylinderBody = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 5, 0).setCanSleep(false))
    const cylinderShape = RAPIER.ColliderDesc.cylinder(1, 1).setMass(1).setRestitution(1.1)
    world.createCollider(cylinderShape, cylinderBody)
    dynamicBodies.push([cylinderMesh, cylinderBody])
    
    console.log(dynamicBodies)

    // GROUND_PLANE
    const floor_texture = new THREE.TextureLoader().load('/assets/materials/dark-green.webp')
    const floor_material = new THREE.MeshBasicMaterial( {color: 0xffffff, map: floor_texture} )

    const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(1000, 1, 1000), floor_material)
    floorMesh.receiveShadow = true
    floorMesh.position.y = -1
    scene.add(floorMesh)
    const floorBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -1, 0))
    const floorShape = RAPIER.ColliderDesc.cuboid(50, 0.5, 50)
    world.createCollider(floorShape, floorBody)

    // GRASS 
    Grass(floorMesh, scene)

    // TREES
    Trees(floorMesh, scene)

    // BUSHES
    Bushes()

    // CLICK PHYSICS
    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()

    renderer.domElement.addEventListener('click', (e) => {
      mouse.set(
        (e.clientX / renderer.domElement.clientWidth) * 2 - 1,
        -(e.clientY / renderer.domElement.clientHeight) * 2 + 1
      )

      raycaster.setFromCamera(mouse, camera)

      const intersects = raycaster.intersectObjects(
        [cubeMesh, sphereMesh, cylinderMesh],
        false
      )

      if (intersects.length) {
        dynamicBodies.forEach((b) => {
          b[0] === intersects[0].object && b[1].applyImpulse(new RAPIER.Vector3(0, 10, 0), true)
        })
      }
    })

    // CHARACTER CONTROLS
    let moveForward = false
    let moveBackward = false
    let moveLeft = false
    let moveRight = false
    let duck = false
    let canJump = false
    const velocity = new THREE.Vector3()
    const direction = new THREE.Vector3()

    const controls = new PointerLockControls( camera, document.body)

    const menu = document.getElementById('escape-container')
    document.addEventListener( 'click', function () {
      controls.lock();
    } );
    controls.addEventListener('lock', () => {
      console.log("CONTROLS LOCKED")
      menu.style.display = 'none'
    })
    controls.addEventListener( 'unlock', () => {
      console.log("CONTROLS UNLOCKED")
      menu.style.display = 'block'
    });

    scene.add(controls.object)

    const onKeyDown = function ( event ) {
      switch ( event.code ) {

        case 'ArrowUp':
        case 'KeyW':
          moveForward = true
          break

        case 'ArrowLeft':
        case 'KeyA':
          moveLeft = true
          break

        case 'ArrowDown':
        case 'KeyS':
          moveBackward = true
          break

        case 'ArrowRight':
        case 'KeyD':
          moveRight = true
          break

        case 'Duck':
          case 'Ctrl':
          duck = true
          break

        case 'Space':
          if ( canJump === true ) velocity.y += 150
          canJump = false
          break
      }
    };

    const onKeyUp = function ( event ) {
      switch ( event.code ) {
        case 'ArrowUp':
        case 'KeyW':
          moveForward = false
          break

        case 'ArrowLeft':
        case 'KeyA':
          moveLeft = false
          break

        case 'ArrowDown':
        case 'KeyS':
          moveBackward = false
          break

        case 'ArrowRight':
        case 'KeyD':
          moveRight = false
          break
      }
    };

    document.addEventListener( 'keydown', onKeyDown );
    document.addEventListener( 'keyup', onKeyUp );

    // PROPS 
    /*FLASHLIGHT*/
    const loader = new GLTFLoader();

    loader.load('/assets/models/flashlight.glb', (gltf) => {
        const flashlight = gltf.scene.children[0];
        console.log(flashlight)
        flashlight.position.z = -1.3
        flashlight.position.y = -1
        flashlight.position.x = 1
        flashlight.rotation.x = -14.3
        camera.add(flashlight)
    })

   
    const clock = new THREE.Clock()
    let delta


    // GAME LOOP
    function animate() {
      requestAnimationFrame(animate)  
      
      if(controls.isLocked == true) {
        velocity.x -= velocity.x * 50 * delta
        velocity.z -= velocity.z * 50 * delta

        velocity.y -= 9.8 * 100.0 * delta; // 100.0 = mass

        direction.x = Number( moveRight ) - Number( moveLeft )
        direction.z = Number( moveForward ) - Number( moveBackward )
        direction.normalize(); // this ensures consistent movements in all directions

        if ( moveLeft || moveRight ) velocity.x -= direction.x * 400.0 * delta
        if ( moveForward || moveBackward ) velocity.z -= direction.z * 400.0 * delta
        // if (moveLeft || moveRight || moveForward || moveBackward ) camera.position.y = Math.sine(3)

        controls.moveRight( - velocity.x * delta )
        controls.moveForward( - velocity.z * delta )

        

        // controls.object.position.y += ( velocity.y * delta ) 

        // if ( controls.object.position.y < 3 ) {

        //   velocity.y = 0
        //   controls.object.position.y = 3

        //   canJump = true

        // }
      }
      delta = clock.getDelta()
      world.timestep = Math.min(delta, 0.1)
      world.step()

      for (let i = 0, n = dynamicBodies.length; i < n; i++) {
          dynamicBodies[i][0].position.copy(dynamicBodies[i][1].translation())
          dynamicBodies[i][0].quaternion.copy(dynamicBodies[i][1].rotation())
      }
      renderer.render(scene, camera)
    }
    animate()
})



