import * as THREE from 'three'

export function Fog(scene) {
    scene.fog = new THREE.Fog(0xcccccc, 10, 100)
}