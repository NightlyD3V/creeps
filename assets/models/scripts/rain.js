import * as THREE from 'three/webgpu'

export class Rain {
    constructor(scene, camera, worldSize = 500) {
        this.scene = scene;
        this.camera = camera;
        this.worldSize = worldSize;
        this.enabled = false;
        this.time = 0;
        this.dummy = new THREE.Object3D();
        this._updateIndex = 0;
    }

    init() {
        // WebGPU max uniform buffer is 65536 bytes. Each instance = 64 bytes.
        // Max safe instances = 65536 / 64 = 1024
        const dropCount = 1000;
        
        // Create VERY thin line-like geometry for rain drops - more like actual rain streaks
        const rainGeom = new THREE.PlaneGeometry(0.5, 2.5); // Much thinner width
        
        // Create a raindrop texture (white with transparent edges)
        const canvas = document.createElement('canvas');
        canvas.width = 4;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        
        // Draw a raindrop shape - narrow at top, wider at bottom
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        for (let y = 0; y < canvas.height; y++) {
            const progress = y / canvas.height;
            const width = Math.sin(progress * Math.PI) * 1.5 + 0.5; // Varies width
            ctx.fillRect(2 - width / 2, y, width, 1);
        }
        
        const rainTexture = new THREE.CanvasTexture(canvas);
        rainTexture.magFilter = THREE.LinearFilter;
        rainTexture.minFilter = THREE.LinearFilter;
        
        const rainMat = new THREE.MeshStandardMaterial({
            map: rainTexture,
            color: 0xffffff,
            transparent: true,
            opacity: 0.85,
            roughness: 0.2,
            metalness: 0.05,
            side: THREE.DoubleSide,
            depthWrite: false,
            emissive: 0x4488ff,
            emissiveIntensity: 0.15
        });

        this.mesh = new THREE.InstancedMesh(rainGeom, rainMat, dropCount);
        this.mesh.castShadow = false;
        this.mesh.receiveShadow = false;
        this.mesh.renderOrder = 2;
        this.scene.add(this.mesh);

        // Initialize rain drop data
        this.positions = new Float32Array(dropCount * 3);
        this.velocities = new Float32Array(dropCount * 3);
        this.rotations = new Float32Array(dropCount);
        
        for (let i = 0; i < dropCount; i++) {
            // Random position across world
            this.positions[i * 3 + 0] = Math.random() * this.worldSize - this.worldSize / 2;
            this.positions[i * 3 + 1] = Math.random() * 80 + 20;
            this.positions[i * 3 + 2] = Math.random() * this.worldSize - this.worldSize / 2;

            // Velocity: very fast downward, wind drift
            this.velocities[i * 3 + 0] = (Math.random() - 0.5) * 15;
            this.velocities[i * 3 + 1] = -(140 + Math.random() * 60); // 140-200 units/sec
            this.velocities[i * 3 + 2] = (Math.random() - 0.5) * 15;
            
            // Random tilt (how much the drop is rotated)
            this.rotations[i] = Math.random() * Math.PI * 2;
        }

        this.dropCount = dropCount;
        this.batchSize = Math.ceil(dropCount / 4);
        this.enabled = false;
    }

    update(deltaTime) {
        if (!this.enabled || !this.mesh) return;

        this.time += deltaTime;
        const windPower = 0.5 + Math.sin(this.time * 0.3) * 0.3;

        // Batch update: only update 1/4 of drops per frame
        const batchIndex = this._updateIndex % 4;
        const start = batchIndex * this.batchSize;
        const end = Math.min(start + this.batchSize, this.dropCount);

        for (let i = start; i < end; i++) {
            const x = this.positions[i * 3 + 0];
            let y = this.positions[i * 3 + 1];
            const z = this.positions[i * 3 + 2];

            // Apply velocity
            const vx = this.velocities[i * 3 + 0] * windPower;
            const vy = this.velocities[i * 3 + 1];
            const vz = this.velocities[i * 3 + 2] * windPower;

            let newX = x + vx * deltaTime;
            let newY = y + vy * deltaTime;
            let newZ = z + vz * deltaTime;

            // Reset if falls below ground
            if (newY < 0) {
                newY = 100;
                newX = Math.random() * this.worldSize - this.worldSize / 2;
                newZ = Math.random() * this.worldSize - this.worldSize / 2;
            }

            // Wrap around world bounds
            if (newX < -this.worldSize / 2) newX += this.worldSize;
            if (newX > this.worldSize / 2) newX -= this.worldSize;
            if (newZ < -this.worldSize / 2) newZ += this.worldSize;
            if (newZ > this.worldSize / 2) newZ -= this.worldSize;

            this.positions[i * 3 + 0] = newX;
            this.positions[i * 3 + 1] = newY;
            this.positions[i * 3 + 2] = newZ;

            // Update instance matrix
            this.dummy.position.set(newX, newY, newZ);
            
            // Tilt drops to follow wind direction - more realistic falling angle
            const fallAngle = Math.atan2(vx, -vy);
            const tiltAmount = Math.min(Math.abs(vx) / 20, 0.7); // Cap tilt
            this.dummy.rotation.set(fallAngle * tiltAmount, this.rotations[i], 0);
            this.dummy.updateMatrix();
            this.mesh.setMatrixAt(i, this.dummy.matrix);
        }

        this._updateIndex = (this._updateIndex + 1) % 4;
        this.mesh.instanceMatrix.needsUpdate = true;
    }

    setIntensity(intensity) {
        // 0 = no rain, 1 = light rain, 2 = medium, 3 = heavy
        if (!this.mesh) return;

        const opacities = [0, 0.5, 0.7, 0.9];
        // Counts must not exceed dropCount (1000) - WebGPU uniform buffer limit
        const counts = [0, 300, 600, 1000];

        const idx = Math.max(0, Math.min(3, Math.floor(intensity)));
        this.mesh.material.opacity = opacities[idx];
        this.mesh.count = counts[idx];
        this.enabled = intensity > 0;
        this.mesh.visible = intensity > 0;
    }

    dispose() {
        if (this.mesh) {
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
            this.scene.remove(this.mesh);
        }
    }
}
