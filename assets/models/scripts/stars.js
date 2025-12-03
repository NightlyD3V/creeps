import * as THREE from 'three/webgpu'

// STARS - High altitude point particles that don't interfere with fog
export function Stars(scene) {
    const starCount = 800;
    
    // Create geometry with positions
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);
    const sizes = new Float32Array(starCount);
    const colors = new Float32Array(starCount * 3);
    
    for (let i = 0; i < starCount; i++) {
        // Distribute stars in a dome above the player
        const theta = Math.random() * Math.PI * 2; // Around
        const phi = Math.random() * Math.PI * 0.4; // Only upper hemisphere, not too low
        const radius = 400 + Math.random() * 100; // Far away, beyond fog
        
        positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = radius * Math.cos(phi) + 50; // High up
        positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
        
        // Vary sizes - mostly small
        const sizeRand = Math.random();
        if (sizeRand < 0.8) {
            sizes[i] = 1 + Math.random() * 1.5;
        } else if (sizeRand < 0.95) {
            sizes[i] = 2 + Math.random() * 2;
        } else {
            sizes[i] = 3 + Math.random() * 2; // Few bright ones
        }
        
        // Slight color variation - dim whites and blues
        const colorVariant = Math.random();
        if (colorVariant < 0.7) {
            // Dim white
            colors[i * 3] = 0.6 + Math.random() * 0.2;
            colors[i * 3 + 1] = 0.6 + Math.random() * 0.2;
            colors[i * 3 + 2] = 0.7 + Math.random() * 0.2;
        } else if (colorVariant < 0.9) {
            // Cool blue
            colors[i * 3] = 0.5 + Math.random() * 0.2;
            colors[i * 3 + 1] = 0.6 + Math.random() * 0.2;
            colors[i * 3 + 2] = 0.8 + Math.random() * 0.2;
        } else {
            // Warm yellow
            colors[i * 3] = 0.8 + Math.random() * 0.2;
            colors[i * 3 + 1] = 0.7 + Math.random() * 0.2;
            colors[i * 3 + 2] = 0.5 + Math.random() * 0.2;
        }
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    // Simple point material - fog: false so stars aren't dimmed
    const material = new THREE.PointsMaterial({
        size: 2,
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        opacity: 0.7,
        fog: false, // KEY: Stars ignore fog
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    
    const stars = new THREE.Points(geometry, material);
    stars.renderOrder = -1; // Render behind everything
    scene.add(stars);
    
    return stars;
}
