import * as THREE from 'three/webgpu';

export function Clouds(scene) {
    const cloudsGroup = new THREE.Group();
    scene.add(cloudsGroup);

    // Volumetric cloud parameters
    const cloudCount = 6;

    // Create individual volumetric clouds
    for (let i = 0; i < cloudCount; i++) {
        const cloud = createVolumetricCloud();
        
        // Distribute clouds closer to camera (within fog range)
        const angle = (i / cloudCount) * Math.PI * 2;
        const distance = 30 + i * 5; // Closer distances: 30-60 units
        const x = Math.cos(angle) * distance;
        const z = Math.sin(angle) * distance;
        const y = 50 + Math.random() * 10; // Height range 50-60
        
        cloud.position.set(x, y, z);
        cloud.scale.set(
            15 + Math.random() * 10,
            10 + Math.random() * 5,
            15 + Math.random() * 10
        );
        
        cloudsGroup.add(cloud);
    }

    // Animation state
    const cloudSpeed = 2; // Units per second
    const windDirection = new THREE.Vector3(1, 0, 0.3).normalize();
    let elapsedTime = 0;

    // Update function
    cloudsGroup.update = (delta) => {
        elapsedTime += delta;
        
        // Move clouds
        const windOffset = windDirection.clone().multiplyScalar(cloudSpeed * elapsedTime);
        
        const children = cloudsGroup.children;
        for (let i = 0; i < children.length; i++) {
            const cloud = children[i];
            const distance = 30 + i * 5;
            const angle = (i / children.length) * Math.PI * 2;
            const originalPos = new THREE.Vector3(
                Math.cos(angle) * distance,
                50 + (i / children.length) * 10,
                Math.sin(angle) * distance
            );
            
            cloud.position.copy(originalPos).add(windOffset);
            
            // Wrap around if cloud goes too far
            if (cloud.position.distanceTo(scene.position) > 100) {
                cloud.position.copy(originalPos);
            }
            
            // Face camera
            cloud.lookAt(scene.getObjectByProperty('isCamera', true) ? scene.getObjectByProperty('isCamera', true).position : scene.position);
        }
    };

    return cloudsGroup;
}

function createVolumetricCloud() {
    const cloudGroup = new THREE.Group();

    // Create cloud canvas texture with soft gradient edges
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    // Clear canvas
    ctx.fillStyle = 'rgba(0, 0, 0, 0)';
    ctx.fillRect(0, 0, 512, 512);
    
    // Draw soft cloud shape with gradients
    const gradient = ctx.createRadialGradient(256, 256, 50, 256, 256, 250);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 255)');
    gradient.addColorStop(0.5, 'rgba(200, 200, 200, 200)');
    gradient.addColorStop(1, 'rgba(150, 150, 150, 0)');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(256, 256, 200, 150, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Add some bumpy edges for cloud definition
    ctx.strokeStyle = 'rgba(180, 180, 180, 150)';
    ctx.lineWidth = 30;
    ctx.beginPath();
    ctx.ellipse(256, 256, 200, 150, 0, 0, Math.PI * 2);
    ctx.stroke();
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    
    // Create multiple rotated planes for volumetric depth
    const planeGeometry = new THREE.PlaneGeometry(1, 1);
    
    for (let i = 0; i < 3; i++) {
        const material = new THREE.MeshStandardMaterial({
            map: texture,
            transparent: true,
            opacity: 0.6 - (i * 0.15),
            roughness: 0.8,
            metalness: 0,
            emissive: new THREE.Color(0x666666),
            emissiveIntensity: 0.4,
            side: THREE.DoubleSide,
            fog: false,
            depthWrite: false
        });

        const mesh = new THREE.Mesh(planeGeometry, material);
        mesh.rotation.x = (Math.PI / 4) + (i * Math.PI / 6);
        mesh.rotation.y = (i * Math.PI / 3);
        mesh.rotation.z = (i * Math.PI / 8);
        mesh.scale.multiplyScalar(2.5);
        mesh.castShadow = false;
        mesh.receiveShadow = false;

        cloudGroup.add(mesh);
    }
    
    // Add inner lighter layer for depth
    const innerGeometry = new THREE.PlaneGeometry(1, 1);
    const innerMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0xeeeeee),
        transparent: true,
        opacity: 0.4,
        roughness: 0.9,
        metalness: 0,
        emissive: new THREE.Color(0x888888),
        emissiveIntensity: 0.3,
        side: THREE.DoubleSide,
        fog: false,
        depthWrite: false
    });
    
    const innerMesh = new THREE.Mesh(innerGeometry, innerMaterial);
    innerMesh.rotation.x = Math.PI / 3;
    innerMesh.scale.multiplyScalar(1.5);
    cloudGroup.add(innerMesh);

    return cloudGroup;
}
