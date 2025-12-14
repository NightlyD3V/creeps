import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export function Trees(ground, scene, world, RAPIER) {
    const loader = new GLTFLoader();
    const textureLoader = new THREE.TextureLoader();
    const treeCount = 500; // Reduced for performance

    // Load PBR tree textures
    const diffuseTex = textureLoader.load('/assets/materials/trees/T_Autumn_D.png');
    const normalTex = textureLoader.load('/assets/materials/trees/T_Autumn_N_1.png');
    const opacityTex = textureLoader.load('/assets/materials/trees/T_Autumn_OP_1.png');
    
    // Set texture properties for GLTF compatibility
    diffuseTex.flipY = false;
    diffuseTex.colorSpace = THREE.SRGBColorSpace;
    
    normalTex.flipY = false;
    normalTex.colorSpace = THREE.LinearSRGBColorSpace;
    
    opacityTex.flipY = false;
    opacityTex.colorSpace = THREE.LinearSRGBColorSpace;

    // Create PBR material that reacts to scene lighting
    const treeMaterial = new THREE.MeshStandardMaterial({
        map: diffuseTex,
        normalMap: normalTex,
        normalScale: new THREE.Vector2(1.0, 1.0),
        alphaMap: opacityTex,
        alphaTest: 0.5,
        side: THREE.DoubleSide,
        roughness: 0.8,
        metalness: 0.0,
    });

    // Spawn positions config
    const playerSpawnPos = { x: 0, z: 0 };
    const aiSpawnPos = { x: -30, z: -30 };
    const exclusionRadius = 15;

    // Pre-generate tree positions
    const treePositions = [];
    for (let i = 0; i < treeCount; i++) {
        let x, z, validPosition = false;
        while (!validPosition) {
            const angle = Math.random() * Math.PI * 2;
            const radius = 25 + Math.random() * 500; // Wider spread for more trees
            x = Math.cos(angle) * radius;
            z = Math.sin(angle) * radius;

            const distToPlayer = Math.sqrt((x - playerSpawnPos.x) ** 2 + (z - playerSpawnPos.z) ** 2);
            const distToAI = Math.sqrt((x - aiSpawnPos.x) ** 2 + (z - aiSpawnPos.z) ** 2);

            if (distToPlayer >= exclusionRadius && distToAI >= exclusionRadius) {
                validPosition = true;
            }
        }
        const scaleVariation = 0.85 + Math.random() * 0.3;
        const rotY = Math.random() * Math.PI * 2;
        treePositions.push({ x, z, scale: scaleVariation, rotY });
    }

    loader.load('/assets/models/SM_Autumn_02.gltf', (gltf) => {
        console.log('GLTF loaded successfully');

        const originalScene = gltf.scene;

        // Compute bounding box for positioning above ground
        const bbox = new THREE.Box3().setFromObject(originalScene);
        const size = new THREE.Vector3();
        bbox.getSize(size);
        console.log('Tree model size:', size, 'bbox.min.y:', bbox.min.y);

        // Scale down proportionally: model is ~1800 units, we want ~35 units (larger trees)
        const uniformScale = 35 / size.y;
        const yOffset = -bbox.min.y * uniformScale;

        // Collect meshes with UVs (these are the textured parts)
        const meshesWithUVs = [];
        originalScene.traverse((child) => {
            if (child.isMesh && !child.name.startsWith('UCX_')) {
                if (child.geometry.attributes.uv) {
                    meshesWithUVs.push(child);
                }
            }
        });

        if (meshesWithUVs.length === 0) {
            console.error('No meshes with UVs found');
            return;
        }

        // Create an InstancedMesh for each mesh part that has UVs
        const instancedMeshes = [];
        const dummy = new THREE.Object3D();

        for (const sourceMesh of meshesWithUVs) {
            const geom = sourceMesh.geometry.clone();
            
            // Apply the mesh's local transform to geometry
            sourceMesh.updateWorldMatrix(true, false);
            geom.applyMatrix4(sourceMesh.matrixWorld);

            const instancedMesh = new THREE.InstancedMesh(geom, treeMaterial, treeCount);
            instancedMesh.frustumCulled = true;

            // Set instance matrices
            for (let i = 0; i < treeCount; i++) {
                const pos = treePositions[i];
                
                // Scale uniformly to preserve proportions
                const finalScale = uniformScale * pos.scale;
                dummy.position.set(pos.x, yOffset * pos.scale, pos.z);
                dummy.rotation.set(0, pos.rotY, 0);
                dummy.scale.setScalar(finalScale);
                dummy.updateMatrix();
                instancedMesh.setMatrixAt(i, dummy.matrix);
            }

            instancedMesh.instanceMatrix.needsUpdate = true;
            scene.add(instancedMesh);
            instancedMeshes.push(instancedMesh);
        }

        console.log(`Spawned ${treeCount} trees (${instancedMeshes.length} draw calls)`);

        // Create physics colliders for all trees
        if (world && RAPIER) {
            const baseHeight = 35; // Match tree height
            const baseRadius = 1.7; // Increased radius for bigger tree colliders
            
            for (const pos of treePositions) {
                const scaledHeight = baseHeight * pos.scale * 0.5;
                const scaledRadius = baseRadius * pos.scale;

                const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed()
                    .setTranslation(pos.x, scaledHeight, pos.z);
                const rigidBody = world.createRigidBody(rigidBodyDesc);

                const colliderDesc = RAPIER.ColliderDesc.cylinder(scaledHeight, scaledRadius);
                world.createCollider(colliderDesc, rigidBody);
            }
            
            console.log(`Created ${treeCount} tree colliders`);
        }
    }, 
    undefined,
    (err) => {
        console.error('Error loading trees:', err);
    });
}