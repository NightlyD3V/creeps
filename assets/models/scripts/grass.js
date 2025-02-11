import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

export function Grass(ground, scene) {
    // Need to implement instancedBufferGeometry.
    const loader = new GLTFLoader()
    loader.load('../grass.glb', (gltf) => {
        console.log(gltf)
        scene.add(gltf.scene)
        // const model = gltf.scene.children[0]
        // // 1. Get the geometry from the GLTF model
        // const originalGeometry = model.geometry;

        // // 2. Create the InstancedBufferGeometry
        // const instancedGeometry = new THREE.InstancedBufferGeometry();

        // // Copy attributes from the original geometry
        // const attributes = originalGeometry.attributes;
        // for (const name in attributes) {
        //     instancedGeometry.setAttribute(name, attributes[name].clone());
        // }
        // instancedGeometry.index = originalGeometry.index ? originalGeometry.index.clone() : null; // Important: Copy the index!

        // // 3. Create the instance matrix attribute
        // const numInstances = 1000; // Example number of instances
        // const instanceMatrix = new THREE.InstancedBufferAttribute(new Float32Array(numInstances * 16), 16);
        // instancedGeometry.setAttribute('instanceMatrix', instanceMatrix);

        // // 4. Populate the instance matrix attribute
        // for (let i = 0; i < numInstances; i++) {
        //     const matrix = new THREE.Matrix4();

        //     // Example transformations (customize as needed)
        //     const x = (i % 20) * 2 - 19;
        //     const z = Math.floor(i / 20) * 2 - 19;
        //     matrix.translate(new THREE.Vector3(x, 0, z));
        //     matrix.scale(new THREE.Vector3(0.5 + Math.random()*0.5, 0.5 + Math.random()*0.5, 0.5 + Math.random()*0.5));
        //     matrix.rotateY(Math.random() * Math.PI * 2);


        //     matrix.toArray(instanceMatrix.array, i * 16);
        // }
        // instanceMatrix.needsUpdate = true;

        // // 5. Create the material (you can use the original material or a new one)
        // const material = model.material.clone(); // Clone the original material! Important!
        // // or
        // //const material = new THREE.MeshStandardMaterial({ color: 0xffa500 }); // Or create a new material

        // // 6. Create the instanced mesh
        // const mesh = new THREE.Mesh(instancedGeometry, material);
        // scene.add(mesh);
    }) 
}