import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
// Local helper to merge two BufferGeometries without relying on external addon exports

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

    // build combined index
    const makeIndex = (idx, vertexCount) => {
        if (idx) return Array.from(idx);
        // generate sequential indices
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
        this.lodDistance = 150; // only animate nearest 3D blades within this distance from camera
        this.lodNear = 12; // within this distance keep highest-detail behavior
        this.lodMid = 120; // mid-range distance threshold for plane impostors
        this.grassYOffset = 0.02; // lower grass height
        ; // lift grass a bit above ground to avoid clipping
        this.midPlaneWidthScale = 1.0; // X-scale multiplier for mid-plane impostors
        this.midPlaneHeightScale = 1.8; // Y-scale multiplier for mid-plane impostors (lower)

        const loader = new GLTFLoader();
        const Textureloader = new KTX2Loader();
        Textureloader.setTranscoderPath('examples/jsm/libs/basis/');
        Textureloader.detectSupport(renderer);

       
        loader.load('/assets/models/grass_patch.glb', (gltf) => {
            const grass = gltf.scene.children[0];

            // Use a WebGPU-compatible built-in material and animate instances on CPU
            this.newMat = new THREE.MeshStandardMaterial({
                color: 0x2e7d32,
                side: THREE.DoubleSide,
                roughness: 1.0,
                metalness: 0.0,
                vertexColors: true
            });

            // Tuneable parameters
            const groundSize = 500; // area (matching ground box 500x500)
            const patchGrid = 20; // patches per side (controls how many patches across the ground)
            const bladesPerPatchGrid = 5; // reduced for better performance
            const extraPerBlade = 12; // more blades per clump for clumpier appearance
            const animateBatches = 4; // split animation into batches to reduce CPU per-frame work
            this.animateBatches = animateBatches;

            // Compute total instances and guard against runaway counts
            const bladesPerPatch = Math.max(1, bladesPerPatchGrid * bladesPerPatchGrid);
            const instanceCount = patchGrid * patchGrid * bladesPerPatch * (1 + Math.max(0, Math.floor(extraPerBlade)));
            const maxInstances = 200000; // safety cap
            const finalInstanceCount = Math.min(instanceCount, maxInstances);
            if (instanceCount > maxInstances) console.warn('Requested', instanceCount, 'instances; capping to', maxInstances);

            // Clone geometry and shift its base to y=0 so rotations pivot at the blade root
            const geom = grass.geometry.clone();
            geom.computeBoundingBox();
            if (geom.boundingBox) {
                const minY = geom.boundingBox.min.y;
                const translateMat = new THREE.Matrix4().makeTranslation(0, -minY, 0);
                geom.applyMatrix4(translateMat);
                geom.computeBoundingBox();
            }

            // Create a procedural tiled grass texture to cover the whole ground cheaply
            const createGrassCanvasTexture = (size = 512, blades = 1200) => {
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');

                // clear transparent background
                ctx.clearRect(0, 0, size, size);

                // base color (dark green)
                ctx.fillStyle = '#2b6b2b';
                ctx.fillRect(0, 0, size, size);

                // draw many small blades/clumps
                for (let i = 0; i < blades; i++) {
                    const x = Math.random() * size;
                    const y = Math.random() * size;
                    const h = 6 + Math.random() * 18; // blade height in pixels
                    const w = 1 + Math.random() * 3;
                    const angle = (Math.random() - 0.5) * 0.6;

                    ctx.save();
                    ctx.translate(x, y);
                    ctx.rotate(angle);

                    // gradient for blade
                    const g = ctx.createLinearGradient(0, 0, 0, -h);
                    const hue = 100 + Math.floor(Math.random() * 40);
                    g.addColorStop(0, `hsl(${hue}, 60%, ${30 + Math.random() * 20}%)`);
                    g.addColorStop(1, `hsl(${hue}, 60%, ${50 + Math.random() * 20}%)`);
                    ctx.fillStyle = g;

                    // draw a thin triangle/leaf
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.quadraticCurveTo(w * 0.5, -h * 0.4, 0, -h);
                    ctx.quadraticCurveTo(-w * 0.5, -h * 0.4, 0, 0);
                    ctx.fill();
                    ctx.restore();
                }

                // subtle noise overlay
                ctx.globalAlpha = 0.08;
                for (let i = 0; i < size * size * 0.002; i++) {
                    const x = Math.random() * size;
                    const y = Math.random() * size;
                    ctx.fillStyle = 'rgba(0,0,0,0.03)';
                    ctx.fillRect(x, y, 1, 1);
                }

                const tex = new THREE.CanvasTexture(canvas);
                tex.wrapS = THREE.RepeatWrapping;
                tex.wrapT = THREE.RepeatWrapping;
                tex.repeat.set(70, 70);
                tex.encoding = THREE.sRGBEncoding;
                tex.anisotropy = 4;
                tex.needsUpdate = true;
                return tex;
            };

            const grassTexture = createGrassCanvasTexture(1024, 12000);
            const groundGrassMat = new THREE.MeshStandardMaterial({
                map: grassTexture,
                alphaTest: 0.45,
                side: THREE.DoubleSide,
                roughness: 1.0,
                metalness: 0.0
            });
            const groundPlane = new THREE.Mesh(new THREE.PlaneGeometry(groundSize, groundSize), groundGrassMat);
            groundPlane.rotation.x = -Math.PI / 2;
            groundPlane.position.y = 0.01; // slightly above ground to avoid z-fighting
            groundPlane.receiveShadow = false;
            this.scene.add(groundPlane);

            // Ensure geometry has UVs (some flows may still expect them). If not, generate synthetic UVs from vertex Y.
            if (!geom.attributes.uv) {
                const pos = geom.attributes.position;
                const count = pos.count;
                const uvArray = new Float32Array(count * 2);
                let minY = Infinity, maxY = -Infinity;
                for (let i = 0; i < count; i++) {
                    const y = pos.getY(i);
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
                const range = Math.max(0.0001, maxY - minY);
                for (let i = 0; i < count; i++) {
                    const y = pos.getY(i);
                    const v = (y - minY) / range;
                    uvArray[i * 2] = 0;
                    uvArray[i * 2 + 1] = v;
                }
                geom.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));
            }

            // Prepare instance storage for CPU-driven animation
            this.instanceCount = finalInstanceCount;
            this.instancePositions = new Float32Array(finalInstanceCount * 3);
            this.instanceRotY = new Float32Array(finalInstanceCount);
            this.instanceHidden = new Uint8Array(finalInstanceCount); // 1 = hidden (use mid impostor), 0 = visible 3D blade
            this.instanceJitter = new Float32Array(finalInstanceCount);
            this.dummy = new THREE.Object3D();
            this._animateIndex = 0;

            // Now create the InstancedMesh — after material is fully prepared
            this.mesh = new THREE.InstancedMesh(
                geom,
                this.newMat,
                finalInstanceCount
            );

            this.mesh.scale.set(3, 3, 3);
            this.mesh.frustumCulled = true; // allow GPU frustum culling for better performance
            this.scene.add(this.mesh);

            // MID-LOD: prepare arrays to collect mid-plane instances (crossed planes)
            const midPositions = [];
            const midRot = [];
            const midScale = [];
            const midJitter = [];

            // Position instances with random patches (clumping) but randomized within-patch placement
            const patchCount = patchGrid; // patches per side
            const patchSize = groundSize / patchCount;
            const tmpDummy = new THREE.Object3D();
            let idx = 0;
            const half = groundSize / 2;

            // Create a list of patches and shuffle them for random clump distribution
            const patches = [];
            for (let pr = 0; pr < patchCount; pr++) {
                for (let pc = 0; pc < patchCount; pc++) {
                    patches.push({ pr, pc });
                }
            }
            // Fisher-Yates shuffle to randomize patch order
            for (let i = patches.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [patches[i], patches[j]] = [patches[j], patches[i]];
            }

            // Probability to spawn a mid-LOD impostor for a given clump
            // Set to 1.0 to replace all 3D blades with mid-plane impostors (flat textured planes)
            const midSpawnProb = 1.0;

            // Process patches in random order, maintaining clumping by patch
            for (const patch of patches) {
                if (idx >= finalInstanceCount) break;
                const { pr, pc } = patch;
                const cx = pc * patchSize - half;
                const cz = pr * patchSize - half;

                // Randomized blade count per patch (adds variation to density)
                const bladesInThisPatch = Math.floor((bladesPerPatchGrid * bladesPerPatchGrid) * (0.5 + Math.random() * 0.5));

                // Spawn blades randomly within patch (no regular grid)
                for (let b = 0; b < bladesInThisPatch && idx < finalInstanceCount; b++) {
                    // Random position within patch
                    const randomX = cx + (Math.random() - 0.5) * patchSize;
                    const randomZ = cz + (Math.random() - 0.5) * patchSize;

                    // Spawn main blade + extra blades around it with randomness
                    const spawnCount = 1 + Math.max(0, Math.floor(extraPerBlade * (0.6 + Math.random() * 0.4)));
                    for (let s = 0; s < spawnCount && idx < finalInstanceCount; s++) {
                        // Large jitter for extra blades around random position
                        const clumpJitterX = (Math.random() - 0.5) * patchSize * 0.3; // tighter clumps
                        const clumpJitterZ = (Math.random() - 0.5) * patchSize * 0.3; // tighter clumps
                        const x = randomX + clumpJitterX;
                        const z = randomZ + clumpJitterZ;
                        const y = 0.3 + (this.grassYOffset || 0);
                        const ry = Math.random() * Math.PI * 2;

                            // Decide mid-LOD spawn before committing the 3D instance matrix
                            const spawnMid = Math.random() < midSpawnProb;
                            if (spawnMid) {
                                // keep a mid impostor near this location; hide the 3D blade by scaling to near-zero
                                tmpDummy.position.set(x, y, z);
                                tmpDummy.rotation.set(0, ry, 0);
                                tmpDummy.scale.set(0.0001, 0.0001, 0.0001);
                                tmpDummy.updateMatrix();
                                this.mesh.setMatrixAt(idx, tmpDummy.matrix);
                                this.instanceHidden[idx] = 1;
                            } else {
                                tmpDummy.position.set(x, y, z);
                                tmpDummy.rotation.set(0, ry, 0);
                                tmpDummy.scale.set(1, 1, 1);
                                tmpDummy.updateMatrix();
                                this.mesh.setMatrixAt(idx, tmpDummy.matrix);
                                this.instanceHidden[idx] = 0;
                            }

                        // slightly darker green per blade
                        if (this.mesh.setColorAt) {
                            const baseColor = new THREE.Color(0x2e7d32);
                            const shade = 0.6 + Math.random() * 0.25; // darker variations
                            baseColor.multiplyScalar(shade);
                            this.mesh.setColorAt(idx, baseColor);
                        }

                        // store base transforms for CPU animation
                        this.instancePositions[idx * 3 + 0] = x;
                        this.instancePositions[idx * 3 + 1] = y;
                        this.instancePositions[idx * 3 + 2] = z;
                        this.instanceRotY[idx] = ry;
                        this.instanceJitter[idx] = Math.random() * Math.PI * 2;

                        // If we hid this 3D blade above, also register a mid-LOD plane clump at/near this location
                        if (this.instanceHidden[idx]) {
                            const mx = x + (Math.random() - 0.5) * patchSize * 0.12;
                            const mz = z + (Math.random() - 0.5) * patchSize * 0.12;
                            const mscale = 2.5 + Math.random() * 3.5; // thicker grass blades
                            midPositions.push(mx, y + (this.grassYOffset || 0), mz);
                            midRot.push(Math.random() * Math.PI * 2);
                            midScale.push(mscale);
                            midJitter.push(Math.random() * Math.PI * 2);
                        }

                        idx++;
                    }
                }
            }
            this.instanceCount = idx; // actual used instances
            this.maxInstancesForLOD = idx; // total instances (used for LOD check)

            // Create mid-LOD crossed planes if any mid entries were collected
            const midCount = Math.floor(midPositions.length / 3);
            this.midInstanceCount = midCount;
            // persist mid arrays on the instance so update() can animate them
            this.midPositions = new Float32Array(midPositions);
            this.midRot = new Float32Array(midRot);
            this.midScale = new Float32Array(midScale);
            this.midJitter = new Float32Array(midJitter);
            if (midCount > 0) {
                // Create two instanced meshes (crossed planes) sharing a material
                const planeGeom = new THREE.PlaneGeometry(1, 1);
                const midMat = new THREE.MeshStandardMaterial({
                    alphaTest: 0.45,
                    side: THREE.DoubleSide,
                    transparent: false,
                    roughness: 1.0,
                    metalness: 0.0,
                    depthWrite: true,
                    depthTest: true
                });

                // Merge two plane geometries (one rotated 90deg) into a single geometry
                const planeA = new THREE.PlaneGeometry(1, 1);
                const planeB = new THREE.PlaneGeometry(1, 1);
                planeB.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2));
                const merged = mergeTwoGeometries(planeA, planeB);

                this.midMesh = new THREE.InstancedMesh(merged, midMat, midCount);
                this.midMesh.frustumCulled = true;
                this.midMesh.renderOrder = 1; // Render grass after ground (renderOrder 0)
                this.scene.add(this.midMesh);

                // Provide a visible fallback so grass appears immediately while atlas loads
                midMat.color = new THREE.Color(0x2e7d32);
                midMat.transparent = false;
                midMat.opacity = 1.0;
                midMat.alphaTest = 0.0;
                // Do NOT hide the original 3D mesh yet — wait until atlas successfully loads

                // apply transforms for each mid instance (single set, merged geometry contains both planes)
                for (let i = 0; i < midCount; i++) {
                    const mx = midPositions[i * 3 + 0];
                    const my = midPositions[i * 3 + 1];
                    const mz = midPositions[i * 3 + 2];
                    const myaw = midRot[i];
                    const mscale = midScale[i];

                    tmpDummy.position.set(mx, my, mz);
                    tmpDummy.rotation.set(0, myaw, 0);
                    // Make mid-plane impostors a bit taller (increase Y scale) for better silhouette
                    tmpDummy.scale.set(mscale * (this.midPlaneWidthScale || 1.0), mscale * (this.midPlaneHeightScale || 1.6), 1);
                    tmpDummy.updateMatrix();
                    this.midMesh.setMatrixAt(i, tmpDummy.matrix);
                }

                // Load atlas texture and bump (prefer 1024, fall back to 512)
                const texLoader = new THREE.TextureLoader();
                const tryLoadAtlas = (size, onSuccess, onFail) => {
                    const path = `/assets/materials/grass/grass_atlas_${size}.png`;
                    texLoader.load(path, onSuccess, undefined, onFail);
                };

                // Try 1024 then 512 for atlas
                tryLoadAtlas('1024', (atlas) => {
                    atlas.wrapS = THREE.RepeatWrapping;
                    atlas.wrapT = THREE.RepeatWrapping;
                    atlas.encoding = THREE.sRGBEncoding;
                    midMat.map = atlas;
                    // For debug: log atlas size
                    // Create a CanvasTexture from the loaded image to ensure proper upload to GPU
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
                        canvasTex.encoding = THREE.sRGBEncoding;
                        canvasTex.format = THREE.RGBAFormat;
                        canvasTex.generateMipmaps = true;
                        canvasTex.minFilter = THREE.LinearMipmapLinearFilter;
                        canvasTex.needsUpdate = true;

                        midMat.map = canvasTex;
                        // Use alphaTest (cutout) for reliable WebGPU transparency; avoid blended transparency to reduce sorting issues
                        midMat.alphaTest = 0.45;
                        midMat.transparent = false;
                        midMat.depthWrite = false;
                        midMat.side = THREE.DoubleSide;
                        midMat.needsUpdate = true;
                        // atlas loaded — hide original 3D blades and ensure mid mesh visible
                        try { this.mesh.visible = false; } catch (e) {}
                        try { this.midMesh.visible = true; } catch (e) {}

                    } catch (e) {
                        console.warn('Grass: canvas translation failed, using atlas image directly', e);
                        midMat.map = atlas;
                        midMat.needsUpdate = true;
                    }
                }, () => {
                    tryLoadAtlas('512', (atlas) => {
                        atlas.wrapS = THREE.RepeatWrapping;
                        atlas.wrapT = THREE.RepeatWrapping;
                        atlas.encoding = THREE.sRGBEncoding;
                        midMat.map = atlas;
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
                            canvasTex.encoding = THREE.sRGBEncoding;
                            canvasTex.needsUpdate = true;

                            midMat.map = canvasTex;
                            midMat.alphaTest = 0.45;
                            midMat.transparent = false;
                            midMat.depthWrite = false;
                            midMat.side = THREE.DoubleSide;
                            midMat.needsUpdate = true;
                            try { this.mesh.visible = false; } catch (e) {}
                            try { this.midMesh.visible = true; } catch (e) {}
                            try {
                                const dbgGeo = new THREE.PlaneGeometry(6, 6);
                                const dbgMat = new THREE.MeshBasicMaterial({ map: canvasTex, side: THREE.DoubleSide });
                                const dbg = new THREE.Mesh(dbgGeo, dbgMat);
                                if (this.camera) {
                                    const cp = this.camera.position.clone();
                                    const dir = new THREE.Vector3();
                                    this.camera.getWorldDirection(dir);
                                    dbg.position.copy(cp.add(dir.multiplyScalar(5)));
                                    dbg.lookAt(this.camera.position);
                                } else {
                                    dbg.position.set(0, 2, 0);
                                }
                                this.scene.add(dbg);
                                setTimeout(() => { try { this.scene.remove(dbg); dbg.geometry.dispose(); dbgMat.dispose(); } catch (e) {} }, 4000);
                            } catch (e) {}
                        } catch (e) {
                            console.warn('Grass: canvas translation failed, using atlas image directly', e);
                            midMat.map = atlas;
                            midMat.needsUpdate = true;
                        }
                    }, () => {
                        console.warn('Failed to load grass atlas (1024 & 512), mid-LOD will use flat material');
                        // keep original 3D blades visible as fallback
                        midMat.alphaTest = 0; // no alpha test when no atlas
                        midMat.transparent = false;
                        midMat.needsUpdate = true;
                    });
                });

                // Try bump map 1024 then 512
                const tryLoadBump = (size) => {
                    const path = `/assets/materials/grass/grass_atlas_${size}_bump.png`;
                    texLoader.load(path, (bump) => {
                        bump.wrapS = THREE.RepeatWrapping;
                        bump.wrapT = THREE.RepeatWrapping;
                        midMat.bumpMap = bump;
                        midMat.bumpScale = 0.3;
                        midMat.needsUpdate = true;
                    }, undefined, () => {
                        // ignore failure; we'll try fallback or skip
                    });
                };
                tryLoadBump('1024');
                tryLoadBump('512');
            }

            // Ensure instance colors update (if used)
            if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

            // Force instance matrix update
            this.mesh.instanceMatrix.needsUpdate = true;
        }, undefined, (error) => {
        });
    }

    update(deltaTime) {
        if (!this.mesh) return;

        this.time += deltaTime;

        // CPU-driven sway animation with batching for performance
        const tmp = this.dummy;
        const t = this.time;
        const count = this.instanceCount || 0;
        const batches = 2; // Update in 2 batches per frame for better performance
        const batchSize = Math.ceil(count / batches);
        const batchIndex = this._animateIndex % batches;
        const start = batchIndex * batchSize;
        const end = Math.min(start + batchSize, count);

        // Get camera position for LOD check
        const cameraPos = this.camera ? this.camera.position : null;
        const lodDistSq = this.lodDistance * this.lodDistance;

        for (let i = start; i < end; i++) {
            const bx = this.instancePositions[i * 3 + 0];
            const by = this.instancePositions[i * 3 + 1];
            const bz = this.instancePositions[i * 3 + 2];
            const baseRy = this.instanceRotY[i];
            const jitter = this.instanceJitter[i] || 0;
            // skip animating instances that were hidden (use mid impostor instead)
            if (this.instanceHidden && this.instanceHidden[i]) continue;

            // LOD: only animate if within lodDistance from camera
            let shouldAnimate = true;
            if (cameraPos) {
                const dx = bx - cameraPos.x;
                const dz = bz - cameraPos.z;
                const distSq = dx * dx + dz * dz;
                shouldAnimate = distSq < lodDistSq;
            }

            if (shouldAnimate) {
                // wind strength based on world X/Z
                const windPower = 0.5 + (Math.sin((bx + bz) * 0.01) * 0.5);
                const sway = Math.sin((bx * 0.05) + t * 2.5 + jitter) * 0.15 * windPower;

                // Keep base anchored: position stays at base, apply small tilt rotations around X/Z
                const tiltX = sway * 0.6; // tilt forward/back
                const tiltZ = sway * 0.3; // tilt side

                tmp.position.set(bx, by, bz);
                tmp.rotation.set(tiltX, baseRy, tiltZ);
            } else {
                // Outside LOD: static pose (base position, base rotation)
                tmp.position.set(bx, by, bz);
                tmp.rotation.set(0, baseRy, 0);
            }
            tmp.updateMatrix();
            this.mesh.setMatrixAt(i, tmp.matrix);
        }

        this._animateIndex = (this._animateIndex + 1) % batches;
        this.mesh.instanceMatrix.needsUpdate = true;

        // --- mid-LOD plane animation (crossed planes) ---
        if (this.midMesh && this.midInstanceCount > 0) {
            const midCount = this.midInstanceCount || 0;
            const midBatches = 2; // 2 batches per frame for better performance
            const midBatchSize = Math.ceil(midCount / midBatches);
            const midStart = batchIndex * midBatchSize;
            const midEnd = Math.min(midStart + midBatchSize, midCount);
            const midLodDistSq = this.lodMid * this.lodMid;

            for (let i = midStart; i < midEnd; i++) {
                const mx = this.midPositions[i * 3 + 0];
                const my = this.midPositions[i * 3 + 1];
                const mz = this.midPositions[i * 3 + 2];
                const baseYaw = this.midRot[i] || 0;
                const jitter = this.midJitter[i] || 0;

                let shouldAnimate = true;
                if (cameraPos) {
                    const dx = mx - cameraPos.x;
                    const dz = mz - cameraPos.z;
                    const distSq = dx * dx + dz * dz;
                    shouldAnimate = distSq < midLodDistSq;
                }

                if (shouldAnimate) {
                    const sway = Math.sin(t * 1.8 + jitter) * 0.12;
                    const tiltX = sway * 0.35;

                    tmp.position.set(mx, my, mz);
                    tmp.rotation.set(tiltX, baseYaw, 0);
                    const s = this.midScale[i] || 1.0;
                    // Increase Y scale at runtime to match taller impostors
                    tmp.scale.set(s * (this.midPlaneWidthScale || 1.0), s * (this.midPlaneHeightScale || 1.6), 1);
                } else {
                    tmp.position.set(mx, my, mz);
                    tmp.rotation.set(0, baseYaw, 0);
                    const s = this.midScale[i] || 1.0;
                    tmp.scale.set(s * 0.9, s * 1.15, 1);
                }
                tmp.updateMatrix();
                this.midMesh.setMatrixAt(i, tmp.matrix);
            }
            this.midMesh.instanceMatrix.needsUpdate = true;
        }
    }
}