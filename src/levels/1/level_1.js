import * as THREE from 'three'
import FirstPersonController from '../../classes/FirstPersonController';
import { deltaTime } from 'three/tsl';

const rain_sound = document.getElementById('rain-sound');

// RAPIER PHYSICS!
// INIT 
import('@dimforge/rapier3d').then(RAPIER => {
    // Use the RAPIER module here.
    let gravity = { x: 0.0, y: -9.81, z: 0.0 };
    let world = new RAPIER.World(gravity);
    const { vertices, colors } = world.debugRender();

    const dynamicBodies = []


    const scene = new THREE.Scene()

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

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100)
    camera.position.set(0, 2, 5)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.VSMShadowMap
    document.body.appendChild(renderer.domElement)

    window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
    })

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
    dynamicBodies.push([cylinderMesh, cylinderBody])


    
    const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(100, 1, 100), new THREE.MeshPhongMaterial())
    floorMesh.receiveShadow = true
    floorMesh.position.y = -1
    scene.add(floorMesh)
    const floorBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -1, 0))
    const floorShape = RAPIER.ColliderDesc.cuboid(50, 0.5, 50)
    world.createCollider(floorShape, floorBody)

    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()

    renderer.domElement.addEventListener('click', (e) => {
      mouse.set(
        (e.clientX / renderer.domElement.clientWidth) * 2 - 1,
        -(e.clientY / renderer.domElement.clientHeight) * 2 + 1
      )

      raycaster.setFromCamera(mouse, camera)

      const intersects = raycaster.intersectObjects(
        [cubeMesh, sphereMesh, cylinderMesh, icosahedronMesh, torusKnotMesh],
        false
      )

      if (intersects.length) {
        dynamicBodies.forEach((b) => {
          b[0] === intersects[0].object && b[1].applyImpulse(new RAPIER.Vector3(0, 10, 0), true)
        })
      }
    })

    const clock = new THREE.Clock()
    let delta

    function animate() {
    requestAnimationFrame(animate)

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

rain_sound.play()


