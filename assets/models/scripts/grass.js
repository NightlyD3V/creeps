import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export function Grass(ground, scene, uniforms) {
    const loader = new GLTFLoader();

    loader.load('/assets/models/grass_patch.glb', (gltf) => {
        const grass = gltf.scene.children[0];

        // GRASS WAVE SHADER
        const vertexShader = `
        varying vec2 vUv;
        uniform float time;
        
            void main() {

            vUv = uv;
            
            // VERTEX POSITION
            
            vec4 mvPosition = vec4( position, 0.3 );
            #ifdef USE_INSTANCING
                mvPosition = instanceMatrix * mvPosition;
            #endif
            
            // DISPLACEMENT
            
            // here the displacement is made stronger on the blades tips.
            float dispPower = 1.0 - sin( uv.y * 3.1416 / 2.0 );
            
            float displacement = sin( mvPosition.z + time * 5.0 ) * ( 0.1 * dispPower );
            mvPosition.z += displacement;
            
            //
            
            vec4 modelViewPosition = modelViewMatrix * mvPosition;
            gl_Position = projectionMatrix * modelViewPosition;

            }
        `;

        const fragmentShader = `
        varying vec2 vUv;
        
        void main() {
            vec3 baseColor = vec3( 0.41, 1.0, 0.5 );
            float clarity = ( vUv.y * 0.5 ) + 0.5;
            gl_FragColor = vec4( baseColor * clarity, 1 );
        }
        `;
        const customShader = new THREE.ShaderMaterial({
            vertexShader, 
            fragmentShader, 
            side: THREE.DoubleSide,
            uniforms
        })
        // END SHADER

        const mesh = new THREE.InstancedMesh(grass.geometry.clone(), customShader, 90000)
        scene.add(mesh)

        const positions = new THREE.Object3D()
        for(let i=0; i<90000; i++) {
            positions.position.x = Math.random() * 1000 - 50
            positions.rotation.y = Math.random() * 1000 - 50
            positions.position.y = 0
            positions.position.z = Math.random() * 1000 - 50

            positions.updateMatrix()
            mesh.setMatrixAt(i, positions.matrix)
        }
        return customShader;
    })
}