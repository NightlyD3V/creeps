import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

export function Grass(ground, scene) {
    // Need to implement instancedBufferGeometry.
    const loader = new GLTFLoader()
    loader.load('/assets/models/grass.glb', (gltf) => {
        console.log(gltf)
        scene.add(gltf.scene)
        const originalMesh = gltf.scene.children[0]
        
        // Array to store transformation data 
        const instancePositions = []
        for(let i = 0; i < 5; i++) {
            instancePositions.push(new THREE.Vector3(Math.random() * 10, 0, Math.random() * 10));
        }

        console.log(instancePositions)

        // Allocate space on gpu
        const gpu_array = new Float32Array(instancePositions.length * 3)
        
        let index = 0
        for (const position of instancePositions) {
            gpu_array[index++] = position.x
            gpu_array[index++] = position.y
            gpu_array[index++] = position.z
        }

        // Create an attribute to store the instance positions
        const positionAttribute = new THREE.InstancedBufferAttribute(gpu_array, 3)

        // Create the InstancedBufferGeo
        const instancedGeo = new THREE.InstancedBufferGeometry()
        instancedGeo.setAttribute('position', originalMesh.geometry.attributes.position.clone())
       
        console.log(instancedGeo.attributes.position)
        instancedGeo.instanceCount = instancePositions.length
        // instancedGeo.attributes.position = gltf.scene.position
        // instancedGeo.attributes.instancePositions = positionAttribute

        // Create a material
        const material = originalMesh.material.clone()

        // Create the InstancedMesh
        const instancedMesh = new THREE.InstancedMesh(instancedGeo, material, instancePositions.length); // 1000 instances

        // Add the mesh to the scene
        scene.add(instancedMesh);
    }) 
}