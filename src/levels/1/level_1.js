import * as THREE from 'three'
import FirstPersonController from '../../classes/FirstPersonController';
import { deltaTime } from 'three/tsl';

const rain_sound = document.getElementById('rain-sound');

// THREEJS
// INIT
const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer();
renderer.shadowMap.enabled = true;
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
const player = new THREE.Object3D();
scene.add(player);
player.add(camera); // Add the camera as a child of the player
camera.position.set(0, 1.6, 0); // Adjust camera height (eye level)
camera.rotation.order = 'YXZ'; // Important for correct rotation order
const controller = new FirstPersonController(camera, renderer.domElement); // Pass the camera and renderer's DOM element
camera.position.z = 50;
renderer.setSize( window.innerWidth, window.innerHeight );
document.body.appendChild( renderer.domElement );

rain_sound.play()

// Lights - 3-Point Lighting Setup

// 1. Key Light (Main light, strong, directional)
const keyLight = new THREE.DirectionalLight(0xffffff, 0.8); // White, 80% intensity
keyLight.position.set(5, 5, 5); // From the side and slightly above
scene.add(keyLight);

// 2. Fill Light (Softens shadows, opposite side of key)
const fillLight = new THREE.DirectionalLight(0xffffff, 0.4); // White, 40% intensity
fillLight.position.set(-3, 1, 3); // Opposite side, less intense
scene.add(fillLight);

// 3. Back Light (Separates object from background)
const backLight = new THREE.DirectionalLight(0xffffff, 0.2); // White, 20% intensity
backLight.position.set(0, 3, -5); // Behind the sphere
scene.add(backLight);

// Add shadows to the lights:
keyLight.castShadow = true;
fillLight.castShadow = true;
backLight.castShadow = true;

// Ground Plane
const groundGeometry = new THREE.PlaneGeometry(200, 200, 10, 10); // Adjust size and segments
const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x808080 }); // Gray color
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true; // Ground receives shadows
ground.position.y = -1;
scene.add(ground);

// SPHERE GEO
const earthGroup = new THREE.Group();
earthGroup.rotation.z = -23.4 * Math.PI/ 100;
const loader = new THREE.TextureLoader()
const geometry = new THREE.IcosahedronGeometry( 2, 24, 1 ); // Or any other geometry
const material = new THREE.MeshStandardMaterial({
   map: loader.load("./assets/textures/8k_earth_daymap-signed.jpg"),
});
// CLOUDS
const cloudsMat = new THREE.MeshStandardMaterial({
    map: loader.load("./assets/textures/8k_earth_clouds.jpg"),
    blending: THREE.AdditiveBlending
})


// APPEND TO SCENE
const cloudMesh = new THREE.Mesh(geometry, cloudsMat)
cloudMesh.scale.setScalar(1.01)
earthGroup.add(cloudMesh)

const earthMesh = new THREE.Mesh( geometry, material );
earthGroup.add( earthMesh )
scene.add( earthGroup )

function animate() {
    requestAnimationFrame( animate );
    earthGroup.rotation.y += 0.001;
    cloudMesh.rotation.y += 0.0008; 
    
    controller.update(deltaTime)
    renderer.render( scene, camera );
}

animate();
