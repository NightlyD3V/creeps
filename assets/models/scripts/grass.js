import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// WebGPU has a 65536 byte uniform buffer limit. Each instance = 64 bytes.
// Max safe instances per InstancedMesh = 1000
const MAX_INSTANCES_PER_BATCH = 1000;

// Local helper to merge two BufferGeometries
const mergeTwoGeometries = (a, b) => {
    const posA = a.getAttribute('position').array;
    const posB = b.getAttribute('position').array;
    const countA = a.getAttribute('position').count;
    const countB = b.getAttribute('position').count;

    const hasNormal = !!a.getAttribute('normal') && !!b.getAttribute('normal');
    const hasUV = !!a.getAttribute('uv') && !!b.getAttribute('uv');

    const normalA = hasNormal ? a.getAttribute('normal').array : null;
    const normalB = hasNormal ? b.getAttribute('normal').array : null;
    const uvA = hasUV ? a.getAttribute('uv').array : null;
    const uvB = hasUV ? b.getAttribute('uv').array : null;

    const idxA = a.index ? a.index.array : null;
    const idxB = b.index ? b.index.array : null;

    const positions = new Float32Array(posA.length + posB.length);
    positions.set(posA, 0);
    positions.set(posB, posA.length);

    const normals = hasNormal ? new Float32Array(normalA.length + normalB.length) : null;
    if (hasNormal) {
        normals.set(normalA, 0);
        normals.set(normalB, normalA.length);
    }

    const uvs = hasUV ? new Float32Array(uvA.length + uvB.length) : null;
    if (hasUV) {
        uvs.set(uvA, 0);
        uvs.set(uvB, uvA.length);
    }

    const makeIndex = (idx, vertexCount) => {
        if (idx) return Array.from(idx);
        return Array.from({ length: vertexCount }, (v, i) => i);
    };
    const indicesA = makeIndex(idxA, countA);
    const indicesB = makeIndex(idxB, countB).map(i => i + countA);
    const indices = new (positions.length / 3 > 65535 ? Uint32Array : Uint16Array)(indicesA.length + indicesB.length);
    indices.set(indicesA, 0);
    indices.set(indicesB, indicesA.length);

    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    if (hasNormal) out.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    if (hasUV) out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    out.setIndex(new THREE.BufferAttribute(indices, 1));
    return out;
};

