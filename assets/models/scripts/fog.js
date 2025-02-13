import * as THREE from 'three'

export function Fog(scene) {
    scene.fog = new THREE.Fog(0xDFE9F3, 0.0, 100.0)
}