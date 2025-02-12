import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { FirstPersonControls } from 'three/examples/jsm/Addons.js'
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js'
import { Skybox } from '../../../assets/models/scripts/skybox'
import { Grass } from '../../../assets/models/scripts/grass'

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

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100)
    camera.position.set(0, 5, 20)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.VSMShadowMap
    document.body.appendChild(renderer.domElement)

    const environment = new RoomEnvironment( renderer )
    const pmremGenerator = new THREE.PMREMGenerator( renderer )
    scene.background = new THREE.Color( 0xbbbbbb )
    scene.environment = pmremGenerator.fromScene( environment ).texture
    environment.dispose();

    window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
    })

    const grid = new THREE.GridHelper( 400, 100, 0xffffff, 0xffffff )
    grid.material.opacity = 0.5
    grid.material.depthWrite = false
    grid.material.transparent = true
    scene.add( grid )

    const axesHelper = new THREE.AxesHelper( 5 );
    scene.add( axesHelper );
 
    // SKYBOX
    // Skybox(THREE, scene)

    const light1 = new THREE.SpotLight(undefined, Math.PI * 10)
    light1.position.set(2.5, 5, 5)
    light1.angle = Math.PI / 3
    light1.penumbra = 0.5
    light1.castShadow = true
    light1.shadow.blurSamples = 10
    light1.shadow.radius = 5
    scene.add(light1)

    const light2 = light1.clone()
    light2.position.set(-2.5, 5, 5)
    scene.add(light2)

    // Capsule Character Collider
    // const capsuleMesh = new THREE.Mesh(new THREE.capsuleMesh(1,1,1))
    // let capsule = RAPIER.ColliderDesc.capsule(0.5, 0.2);

    // Cuboid Collider
    const cubeMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshNormalMaterial())
    cubeMesh.castShadow = true
    scene.add(cubeMesh)
    const cubeBody = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 5, 0).setCanSleep(false))
    const cubeShape = RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5).setMass(1).setRestitution(1.1)
    world.createCollider(cubeShape, cubeBody)
    dynamicBodies.push([cubeMesh, cubeBody])

    // Ball Collider
    const sphereMesh = new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshNormalMaterial())
    sphereMesh.castShadow = true
    scene.add(sphereMesh)
    const sphereBody = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(-2, 5, 0).setCanSleep(false))
    const sphereShape = RAPIER.ColliderDesc.ball(1).setMass(1).setRestitution(1.1)
    world.createCollider(sphereShape, sphereBody)
    dynamicBodies.push([sphereMesh, sphereBody])

    // Cylinder Collider
    const cylinderMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2, 16), new THREE.MeshNormalMaterial())
    cylinderMesh.castShadow = true
    scene.add(cylinderMesh)
    const cylinderBody = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 5, 0).setCanSleep(false))
    const cylinderShape = RAPIER.ColliderDesc.cylinder(1, 1).setMass(1).setRestitution(1.1)
    world.createCollider(cylinderShape, cylinderBody)
    for(let i=0; i<10; i++) {
        dynamicBodies.push([cylinderMesh, cylinderBody])
    }
    console.log(dynamicBodies)

    // GROUND_PLANE
    const floor_texture = new THREE.TextureLoader().load('../../assets/textures/concrete/concrete_Blocks_012_basecolor.jpg')
    const floor_material = new THREE.MeshBasicMaterial( {color: 0xf3dfff, map: floor_texture} )

    const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(100, 1, 100), floor_material)
    floorMesh.receiveShadow = true
    floorMesh.position.y = -1
    scene.add(floorMesh)
    const floorBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -1, 0))
    const floorShape = RAPIER.ColliderDesc.cuboid(50, 0.5, 50)
    world.createCollider(floorShape, floorBody)

    // GRASS 
    Grass(floorMesh, scene)

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

    // CONTROLS

    const player = new FirstPersonControls(camera, renderer.domElement)
    player.lookSpeed = 0.008
    player.movementSpeed = 0.1
    player.verticalMin = Math.PI / 0.1
    player.verticalMax = Math.PI / 0.1
    const controls = new PointerLockControls(camera, renderer.domElement)
    scene.add(controls.object)
    const velocity = new THREE.Vector3()
    const direction = new THREE.Vector3()

    document.addEventListener('keydown', onKeyDown);
    
    function onKeyDown() {
        const menu = document.getElementById('escape-container')
        switch (event.keyCode) {
            case 27:
                  if(menu.style.display == 'none') {
                      menu.style.display = 'block'
                      player.lookSpeed = 0
                  } else {
                      menu.style.display ='none'
                      player.lookSpeed = 0.008
                  }
              break;
            // Add more cases for other key codes if needed
          }
    }

    const clock = new THREE.Clock()
    let delta

    function animate() {
    requestAnimationFrame(animate)  
    player.update(0.3)
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