export default class Grass {
    constructor(scene, renderer, camera = null) {
        this.scene = scene;
        this.renderer = renderer;
        this.camera = camera;
        this.time = 0;
        this.lodMid = 40; // Only animate grass within 40 units of camera
        this.grassYOffset = 0.02;
        this.midPlaneWidthScale = 1.0;
        this.midPlaneHeightScale = 1.8;

        // Arrays to hold batched meshes
        this.midMeshes = [];
        this.midBatchData = []; // { positions, rot, scale, jitter, count } per batch

        const loader = new GLTFLoader();

        loader.load('/assets/models/grass_patch.glb', (gltf) => {
            // Tuneable parameters - balanced for performance
            const groundSize = 1000;
            const patchGrid = 20; 
            const bladesPerPatchGrid = 5; 
            const extraPerBlade = 6; // Reduced from 6

            // Calculate total grass instances we want
            const bladesPerPatch = bladesPerPatchGrid * bladesPerPatchGrid;
            const totalWanted = patchGrid * patchGrid * bladesPerPatch * (1 + extraPerBlade);
            console.log(`Grass: Creating ~${totalWanted} grass instances in batches of ${MAX_INSTANCES_PER_BATCH}`);

            // Create procedural ground texture for base coverage
            this.createGroundPlane(groundSize);

            // Generate all grass positions first
            const allPositions = [];
            const half = groundSize / 2;
            const patchSize = groundSize / patchGrid;

            // Create shuffled patch list
            const patches = [];
            for (let pr = 0; pr < patchGrid; pr++) {
                for (let pc = 0; pc < patchGrid; pc++) {
                    patches.push({ pr, pc });
                }
            }
            // Fisher-Yates shuffle
            for (let i = patches.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [patches[i], patches[j]] = [patches[j], patches[i]];
            }

            // Generate positions for all grass
            for (const patch of patches) {
                const { pr, pc } = patch;
                const cx = pc * patchSize - half;
                const cz = pr * patchSize - half;

                const bladesInThisPatch = Math.floor(bladesPerPatch * (0.5 + Math.random() * 0.5));

                for (let b = 0; b < bladesInThisPatch; b++) {
                    const randomX = cx + (Math.random() - 0.5) * patchSize;
                    const randomZ = cz + (Math.random() - 0.5) * patchSize;

                    const spawnCount = 1 + Math.floor(extraPerBlade * (0.6 + Math.random() * 0.4));
                    for (let s = 0; s < spawnCount; s++) {
                        const jitterX = (Math.random() - 0.5) * patchSize * 0.3;
                        const jitterZ = (Math.random() - 0.5) * patchSize * 0.3;
                        const x = randomX + jitterX;
                        const z = randomZ + jitterZ;
                        const y = 0.0; // Exactly at ground level - geometry pivot is at bottom
                        const ry = Math.random() * Math.PI * 2;
                        const scale = 2.0 + Math.random() * 2.0; // Shorter grass
                        const jitter = Math.random() * Math.PI * 2;

                        allPositions.push({ x, y, z, ry, scale, jitter });
                    }
                }
            }

            console.log(`Grass: Generated ${allPositions.length} positions`);

            // Create merged crossed-plane geometry (two planes at 90 degrees)
            // Pivot at bottom so grass grows up from ground level
            const planeA = new THREE.PlaneGeometry(1, 1);
            planeA.translate(0, 0.5, 0); // Bottom edge at y=0
            
            const planeB = new THREE.PlaneGeometry(1, 1);
            planeB.translate(0, 0.5, 0); // Bottom edge at y=0 BEFORE rotation
            planeB.rotateY(Math.PI / 2); // Then rotate around Y axis
            
            // Adjust UVs to only use bottom half of texture (grass is duplicated top/bottom)
            // UV y=0 is bottom of texture, y=0.5 is middle, y=1 is top
            // We want to map plane's full height (0-1) to texture's bottom half (0-0.5)
            const adjustUVs = (geom) => {
                const uvs = geom.attributes.uv;
                for (let i = 0; i < uvs.count; i++) {
                    const v = uvs.getY(i);
                    uvs.setY(i, v * 0.5); // Scale V from 0-1 to 0-0.5
                }
                uvs.needsUpdate = true;
            };
            adjustUVs(planeA);
            adjustUVs(planeB);
            
            const crossedGeom = mergeTwoGeometries(planeA, planeB);

            // Create shared material
            const midMat = new THREE.MeshStandardMaterial({
                color: 0x2e7d32,
                alphaTest: 0.45,
                side: THREE.DoubleSide,
                transparent: false,
                roughness: 1.0,
                metalness: 0.0,
                depthWrite: true,
                depthTest: true
            });
            this.midMaterial = midMat;

            // Create batched InstancedMeshes
            const numBatches = Math.ceil(allPositions.length / MAX_INSTANCES_PER_BATCH);
            const tmpDummy = new THREE.Object3D();

            for (let batch = 0; batch < numBatches; batch++) {
                const startIdx = batch * MAX_INSTANCES_PER_BATCH;
                const endIdx = Math.min(startIdx + MAX_INSTANCES_PER_BATCH, allPositions.length);
                const batchCount = endIdx - startIdx;

                // Create InstancedMesh for this batch
                const mesh = new THREE.InstancedMesh(crossedGeom, midMat, batchCount);
                mesh.frustumCulled = true;
                mesh.renderOrder = 1;

                // Store batch data for animation
                const batchPositions = new Float32Array(batchCount * 3);
                const batchRot = new Float32Array(batchCount);
                const batchScale = new Float32Array(batchCount);
                const batchJitter = new Float32Array(batchCount);

                // Set instance matrices
                for (let i = 0; i < batchCount; i++) {
                    const pos = allPositions[startIdx + i];

                    tmpDummy.position.set(pos.x, pos.y, pos.z);
                    tmpDummy.rotation.set(0, pos.ry, 0);
                    tmpDummy.scale.set(
                        pos.scale * this.midPlaneWidthScale,
                        pos.scale * this.midPlaneHeightScale,
                        1
                    );
                    tmpDummy.updateMatrix();
                    mesh.setMatrixAt(i, tmpDummy.matrix);

                    // Store for animation
                    batchPositions[i * 3 + 0] = pos.x;
                    batchPositions[i * 3 + 1] = pos.y;
                    batchPositions[i * 3 + 2] = pos.z;
                    batchRot[i] = pos.ry;
                    batchScale[i] = pos.scale;
                    batchJitter[i] = pos.jitter;
                }

                mesh.instanceMatrix.needsUpdate = true;
                this.scene.add(mesh);
                this.midMeshes.push(mesh);
                this.midBatchData.push({
                    positions: batchPositions,
                    rot: batchRot,
                    scale: batchScale,
                    jitter: batchJitter,
                    count: batchCount
                });
            }

            console.log(`Grass: Created ${numBatches} batched meshes with ${allPositions.length} total instances`);

            // Load grass atlas texture
            this.loadGrassTexture(midMat);

        }, undefined, (error) => {
            console.error('Failed to load grass model:', error);
        });

        this.dummy = new THREE.Object3D();
        this._animateIndex = 0;
    }

