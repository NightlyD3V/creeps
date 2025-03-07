import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export function Trees(ground, scene) {
    const loader = new GLTFLoader();

    loader.load('/assets/models/cracked_tree.glb', (gltf) => {
        const trees = gltf.scene.children[0]

       const textureLoader = new THREE.TextureLoader()
           textureLoader.load('/assets/materials/cracked-tree/base_color.png', function(texture) {
             const floor_material = new THREE.MeshStandardMaterial({
               color: 0x964C01,
               map: texture
            })
            const mesh = new THREE.InstancedMesh(trees.geometry.clone(), floor_material, 5)
            scene.add(mesh)
            const positions = new THREE.Object3D()
            for(let i=0; i<5; i++) {
                positions.position.x = Math.random() * 100 - 50
                positions.position.y = 0
                positions.position.z = Math.random() * 100 - 50
    
                positions.updateMatrix()
                mesh.setMatrixAt(i, positions.matrix)
            }
        })

    })
}