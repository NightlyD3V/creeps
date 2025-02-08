import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
// import basicVertexShader from './shaders/vertex.glsl?raw'; // The ?raw import is crucial
// import basicFragmentShader from './shaders/fragment.glsl?raw';

// INIT
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
const renderer = new THREE.WebGLRenderer();
camera.position.z = 50;
renderer.setSize( window.innerWidth, window.innerHeight );
document.body.appendChild( renderer.domElement );

// CONTROLS
const controls = new OrbitControls( camera, renderer.domElement );
controls.enableDamping = true
controls.dampingFactor = 0.01

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
    if (camera.position.z > 4) {
        camera.position.z -= 0.05;
    } else {
        console.log("Animation COMPLETE!")
    }
    controls.update()
    renderer.render( scene, camera );
}

animate();
