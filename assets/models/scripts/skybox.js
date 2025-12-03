import * as THREE from 'three/webgpu'

// STARRY NIGHT SKYBOX
export function Skybox(scene) {
    // Create a large sphere for the sky dome
    const skyGeometry = new THREE.SphereGeometry(500, 32, 32);
    
    // Create canvas for starry night texture
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    
    // Night sky gradient - very dark
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#000205'); // Almost black at top
    gradient.addColorStop(0.3, '#030810'); // Very dark blue
    gradient.addColorStop(0.6, '#050c15'); // Slightly lighter
    gradient.addColorStop(1, '#030508'); // Very dark at horizon
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Add stars - fewer and dimmer
    const starCount = 1500;
    for (let i = 0; i < starCount; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height * 0.85; // Stars mostly above horizon
        
        // Vary star sizes and brightness - much dimmer overall
        const size = Math.random();
        const brightness = 0.15 + Math.random() * 0.35;
        
        if (size < 0.8) {
            // Small dim stars (majority)
            ctx.fillStyle = `rgba(255, 255, 255, ${brightness * 0.3})`;
            ctx.fillRect(x, y, 1, 1);
        } else if (size < 0.97) {
            // Medium stars
            ctx.fillStyle = `rgba(255, 255, 255, ${brightness * 0.4})`;
            ctx.beginPath();
            ctx.arc(x, y, 1, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // Bright stars with subtle glow - still dim
            const starColors = [
                [200, 200, 210],   // Dim white
                [200, 190, 180],   // Dim warm
                [180, 190, 200],   // Dim cool
            ];
            const color = starColors[Math.floor(Math.random() * starColors.length)];
            
            // Subtle glow effect
            const glowGradient = ctx.createRadialGradient(x, y, 0, x, y, 3);
            glowGradient.addColorStop(0, `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${brightness * 0.5})`);
            glowGradient.addColorStop(0.4, `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${brightness * 0.15})`);
            glowGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = glowGradient;
            ctx.fillRect(x - 3, y - 3, 6, 6);
            
            // Core
            ctx.fillStyle = `rgba(220, 220, 230, ${brightness * 0.6})`;
            ctx.beginPath();
            ctx.arc(x, y, 1, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    // Much subtler nebula effect
    for (let i = 0; i < 4; i++) {
        const cx = canvas.width * 0.3 + Math.random() * canvas.width * 0.4;
        const cy = canvas.height * 0.2 + Math.random() * canvas.height * 0.3;
        const nebulaGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, 100 + Math.random() * 80);
        const hue = 220 + Math.random() * 40; // Blue-purple range
        nebulaGradient.addColorStop(0, `hsla(${hue}, 30%, 15%, 0.02)`);
        nebulaGradient.addColorStop(0.5, `hsla(${hue}, 20%, 10%, 0.01)`);
        nebulaGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = nebulaGradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    const skyTexture = new THREE.CanvasTexture(canvas);
    skyTexture.mapping = THREE.EquirectangularReflectionMapping;
    
    const skyMaterial = new THREE.MeshBasicMaterial({
        map: skyTexture,
        side: THREE.BackSide,
        fog: false
    });
    
    const skyMesh = new THREE.Mesh(skyGeometry, skyMaterial);
    scene.add(skyMesh);
    
    return skyMesh;
}