    createGroundPlane(groundSize) {
        // Create procedural grass texture for ground coverage
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#2b6b2b';
        ctx.fillRect(0, 0, 1024, 1024);

        // Draw grass blades
        for (let i = 0; i < 12000; i++) {
            const x = Math.random() * 1024;
            const y = Math.random() * 1024;
            const h = 6 + Math.random() * 18;
            const w = 1 + Math.random() * 3;
            const angle = (Math.random() - 0.5) * 0.6;

            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle);

            const g = ctx.createLinearGradient(0, 0, 0, -h);
            const hue = 100 + Math.floor(Math.random() * 40);
            g.addColorStop(0, `hsl(${hue}, 60%, ${30 + Math.random() * 20}%)`);
            g.addColorStop(1, `hsl(${hue}, 60%, ${50 + Math.random() * 20}%)`);
            ctx.fillStyle = g;

            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(w * 0.5, -h * 0.4, 0, -h);
            ctx.quadraticCurveTo(-w * 0.5, -h * 0.4, 0, 0);
            ctx.fill();
            ctx.restore();
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(70, 70);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;

        const groundMat = new THREE.MeshStandardMaterial({
            map: tex,
            alphaTest: 0.45,
            side: THREE.DoubleSide,
            roughness: 1.0,
            metalness: 0.0
        });

        const groundPlane = new THREE.Mesh(
            new THREE.PlaneGeometry(groundSize, groundSize),
            groundMat
        );
        groundPlane.rotation.x = -Math.PI / 2;
        groundPlane.position.y = 0.0; // At ground level
        groundPlane.receiveShadow = false;
        this.scene.add(groundPlane);
    }

    loadGrassTexture(material) {
        const texLoader = new THREE.TextureLoader();

        const tryLoad = (size, onFail) => {
            texLoader.load(
                `/assets/materials/grass/grass_atlas_${size}.png`,
                (atlas) => {
                    atlas.wrapS = THREE.RepeatWrapping;
                    atlas.wrapT = THREE.RepeatWrapping;
                    atlas.colorSpace = THREE.SRGBColorSpace;

                    // Use canvas to ensure proper GPU upload
                    try {
                        const img = atlas.image;
                        const cvs = document.createElement('canvas');
                        cvs.width = img.width;
                        cvs.height = img.height;
                        const ctx = cvs.getContext('2d');
                        ctx.drawImage(img, 0, 0);

                        const canvasTex = new THREE.CanvasTexture(cvs);
                        canvasTex.wrapS = THREE.RepeatWrapping;
                        canvasTex.wrapT = THREE.RepeatWrapping;
                        canvasTex.colorSpace = THREE.SRGBColorSpace;
                        canvasTex.generateMipmaps = true;
                        canvasTex.minFilter = THREE.LinearMipmapLinearFilter;
                        canvasTex.needsUpdate = true;

                        material.map = canvasTex;
                        material.alphaTest = 0.45;
                        material.transparent = false;
                        material.depthWrite = true;
                        material.needsUpdate = true;

                        console.log(`Grass: Loaded ${size}px atlas texture`);
                    } catch (e) {
                        material.map = atlas;
                        material.needsUpdate = true;
                    }
                },
                undefined,
                onFail
            );
        };

        // Try 1024 first, then 512
        tryLoad('1024', () => {
            tryLoad('512', () => {
                console.warn('Grass: Failed to load atlas, using flat color');
            });
        });
    }

    update(deltaTime) {
        if (this.midMeshes.length === 0) return;

        this.time += deltaTime;
        const t = this.time;
        const tmp = this.dummy;

        // Get camera position for LOD
        const cameraPos = this.camera ? this.camera.position : null;
        const lodDistSq = this.lodMid * this.lodMid;

        // Update ALL batches every frame, but only nearby grass animates
        // This is smooth because all grass updates together
        for (let b = 0; b < this.midMeshes.length; b++) {
            const mesh = this.midMeshes[b];
            const data = this.midBatchData[b];
            const count = data.count;
            let needsUpdate = false;

            for (let i = 0; i < count; i++) {
                const mx = data.positions[i * 3 + 0];
                const my = data.positions[i * 3 + 1];
                const mz = data.positions[i * 3 + 2];
                const baseYaw = data.rot[i];
                const jitter = data.jitter[i];
                const scale = data.scale[i];

                // LOD check - only animate nearby grass
                if (cameraPos) {
                    const dx = mx - cameraPos.x;
                    const dz = mz - cameraPos.z;
                    const distSq = dx * dx + dz * dz;
                    
                    if (distSq < lodDistSq) {
                        // Animate nearby grass with smooth sine wave
                        const sway = Math.sin(t * 1.5 + jitter) * 0.06;
                        
                        tmp.position.set(mx, my, mz);
                        tmp.rotation.set(0, baseYaw + sway, sway * 0.4);
                        tmp.scale.set(
                            scale * this.midPlaneWidthScale,
                            scale * this.midPlaneHeightScale,
                            1
                        );
                        tmp.updateMatrix();
                        mesh.setMatrixAt(i, tmp.matrix);
                        needsUpdate = true;
                    }
                    // Distant grass stays static (matrix already set at init)
                }
            }

            if (needsUpdate) {
                mesh.instanceMatrix.needsUpdate = true;
            }
        }
    }
}
