import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/Addons.js'

export function enemy() {
    const loader = new GLTFLoader();

    loader.load('/assets/models/creep.glb', (gltf) => {
        const creep = gltf.scene.children[0]

        scene.add(creep)
    })
}