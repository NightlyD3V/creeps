import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export function Trees(ground, scene, world, RAPIER) {
    const loader = new GLTFLoader();
    const treeCount = 50;
    const treePositions = []; // Store positions for colliders

    loader.load('/assets/models/cracked_tree.glb', (gltf) => {
        const trees = gltf.scene.children[0];
        
        // Get the bounding box to determine tree size
        const bbox = new THREE.Box3().setFromObject(gltf.scene);
        const size = new THREE.Vector3();
        bbox.getSize(size);
        console.log('Tree size:', size);
        
        // Calculate collider dimensions from tree mesh
        const treeHeight = size.y;
        const treeRadius = Math.max(size.x, size.z) * 0.15; // Trunk is roughly 15% of tree width

        const textureLoader = new THREE.TextureLoader();
        textureLoader.load('/assets/materials/cracked-tree/base_color.png', function(texture) {
            const treeMaterial = new THREE.MeshStandardMaterial({
                color: 0x964C01,
                map: texture
            });
            
            const mesh = new THREE.InstancedMesh(trees.geometry.clone(), treeMaterial, treeCount);
            scene.add(mesh);
            
            const dummy = new THREE.Object3D();
            
            for (let i = 0; i < treeCount; i++) {
                const angle = Math.random() * Math.PI * 2;
                const radius = 20 + Math.random() * 80;
                const x = Math.cos(angle) * radius;
                const z = Math.sin(angle) * radius;
                const scale = 0.9 + Math.random() * 0.3;
                
                dummy.position.set(x, 0, z);
                dummy.rotation.y = Math.random() * Math.PI * 2;
                dummy.scale.setScalar(scale);
                dummy.updateMatrix();
                mesh.setMatrixAt(i, dummy.matrix);
                
                treePositions.push({ x, z, scale });
            }
            
            mesh.instanceMatrix.needsUpdate = true;
            
            // Create static rigid body colliders for all trees
            if (world && RAPIER) {
                for (const pos of treePositions) {
                    // Scale collider based on tree instance scale + extra padding for camera
                    const scaledHeight = treeHeight * pos.scale * 0.5;
                    const scaledRadius = (treeRadius * pos.scale) + 0.8; // Extra padding
                    
                    // Create a fixed (static) rigid body for each tree
                    const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed()
                        .setTranslation(pos.x, scaledHeight, pos.z);
                    const rigidBody = world.createRigidBody(rigidBodyDesc);
                    
                    // Attach cylinder collider to the rigid body (half-height, radius)
                    const colliderDesc = RAPIER.ColliderDesc.cylinder(scaledHeight, scaledRadius);
                    world.createCollider(colliderDesc, rigidBody);
                }
            }
        });
    });
}