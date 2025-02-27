import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/Addons.js'

export function Enemy(scene, camera) {
    const loader = new GLTFLoader();
    loader.load('/assets/models/hand.glb', (gltf) => {
        const hand = gltf.scene.children[0]
        hand.position.x = 0
        hand.position.y = 3
        hand.position.z = 0
        scene.add(hand)

        // RAYCAST TO CHECK FOR OBSTACLES
        
        // FOLLOW PLAYER 
        const directionVector = new THREE.Vector3();
        const moveSpeed = 0.03
        const stopDistance = 4
        
        function animate() {
            if(hand.position.distanceTo(camera.position) > stopDistance) {
                directionVector.subVectors(camera.position, hand.position).normalize()
                hand.position.addScaledVector(directionVector,moveSpeed)
                hand.lookAt(camera.position)
            } else {
                console.log("GAME OVER")
            }
            requestAnimationFrame(animate)
        }
        animate()
    })
}

/* NEED TO IMPLEMENT A STATE MACHINE 
        -> seek player
        --> avoid obstacles 
        ---> attack player
        ----> Line of sight loss repeat seek
*/