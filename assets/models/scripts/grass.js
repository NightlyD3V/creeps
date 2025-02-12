import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export function Grass(ground, scene) {
    const loader = new GLTFLoader();

    loader.load('/assets/models/grass.glb', (gltf) => {
        const grass = gltf.scene.children[0];

        const mesh = new THREE.InstancedMesh(grass.geometry.clone(), grass.material.clone(), 50000)
        scene.add(mesh)

        const positions = new THREE.Object3D()
        for(let i=0; i<50000; i++) {
            positions.position.x = Math.random() * 100 - 50
            positions.position.y = 0
            positions.position.z = Math.random() * 100 - 50

            positions.updateMatrix()
            mesh.setMatrixAt(i, positions.matrix)
        }
    })
}