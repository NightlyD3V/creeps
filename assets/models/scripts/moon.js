import * as THREE from 'three/webgpu'

export function Moon(scene, camera) {
    const textureLoader = new THREE.TextureLoader();
    
    // Load real moon texture - note the double underscores in filename
    const moonTexture = textureLoader.load('/assets/materials/moon__luna__texture_map.jpg', 
        (texture) => {
            console.log('Moon texture loaded successfully');
            texture.colorSpace = THREE.SRGBColorSpace;
            moon.material.needsUpdate = true;
        },
        undefined,
        (err) => {
            console.error('Failed to load moon texture:', err);
        }
    );
    moonTexture.colorSpace = THREE.SRGBColorSpace;
    
    // Create moon sphere - smaller and further away to fit with stars
    const moonGeometry = new THREE.SphereGeometry(15, 64, 64);
    
    // Moon material - MeshBasicMaterial so it's self-lit like the stars
    const moonMaterial = new THREE.MeshBasicMaterial({
        map: moonTexture,
        color: 0xaabbcc, // Slight cool tint
        fog: false
    });
    
    const moon = new THREE.Mesh(moonGeometry, moonMaterial);
    moon.position.set(-150, 280, -300); // Much higher and further, like a real moon
    moon.rotation.y = Math.PI * 0.3; // Rotate to show textured side
    scene.add(moon);
    
    // Soft atmospheric glow - larger and more subtle
    const glowGeometry = new THREE.SphereGeometry(20, 32, 32);
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0x8899bb,
        transparent: true,
        opacity: 0.08,
        side: THREE.BackSide,
        fog: false
    });
    const moonGlow = new THREE.Mesh(glowGeometry, glowMaterial);
    moonGlow.position.copy(moon.position);
    scene.add(moonGlow);
    
    // Outer haze - very subtle atmospheric scattering
    const hazeGeometry = new THREE.SphereGeometry(35, 32, 32);
    const hazeMaterial = new THREE.MeshBasicMaterial({
        color: 0x6677aa,
        transparent: true,
        opacity: 0.03,
        side: THREE.BackSide,
        fog: false
    });
    const moonHaze = new THREE.Mesh(hazeGeometry, hazeMaterial);
    moonHaze.position.copy(moon.position);
    scene.add(moonHaze);
    
    // Very subtle moonlight
    const moonLight = new THREE.DirectionalLight(0x4466aa, 0.15);
    moonLight.position.copy(moon.position);
    moonLight.target.position.set(0, 0, 0);
    scene.add(moonLight);
    scene.add(moonLight.target);
    
    // === LENS FLARE EFFECT ===
    // Create lens flare elements (sprites that face camera)
    const flareElements = [];
    
    // Main flare (bright center)
    const createFlareSprite = (size, color, opacity) => {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        
        const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        gradient.addColorStop(0, `rgba(255, 255, 255, ${opacity})`);
        gradient.addColorStop(0.2, color);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 128, 128);
        
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false
        });
        
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(size, size, 1);
        sprite.visible = false;
        scene.add(sprite);
        return sprite;
    };
    
    // Create hexagonal flare element
    const createHexFlare = (size, color, opacity) => {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
            const x = 64 + Math.cos(angle) * 50;
            const y = 64 + Math.sin(angle) * 50;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        
        const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 50);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.globalAlpha = opacity;
        ctx.fill();
        
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false
        });
        
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(size, size, 1);
        sprite.visible = false;
        scene.add(sprite);
        return sprite;
    };
    
    // Main bright flare at moon
    const mainFlare = createFlareSprite(25, 'rgba(200, 220, 255, 0.3)', 0.8);
    flareElements.push({ sprite: mainFlare, offset: 0 });
    
    // Secondary flares along the line from moon to screen center
    flareElements.push({ sprite: createHexFlare(8, 'rgba(150, 180, 255, 0.2)', 0.3), offset: 0.3 });
    flareElements.push({ sprite: createFlareSprite(4, 'rgba(100, 150, 255, 0.15)', 0.4), offset: 0.5 });
    flareElements.push({ sprite: createHexFlare(12, 'rgba(180, 200, 255, 0.1)', 0.2), offset: 0.7 });
    flareElements.push({ sprite: createFlareSprite(6, 'rgba(200, 220, 255, 0.2)', 0.5), offset: 1.0 });
    flareElements.push({ sprite: createHexFlare(15, 'rgba(120, 160, 255, 0.08)', 0.15), offset: 1.3 });
    flareElements.push({ sprite: createFlareSprite(3, 'rgba(255, 255, 255, 0.3)', 0.6), offset: 1.6 });
    
    // Update function for lens flare
    const updateLensFlare = (camera) => {
        const moonScreenPos = moon.position.clone().project(camera);
        
        // Check if moon is in front of camera
        const moonDir = moon.position.clone().sub(camera.position).normalize();
        const cameraDir = new THREE.Vector3();
        camera.getWorldDirection(cameraDir);
        const dot = moonDir.dot(cameraDir);
        
        // Calculate how centered the moon is (for intensity)
        const distFromCenter = Math.sqrt(moonScreenPos.x * moonScreenPos.x + moonScreenPos.y * moonScreenPos.y);
        const visibility = Math.max(0, 1 - distFromCenter * 0.8);
        const isVisible = dot > 0 && Math.abs(moonScreenPos.x) < 1.2 && Math.abs(moonScreenPos.y) < 1.2;
        
        for (const flare of flareElements) {
            if (isVisible && visibility > 0.1) {
                flare.sprite.visible = true;
                
                // Position flare along line from moon through screen center
                const flareX = moonScreenPos.x * (1 - flare.offset * 2);
                const flareY = moonScreenPos.y * (1 - flare.offset * 2);
                
                // Convert back to world position
                const flareScreenPos = new THREE.Vector3(flareX, flareY, 0.99);
                flareScreenPos.unproject(camera);
                
                const dir = flareScreenPos.sub(camera.position).normalize();
                const distance = 50;
                flare.sprite.position.copy(camera.position).add(dir.multiplyScalar(distance));
                
                // Fade based on how centered moon is
                flare.sprite.material.opacity = visibility * (flare.offset === 0 ? 1 : 0.6);
            } else {
                flare.sprite.visible = false;
            }
        }
    };
    
    return {
        moon,
        moonGlow,
        moonHaze,
        moonLight,
        update: updateLensFlare
    };
}