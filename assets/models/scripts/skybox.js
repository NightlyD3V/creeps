import * as THREE from 'three'
// SKYBOX
export function Skybox(scene) {
       // Load skybox textures
const textureLoader = new THREE.CubeTextureLoader();
const texture = textureLoader.load([
    '../../../assets/materials/skybox/top.jpg', // Replace with your texture paths
    '../../../assets/materials/skybox/bottom.jpg',
    '../../../assets/materials/skybox/left.jpg',
    '../../../assets/materials/skybox/right.jpg',
    '../../../assets/materials/skybox/back.jpg',
    '../../../assets/materials/skybox/front.jpg'
]);

// Set scene background
scene.background = texture;
}