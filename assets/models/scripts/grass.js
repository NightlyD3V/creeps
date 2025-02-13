import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export function Grass(ground, scene) {
    const loader = new GLTFLoader();

    loader.load('/assets/models/grass_patch.glb', (gltf) => {
        const grass = gltf.scene.children[0];

        // GRASS WAVE SHADER
        // const customShader = new THREE.ShaderMaterial({
        //     vertexShader: `
        //         void main() {
        //             gl_Positions = projectionMatrix * modelViewMatrix * vec4( position, 1.0;)
        //         };
        //     `,
        //     fragmentSahder:`
        //         void main() {
        //              gl_FragColor = vec4(1.0,0.0,0.0,1.0;)
        //         };
            
        //     `
        // })

        const mesh = new THREE.InstancedMesh(grass.geometry.clone(), grass.material.clone(), 90000)
        scene.add(mesh)

        const positions = new THREE.Object3D()
        for(let i=0; i<90000; i++) {
            positions.position.x = Math.random() * 100 - 50
            positions.position.y = 0
            positions.position.z = Math.random() * 100 - 50

            positions.updateMatrix()
            mesh.setMatrixAt(i, positions.matrix)
        }
    })
}