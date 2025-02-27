import * as THREE from 'three'

export function Fire(camera, uniforms) {
    console.log("FIRE")
    // SHADER 
    const vertexShader = `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
        `;
    
        const fragmentShader = `
        varying vec2 vUv;
        uniform float uTime;
        uniform vec3 uFireColor;
        void main() {
            vec2 uv = vUv;
            float time = uTime * 0.5;

            // Distort UVs with noise (vertical distortion)
            float noise = sin(uv.x * 10.0 + time) * cos(uv.y * 10.0 + time) * 0.1;
            uv.y += noise; // Apply distortion only to the Y coordinate

            // Create a vertical gradient (pointing upwards)
            float radial = 1.0 - smoothstep(0.7, uv.y, 8.0); // Adjust smoothstep for vertical gradient

            // Apply noise-based color variation
            float colorNoise = sin(uv.x * 20.0 + time * 2.0) * cos(uv.y * 10.0 + time * 2.0) * 0.5 + 0.5;
            vec3 fireColor = mix(uFireColor * 1.2, uFireColor * 0.8, colorNoise);

            // Apply time-based pulsing
            float pulse = sin(time * 3.0) * 0.2 + 1.0;
            radial *= pulse;

            // Apply color based on radial gradient and noise
            vec3 color = fireColor * radial;

            // Add some glow
            color += fireColor * radial * 0.5;

            gl_FragColor = vec4(color, radial);
        }
        `;
        const geometry = new THREE.SphereGeometry(0.15, 24, 24);
        const material = new THREE.ShaderMaterial({
          uniforms: {
            uTime: { value: 0.0 },
            uFireColor: { value: new THREE.Color(1.0, 0.0, 0.0) }, // Orange fire
          },
          vertexShader: vertexShader,
          fragmentShader: fragmentShader,
          blending: THREE.AdditiveBlending, // Additive blending for glow
          depthTest: false, // Disable depth writing
        });
    // END SHADER
    // ANIMATION 
    // Animation Loop
    function animate() {
        material.uniforms.uTime.value = performance.now() / 1000.0;
        requestAnimationFrame(animate);
    }

    // Start the animation loop
    animate();

    // CREATE PLANE 
    const fireball = new THREE.Mesh(geometry, material);
    // fireball.rotation.set(-1,0,-0.5)
    fireball.position.set( -2.0,-0.8,-2.0 )
    camera.add(fireball);
}