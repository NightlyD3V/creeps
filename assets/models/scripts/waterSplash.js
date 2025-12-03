import * as THREE from 'three/webgpu'

export class WaterSplash {
    constructor(scene, groundMesh) {
        this.scene = scene;
        this.groundMesh = groundMesh;
        this.time = 0;
        this.splashes = []; // Array of splash events
        this.maxSplashes = 50;
        this.spawnTimer = 0;
        this.spawnInterval = 0.05; // Create a splash every 50ms
    }

    init() {
        // Create ring geometry for ripple effect
        this.ringGeom = new THREE.RingGeometry(0.3, 0.5, 16);
        this.ringGeom.rotateX(-Math.PI / 2); // Lay flat on ground
        
        // Create small droplet splash geometry (flattened sphere for initial impact)
        this.dropletGeom = new THREE.SphereGeometry(0.15, 8, 4);
        this.dropletGeom.scale(1, 0.3, 1); // Flatten it
        
        // Ring material - subtle white ripple
        this.ringMat = new THREE.MeshBasicMaterial({ 
            color: 0xffffff,
            transparent: true,
            opacity: 0.4,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        
        // Droplet material - brighter initial splash
        this.dropletMat = new THREE.MeshBasicMaterial({
            color: 0xddeeff,
            transparent: true,
            opacity: 0.6,
            depthWrite: false
        });
    }

    addSplash(position, intensity = 1.0) {
        if (this.splashes.length >= this.maxSplashes) return;
        
        // Randomize splash size
        const sizeVariation = 0.5 + Math.random() * 1.0;
        
        const splash = {
            position: position.clone(),
            time: 0,
            intensity: intensity,
            maxDuration: 0.4 + Math.random() * 0.3, // 0.4-0.7 seconds
            size: sizeVariation,
            rings: [],
            droplet: null
        };
        
        // Create initial droplet impact
        const droplet = new THREE.Mesh(this.dropletGeom, this.dropletMat.clone());
        droplet.position.copy(position);
        droplet.position.y += 0.05;
        droplet.scale.setScalar(sizeVariation * 0.8);
        this.scene.add(droplet);
        splash.droplet = droplet;
        
        // Create 2-3 expanding rings
        const ringCount = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < ringCount; i++) {
            const ring = new THREE.Mesh(this.ringGeom, this.ringMat.clone());
            ring.position.copy(position);
            ring.position.y += 0.02 + i * 0.01; // Slight vertical offset
            ring.scale.setScalar(0.1);
            ring.userData.delay = i * 0.08; // Stagger ring expansion
            ring.userData.started = false;
            this.scene.add(ring);
            splash.rings.push(ring);
        }
        
        this.splashes.push(splash);
    }

    update(deltaTime) {
        this.time += deltaTime;
        this.spawnTimer += deltaTime;
        
        // Auto-spawn random splashes on the ground (simulating rain impact)
        if (this.spawnTimer > this.spawnInterval) {
            // Spawn splashes near camera for better visibility
            const randomX = (Math.random() - 0.5) * 200;
            const randomZ = (Math.random() - 0.5) * 200;
            const intensity = 0.5 + Math.random() * 0.5;
            this.addSplash(new THREE.Vector3(randomX, 0.1, randomZ), intensity);
            this.spawnTimer = 0;
        }
        
        // Update existing splashes
        for (let i = this.splashes.length - 1; i >= 0; i--) {
            const splash = this.splashes[i];
            splash.time += deltaTime;
            
            const progress = splash.time / splash.maxDuration;
            
            // Update droplet (quick fade and slight scale up)
            if (splash.droplet) {
                const dropletProgress = Math.min(splash.time / 0.15, 1); // Fade in 0.15s
                splash.droplet.material.opacity = 0.6 * (1 - dropletProgress);
                splash.droplet.scale.setScalar(splash.size * (0.8 + dropletProgress * 0.4));
                
                if (dropletProgress >= 1) {
                    this.scene.remove(splash.droplet);
                    splash.droplet.material.dispose();
                    splash.droplet = null;
                }
            }
            
            // Update rings (expand outward and fade)
            for (let j = splash.rings.length - 1; j >= 0; j--) {
                const ring = splash.rings[j];
                const ringTime = splash.time - ring.userData.delay;
                
                if (ringTime < 0) continue; // Not started yet
                
                const ringDuration = splash.maxDuration * 0.8;
                const ringProgress = Math.min(ringTime / ringDuration, 1);
                
                // Expand ring outward
                const scale = splash.size * (0.3 + ringProgress * 2.5);
                ring.scale.setScalar(scale);
                
                // Fade out as it expands
                const fadeOut = 1 - Math.pow(ringProgress, 0.5); // Faster initial fade
                ring.material.opacity = 0.35 * fadeOut * splash.intensity;
                
                // Remove finished rings
                if (ringProgress >= 1) {
                    this.scene.remove(ring);
                    ring.material.dispose();
                    splash.rings.splice(j, 1);
                }
            }
            
            // Remove splash when all effects are done
            if (progress >= 1 && splash.rings.length === 0 && !splash.droplet) {
                this.splashes.splice(i, 1);
            }
        }
    }

    dispose() {
        for (const splash of this.splashes) {
            if (splash.droplet) {
                this.scene.remove(splash.droplet);
                splash.droplet.material.dispose();
            }
            for (const ring of splash.rings) {
                this.scene.remove(ring);
                ring.material.dispose();
            }
        }
        this.splashes = [];
        this.ringGeom.dispose();
        this.dropletGeom.dispose();
        this.ringMat.dispose();
        this.dropletMat.dispose();
    }
}
